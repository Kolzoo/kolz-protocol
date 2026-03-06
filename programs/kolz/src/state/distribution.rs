//! `Distribution` account: per-epoch merkle root for holder fee payouts.
//!
//! The oracle aggregates trading volume off chain at the end of each epoch
//! and commits a merkle root of `(holder, amount)` leaves. Holders then claim
//! against this root by submitting their leaf and proof.

use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct Distribution {
    /// Epoch number, monotonically increasing.
    pub epoch: u64,
    /// Keccak256 merkle root of `(holder_pubkey || epoch || amount)` leaves.
    pub root: [u8; 32],
    /// Total lamports the oracle promised to make available for this epoch.
    pub pool_lamports: u64,
    /// Slot the root was committed on.
    pub committed_at: u64,
    /// PDA bump.
    pub bump: u8,
    /// Reserved padding.
    pub _reserved: [u8; 7],
}

impl Distribution {
    /// 8 (discrim) + 8 (epoch) + 32 (root) + 8 (pool) + 8 (slot) + 1 (bump) + 7 pad.
    pub const SIZE: usize = 8 + 8 + 32 + 8 + 8 + 1 + 7;

    pub fn initialize(
        &mut self,
        epoch: u64,
        root: [u8; 32],
        pool_lamports: u64,
        committed_at: u64,
        bump: u8,
    ) {
        self.epoch = epoch;
        self.root = root;
        self.pool_lamports = pool_lamports;
        self.committed_at = committed_at;
        self.bump = bump;
        self._reserved = [0u8; 7];
    }
}
