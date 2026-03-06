//! `HolderClaim` receipt: marks one `(holder, epoch)` pair as already paid.
//!
//! The account is opened the first time a holder claims for a given epoch and
//! its existence is what prevents a double claim. Subsequent claim attempts
//! see a non-empty discriminator and fail with `AlreadyClaimed`.

use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct HolderClaim {
    /// Holder wallet that received the payout.
    pub holder: Pubkey,
    /// Epoch this receipt belongs to.
    pub epoch: u64,
    /// Amount of lamports paid out for this epoch.
    pub amount_claimed: u64,
    /// Slot the payout was settled on.
    pub claimed_at_slot: u64,
    /// PDA bump.
    pub bump: u8,
    /// Reserved padding.
    pub _reserved: [u8; 7],
}

impl HolderClaim {
    /// 8 (discrim) + 32 (holder) + 8 (epoch) + 8 (amount) + 8 (slot) + 1 (bump) + 7 (pad) = 72.
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 8 + 1 + 7;

    pub fn initialize(
        &mut self,
        holder: Pubkey,
        epoch: u64,
        amount: u64,
        slot: u64,
        bump: u8,
    ) {
        self.holder = holder;
        self.epoch = epoch;
        self.amount_claimed = amount;
        self.claimed_at_slot = slot;
        self.bump = bump;
        self._reserved = [0u8; 7];
    }
}
