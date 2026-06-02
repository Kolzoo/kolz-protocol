//! Anchor `#[event]` definitions.
//!
//! Events are emitted from instruction handlers to give the off-chain
//! indexer a structured stream to consume in addition to log scraping.
//! Each event mirrors the fields persisted to the state account so that
//! the indexer can reconstruct full history without reading every account.

use anchor_lang::prelude::*;

#[event]
pub struct ConfigInitialized {
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub fee_basis_points: u32,
    pub slot: u64,
}

#[event]
pub struct LaunchBound {
    pub pet: Pubkey,
    pub kol_owner: Pubkey,
    pub pump_mint: Pubkey,
    pub bonded_slot: u64,
}

#[event]
pub struct KingMinted {
    pub pet: Pubkey,
    pub nft_mint: Pubkey,
    pub escrow_vault: Pubkey,
    pub slot: u64,
}

#[event]
pub struct ThroneCaptured {
    pub pet: Pubkey,
    pub new_champion: Pubkey,
    pub previous_champion: Pubkey,
    pub champion_balance: u64,
    pub take_overs: u32,
    pub slot: u64,
    pub first_capture: bool,
    pub settles_at_slot: u64,
}

#[event]
pub struct ThroneSettled {
    pub pet: Pubkey,
    pub final_champion: Pubkey,
    pub take_overs: u32,
    pub slot: u64,
}

#[event]
pub struct DistributionCommitted {
    pub epoch: u64,
    pub root: [u8; 32],
    pub pool_lamports: u64,
    pub slot: u64,
}

#[event]
pub struct HolderClaimed {
    pub holder: Pubkey,
    pub epoch: u64,
    pub amount: u64,
    pub slot: u64,
}
