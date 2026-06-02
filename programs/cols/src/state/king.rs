//! `KingOfHill` account: state for the rotating NFT championship.
//!
//! At any moment exactly one wallet (the current champion) holds the king NFT.
//! When a challenger surpasses the champion's memecoin balance, the NFT is
//! transferred to the challenger's ATA by the king PDA which holds delegated
//! transfer authority over both ATAs. After a settlement window the king PDA
//! revokes its delegate so the final champion truly owns the NFT.

use anchor_lang::prelude::*;

use crate::constants::SYSTEM_PROGRAM_ID;

#[account]
#[derive(Default)]
pub struct KingOfHill {
    /// Pet the throne belongs to.
    pub pet: Pubkey,
    /// Mint of the 1/1 king NFT.
    pub nft_mint: Pubkey,
    /// The PDA controlled ATA that initially holds the NFT before any capture.
    pub nft_escrow_vault: Pubkey,
    /// Current champion's wallet. Defaults to System Program pubkey before any
    /// capture has occurred, which makes "no champion" representable on chain.
    pub current_champion: Pubkey,
    /// Memecoin balance the champion held at the moment they took the throne.
    pub champion_balance: u64,
    /// Slot the most recent capture happened on.
    pub last_captured_slot: u64,
    /// Number of times the throne has changed hands across the entire run.
    pub take_overs: u32,
    /// PDA bump for the king account.
    pub bump: u8,
    /// PDA bump for the escrow vault ATA owner. The vault itself is an ATA
    /// owned by this PDA; storing the bump avoids re-derivation cost.
    pub nft_escrow_vault_bump: u8,
    /// Slot at which the settlement window ends and the NFT becomes
    /// permanently the current champion's.
    pub settles_at_slot: u64,
    /// Set to true once `settle_throne` runs successfully.
    pub settled: bool,
    /// Padding for future fields.
    pub _reserved: [u8; 5],
}

impl KingOfHill {
    /// 8 (discrim) + 4 * 32 (pubkeys, 128) + u64 (8) + u64 (8) + u32 (4)
    /// + u8 (1) + u8 (1) + u64 (8) + bool (1) + pad (5) = 172.
    pub const SIZE: usize = 8 + 128 + 8 + 8 + 4 + 1 + 1 + 8 + 1 + 5;

    /// Initialize the king state at mint time. There is no champion yet so
    /// `current_champion` is set to the system program as a sentinel and
    /// `champion_balance` is zero. The settlement deadline is left at zero
    /// and set on the first successful `take_throne`.
    pub fn initialize(
        &mut self,
        pet: Pubkey,
        nft_mint: Pubkey,
        nft_escrow_vault: Pubkey,
        bump: u8,
        nft_escrow_vault_bump: u8,
    ) {
        self.pet = pet;
        self.nft_mint = nft_mint;
        self.nft_escrow_vault = nft_escrow_vault;
        self.current_champion = SYSTEM_PROGRAM_ID;
        self.champion_balance = 0;
        self.last_captured_slot = 0;
        self.take_overs = 0;
        self.bump = bump;
        self.nft_escrow_vault_bump = nft_escrow_vault_bump;
        self.settles_at_slot = 0;
        self.settled = false;
        self._reserved = [0u8; 5];
    }

    /// Returns true if no challenger has captured the throne yet.
    pub fn is_unclaimed(&self) -> bool {
        self.current_champion == SYSTEM_PROGRAM_ID && self.take_overs == 0
    }
}
