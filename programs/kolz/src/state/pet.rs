//! `Pet` account: a unique handle for a KOL identity inside the protocol.
//!
//! Each KOL gets a deterministic `Pet` PDA derived from `["pet", kol_owner,
//! kol_name]`. The pet account is the anchoring identity that every other
//! per-launch account (launch state, king of hill state) is scoped under.

use anchor_lang::prelude::*;

use crate::constants::KOL_NAME_LEN;

#[account]
#[derive(Default)]
pub struct Pet {
    /// Owner of the pet. Typically the KOL's main wallet.
    pub owner: Pubkey,
    /// Display name, padded to KOL_NAME_LEN bytes. Trimmed at read time.
    pub kol_name: [u8; KOL_NAME_LEN],
    /// Slot the pet was bonded to a pump.fun launch.
    pub bonded_at: u64,
    /// PDA bump for the pet account.
    pub bump: u8,
    /// Reserved padding.
    pub _reserved: [u8; 7],
}

impl Pet {
    /// 8 (discrim) + 32 (owner) + 32 (name) + 8 (bonded_at) + 1 (bump) + 7 (pad).
    pub const SIZE: usize = 8 + 32 + KOL_NAME_LEN + 8 + 1 + 7;

    /// Initialize the pet on creation.
    pub fn initialize(
        &mut self,
        owner: Pubkey,
        kol_name: [u8; KOL_NAME_LEN],
        bonded_at: u64,
        bump: u8,
    ) {
        self.owner = owner;
        self.kol_name = kol_name;
        self.bonded_at = bonded_at;
        self.bump = bump;
        self._reserved = [0u8; 7];
    }
}
