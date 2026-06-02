//! COLS on-chain program.
//!
//! Top-level dispatch module. Every instruction handler lives in its own
//! file under `instructions/`. Each wrapper here simply forwards to the
//! handler so the `#[program]` module stays focused on dispatch.
//!
//! Protocol summary:
//!
//! 1. Admin opens the singleton `Config` PDA and registers an oracle.
//! 2. Oracle observes a pump.fun launch, binds it to a pet identity.
//! 3. Oracle mints a 1/1 king-of-hill NFT into a PDA escrow vault.
//! 4. Memecoin holders take the throne by demonstrating a top balance.
//! 5. After a fixed window the oracle settles the throne, locking the NFT.
//! 6. Each epoch the oracle commits a merkle root of holder rewards.
//! 7. Holders claim against the root, draining lamports from the fee vault.

#![allow(clippy::too_many_arguments)]
#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use crate::constants::KOL_NAME_LEN;
use crate::instructions::*;

declare_id!("Cols1111111111111111111111111111111111111111");

#[program]
pub mod cols {
    use super::*;

    /// One-shot config bootstrap. Only callable while the Config PDA does
    /// not yet exist. Signer becomes admin.
    pub fn init_config(
        ctx: Context<InitConfig>,
        oracle_authority: Pubkey,
        fee_basis_points: u32,
    ) -> Result<()> {
        instructions::init_config::handler(ctx, oracle_authority, fee_basis_points)
    }

    /// Oracle-only. Registers a pet for a KOL and the launch state mirror
    /// of the underlying pump.fun bonding curve.
    pub fn oracle_bind_pumpfun_launch(
        ctx: Context<OracleBindPumpfunLaunch>,
        kol_name: [u8; KOL_NAME_LEN],
    ) -> Result<()> {
        instructions::bind_launch::handler(ctx, kol_name)
    }

    /// Oracle-only. Mints the 1/1 king NFT and creates the king state.
    pub fn mint_kol_nft(
        ctx: Context<MintKolNft>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        instructions::mint_kol_nft::handler(ctx, name, symbol, uri)
    }

    /// Challenger pulls the NFT into their wallet provided they out-hold
    /// the current champion.
    pub fn take_throne(ctx: Context<TakeThrone>) -> Result<()> {
        instructions::take_throne::handler(ctx)
    }

    /// Oracle-only. Revokes the king PDA delegate once the settlement
    /// window has elapsed.
    pub fn settle_throne(ctx: Context<SettleThrone>) -> Result<()> {
        instructions::settle_throne::handler(ctx)
    }

    /// Oracle-only. Posts a merkle root over per-holder rewards for an epoch.
    pub fn commit_distribution_root(
        ctx: Context<CommitDistributionRoot>,
        epoch: u64,
        root: [u8; 32],
        pool_lamports: u64,
    ) -> Result<()> {
        instructions::commit_distribution_root::handler(ctx, epoch, root, pool_lamports)
    }

    /// Holder-driven. Verifies a merkle proof and pays out from the vault.
    pub fn claim_holder_fees(
        ctx: Context<ClaimHolderFees>,
        epoch: u64,
        amount: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::claim_holder_fees::handler(ctx, epoch, amount, proof)
    }
}
