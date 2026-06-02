//! `claim_holder_fees` instruction.
//!
//! Holder presents an inclusion proof against the committed merkle root for
//! a given epoch. On success the requested amount is transferred from the
//! protocol fee vault (a PDA) to the holder's wallet and a `HolderClaim`
//! receipt PDA is opened to permanently mark the claim as fulfilled.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;

use crate::constants::{CONFIG_SEED, DISTRIBUTION_SEED, FEE_VAULT_SEED, HOLDER_CLAIM_SEED};
use crate::errors::ColsError;
use crate::events::HolderClaimed;
use crate::state::{Config, Distribution, HolderClaim};
use crate::utils::{compute_distribution_leaf, verify_merkle_proof};

#[derive(Accounts)]
#[instruction(epoch: u64, amount: u64, proof: Vec<[u8; 32]>)]
pub struct ClaimHolderFees<'info> {
    /// Holder whose wallet receives the payout. Also the payer for the
    /// new receipt account.
    #[account(mut)]
    pub holder: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    /// Committed merkle root for the epoch being claimed.
    #[account(
        seeds = [DISTRIBUTION_SEED, epoch.to_le_bytes().as_ref()],
        bump = distribution.bump,
        constraint = distribution.epoch == epoch @ ColsError::EpochNotCommitted,
    )]
    pub distribution: Account<'info, Distribution>,

    /// Receipt PDA. Opening it on `init` is the source of double-claim
    /// protection: the second call hits `account already in use` which Anchor
    /// surfaces as the standard duplicate-account error. We additionally map
    /// the manual case below.
    #[account(
        init,
        payer = holder,
        space = HolderClaim::SIZE,
        seeds = [HOLDER_CLAIM_SEED, holder.key().as_ref(), epoch.to_le_bytes().as_ref()],
        bump,
    )]
    pub holder_claim: Account<'info, HolderClaim>,

    /// CHECK: Fee vault PDA. Holds the lamports being paid out. We treat it
    /// as a system-owned account whose lamports field we mutate directly via
    /// a system_instruction::transfer signed by the PDA seeds.
    #[account(
        mut,
        seeds = [FEE_VAULT_SEED],
        bump,
    )]
    pub fee_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ClaimHolderFees>,
    epoch: u64,
    amount: u64,
    proof: Vec<[u8; 32]>,
) -> Result<()> {
    require!(amount > 0, ColsError::InvalidAmount);

    // Sanity: the holder_claim PDA should be fresh. Because of `init` we know
    // discriminator was just written, but we also defend against any future
    // refactor by reading the amount_claimed field.
    require!(
        ctx.accounts.holder_claim.amount_claimed == 0,
        ColsError::AlreadyClaimed
    );

    let dist = &ctx.accounts.distribution;
    let leaf = compute_distribution_leaf(&ctx.accounts.holder.key(), epoch, amount);
    require!(
        verify_merkle_proof(leaf, &proof, dist.root),
        ColsError::InvalidProof
    );

    let fee_vault_info = ctx.accounts.fee_vault.to_account_info();
    let vault_lamports = **fee_vault_info.lamports.borrow();
    require!(vault_lamports >= amount, ColsError::InsufficientVault);

    // Move lamports vault -> holder via a signed CPI to the system program.
    let fee_vault_bump = ctx.bumps.fee_vault;
    let seeds: &[&[u8]] = &[FEE_VAULT_SEED, &[fee_vault_bump]];
    let signer: &[&[&[u8]]] = &[seeds];

    let ix = system_instruction::transfer(
        &ctx.accounts.fee_vault.key(),
        &ctx.accounts.holder.key(),
        amount,
    );
    invoke_signed(
        &ix,
        &[
            ctx.accounts.fee_vault.to_account_info(),
            ctx.accounts.holder.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer,
    )?;

    let clock = Clock::get()?;
    ctx.accounts.holder_claim.initialize(
        ctx.accounts.holder.key(),
        epoch,
        amount,
        clock.slot,
        ctx.bumps.holder_claim,
    );

    msg!(
        "cols: holder claimed epoch={} amount={} holder={}",
        epoch,
        amount,
        ctx.accounts.holder.key(),
    );

    emit!(HolderClaimed {
        holder: ctx.accounts.holder.key(),
        epoch,
        amount,
        slot: clock.slot,
    });

    Ok(())
}
