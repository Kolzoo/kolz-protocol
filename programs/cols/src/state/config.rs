//! Singleton `Config` account.
//!
//! Stores the protocol-wide admin pubkey, the off-chain oracle pubkey that is
//! permitted to sign privileged instructions (binding pumpfun launches,
//! committing distribution roots, settling thrones), and the fee basis points
//! the protocol charges on holder distributions.

use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct Config {
    /// Protocol admin. Authorized to rotate the oracle or update fee bps.
    pub admin: Pubkey,
    /// Oracle service pubkey. Signs all instructions that depend on
    /// off-chain observations of the pump.fun bonding curve and holder set.
    pub oracle: Pubkey,
    /// Fee basis points charged on every epoch distribution.
    pub fee_basis_points: u32,
    /// PDA bump for the singleton config account.
    pub bump: u8,
    /// Padding to keep the struct round to 8 bytes for future alignment work.
    pub _reserved: [u8; 3],
}

impl Config {
    /// Total account size including the 8 byte Anchor discriminator.
    ///
    /// Pubkey x 2 = 64, u32 = 4, u8 = 1, padding = 3. Add 8 for discriminator.
    pub const SIZE: usize = 8 + 32 + 32 + 4 + 1 + 3;

    /// Set every field at once. Used by `init_config`.
    pub fn initialize(
        &mut self,
        admin: Pubkey,
        oracle: Pubkey,
        fee_basis_points: u32,
        bump: u8,
    ) {
        self.admin = admin;
        self.oracle = oracle;
        self.fee_basis_points = fee_basis_points;
        self.bump = bump;
        self._reserved = [0u8; 3];
    }
}
