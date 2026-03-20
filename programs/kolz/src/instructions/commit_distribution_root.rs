//! `commit_distribution_root` instruction.
//!
//! Oracle posts the keccak256 merkle root summarizing per-holder rewards for
//! a single epoch. The associated `pool_lamports` figure documents how much
//! the oracle expects to be drained from the fee vault if every holder
//! claims, so off-chain systems can reconcile.

use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, DISTRIBUTION_SEED};
use crate::errors::KolzError;
use crate::events::DistributionCommitted;
use crate::state::{Config, Distribution};

#[derive(Accounts)]
#[instruction(epoch: u64, root: [u8; 32], pool_lamports: u64)]
pub struct CommitDistributionRoot<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.oracle == oracle.key() @ KolzError::OracleMismatch,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = oracle,
        space = Distribution::SIZE,
        seeds = [DISTRIBUTION_SEED, epoch.to_le_bytes().as_ref()],
        bump,
    )]
    pub distribution: Account<'info, Distribution>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CommitDistributionRoot>,
    epoch: u64,
    root: [u8; 32],
    pool_lamports: u64,
) -> Result<()> {
    require!(pool_lamports > 0, KolzError::InvalidAmount);

    let clock = Clock::get()?;
    let dist = &mut ctx.accounts.distribution;
    dist.initialize(epoch, root, pool_lamports, clock.slot, ctx.bumps.distribution);

    msg!(
        "kolz: distribution committed epoch={} pool={} slot={}",
        epoch,
        pool_lamports,
        clock.slot,
    );

    emit!(DistributionCommitted {
        epoch,
        root,
        pool_lamports,
        slot: clock.slot,
    });

    Ok(())
}
