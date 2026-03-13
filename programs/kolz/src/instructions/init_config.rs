//! `init_config` instruction.
//!
//! Creates the singleton `Config` PDA. May only be called once because the
//! `init` constraint will fail if the account already exists. The signer of
//! this instruction is bound as the protocol admin.

use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, FEE_VAULT_SEED};
use crate::events::ConfigInitialized;
use crate::state::Config;
use crate::utils::check_fee_bps;

#[derive(Accounts)]
#[instruction(oracle_authority: Pubkey, fee_basis_points: u32)]
pub struct InitConfig<'info> {
    /// Admin and payer. Becomes the configured admin pubkey.
    #[account(mut)]
    pub admin: Signer<'info>,

    /// The singleton config PDA.
    #[account(
        init,
        payer = admin,
        space = Config::SIZE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    /// CHECK: PDA used as the lamport vault from which holder fees flow out.
    /// We only need a system-owned account at a derived address; no data lives
    /// here. The seed pattern is asserted by `seeds` + `bump`.
    #[account(
        mut,
        seeds = [FEE_VAULT_SEED],
        bump,
    )]
    pub fee_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Entry point invoked by `kolz::init_config(...)` in lib.rs.
pub fn handler(
    ctx: Context<InitConfig>,
    oracle_authority: Pubkey,
    fee_basis_points: u32,
) -> Result<()> {
    check_fee_bps(fee_basis_points)?;

    let cfg = &mut ctx.accounts.config;
    cfg.initialize(
        ctx.accounts.admin.key(),
        oracle_authority,
        fee_basis_points,
        ctx.bumps.config,
    );

    let slot = Clock::get()?.slot;
    msg!(
        "kolz: config initialized admin={} oracle={} bps={}",
        cfg.admin,
        cfg.oracle,
        cfg.fee_basis_points,
    );

    emit!(ConfigInitialized {
        admin: cfg.admin,
        oracle: cfg.oracle,
        fee_basis_points: cfg.fee_basis_points,
        slot,
    });

    Ok(())
}
