//! `Launch` account: a mirror of the pump.fun bonding curve state for a pet.
//!
//! The oracle updates this account whenever it observes the bonding curve
//! moving on chain. COLS reads the cached fields to make local decisions
//! without paying for a CPI into the pump.fun program.

use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct Launch {
    /// Backreference to the pet PDA this launch is scoped under.
    pub pet: Pubkey,
    /// Mint of the memecoin on pump.fun.
    pub pump_mint: Pubkey,
    /// Slot the pet was bonded to this mint.
    pub bonded_slot: u64,
    /// Cached SOL balance in the bonding curve reserve, in lamports.
    pub real_sol_reserve: u64,
    /// Cached memecoin balance in the bonding curve, in token base units.
    pub real_token_reserve: u64,
    /// Lamports of creator fees accumulated so far.
    pub creator_fees_lamports: u64,
    /// Lamports of total trade volume routed through this launch.
    pub total_volume_lamports: u64,
    /// True once the curve graduates to Raydium and the token is fully unlocked.
    pub graduated: bool,
    /// PDA bump for the launch account.
    pub bump: u8,
    /// Reserved padding to keep alignment friendly.
    pub _reserved: [u8; 6],
}

impl Launch {
    /// 8 (discrim) + 32 (pet) + 32 (pump_mint) + 6 * u64 (48) + 1 (bool) +
    /// 1 (bump) + 6 (pad) = 128.
    pub const SIZE: usize = 8 + 32 + 32 + 48 + 1 + 1 + 6;

    /// Initialize the cached launch on creation. All cumulative fields start
    /// at zero and are filled in by subsequent oracle observations.
    pub fn initialize(&mut self, pet: Pubkey, pump_mint: Pubkey, bonded_slot: u64, bump: u8) {
        self.pet = pet;
        self.pump_mint = pump_mint;
        self.bonded_slot = bonded_slot;
        self.real_sol_reserve = 0;
        self.real_token_reserve = 0;
        self.creator_fees_lamports = 0;
        self.total_volume_lamports = 0;
        self.graduated = false;
        self.bump = bump;
        self._reserved = [0u8; 6];
    }

    /// Saturate-add an observation of trade volume.
    pub fn record_volume(&mut self, lamports: u64) {
        self.total_volume_lamports = self.total_volume_lamports.saturating_add(lamports);
    }

    /// Saturate-add an observation of creator fees harvested.
    pub fn record_creator_fees(&mut self, lamports: u64) {
        self.creator_fees_lamports = self.creator_fees_lamports.saturating_add(lamports);
    }

    /// Overwrite cached reserves wholesale. The oracle drives the latest
    /// snapshot from the pump.fun program so we don't try to be clever about
    /// merging partial views.
    pub fn snapshot_reserves(&mut self, sol_reserve: u64, token_reserve: u64) {
        self.real_sol_reserve = sol_reserve;
        self.real_token_reserve = token_reserve;
    }
}
