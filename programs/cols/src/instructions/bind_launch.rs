//! `oracle_bind_pumpfun_launch` instruction.
//!
//! Called by the oracle once it observes a KOL launching a token on
//! pump.fun. Creates the `Pet` PDA for the KOL if missing and the `Launch`
//! PDA that mirrors the bonding-curve state going forward.

use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, KOL_NAME_LEN, LAUNCH_SEED, PET_SEED};
use crate::errors::ColsError;
use crate::events::LaunchBound;
use crate::state::{Config, Launch, Pet};

#[derive(Accounts)]
#[instruction(kol_name: [u8; KOL_NAME_LEN])]
pub struct OracleBindPumpfunLaunch<'info> {
    /// Oracle authority. Must equal `config.oracle`.
    #[account(mut)]
    pub oracle: Signer<'info>,

    /// CHECK: KOL wallet pubkey. Read-only because the oracle creates the pet
    /// on behalf of the KOL. The pet PDA seed binds this address into the
    /// account derivation, so passing a different pubkey would derive a
    /// different PDA and either collide with the wrong account or fail.
    pub kol_owner: UncheckedAccount<'info>,

    /// CHECK: Mint of the memecoin being bonded. Stored verbatim into the
    /// launch state. The oracle is trusted to have validated it points at
    /// a real pump.fun mint before this CPI.
    pub pump_mint: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = oracle,
        space = Pet::SIZE,
        seeds = [PET_SEED, kol_owner.key().as_ref(), kol_name.as_ref()],
        bump,
    )]
    pub pet: Account<'info, Pet>,

    #[account(
        init_if_needed,
        payer = oracle,
        space = Launch::SIZE,
        seeds = [LAUNCH_SEED, pet.key().as_ref()],
        bump,
    )]
    pub launch: Account<'info, Launch>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.oracle == oracle.key() @ ColsError::OracleMismatch,
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<OracleBindPumpfunLaunch>,
    kol_name: [u8; KOL_NAME_LEN],
) -> Result<()> {
    let clock = Clock::get()?;
    let slot = clock.slot;

    let pet = &mut ctx.accounts.pet;
    let launch = &mut ctx.accounts.launch;

    // If the pet account has just been created its owner field will still be
    // the default zero pubkey. Fill it in on first touch.
    if pet.owner == Pubkey::default() {
        pet.initialize(
            ctx.accounts.kol_owner.key(),
            kol_name,
            slot,
            ctx.bumps.pet,
        );
    } else {
        // Already-existing pet: make sure caller passed the right name and
        // owner; otherwise this is a logic bug on the oracle side.
        require_keys_eq!(
            pet.owner,
            ctx.accounts.kol_owner.key(),
            ColsError::Unauthorized
        );
        require!(pet.kol_name == kol_name, ColsError::NameTooLong);
    }

    if launch.pet == Pubkey::default() {
        launch.initialize(
            pet.key(),
            ctx.accounts.pump_mint.key(),
            slot,
            ctx.bumps.launch,
        );
    } else {
        require_keys_eq!(launch.pet, pet.key(), ColsError::PetMismatch);
        // If the launch already exists, only allow refreshing the bonded slot
        // when the same mint is bound, otherwise the oracle is rebinding to a
        // new mint which is not part of the spec.
        require_keys_eq!(
            launch.pump_mint,
            ctx.accounts.pump_mint.key(),
            ColsError::MintMismatch
        );
        launch.bonded_slot = slot;
    }

    msg!(
        "cols: pet+launch bound pet={} mint={} slot={}",
        pet.key(),
        ctx.accounts.pump_mint.key(),
        slot,
    );

    emit!(LaunchBound {
        pet: pet.key(),
        kol_owner: ctx.accounts.kol_owner.key(),
        pump_mint: ctx.accounts.pump_mint.key(),
        bonded_slot: slot,
    });

    Ok(())
}
