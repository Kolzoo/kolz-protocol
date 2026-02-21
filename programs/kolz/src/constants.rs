//! Compile-time constants used across the KOLZ program.
//!
//! All seeds, byte budgets, and protocol magic numbers live here so that the
//! rest of the program never carries an opaque literal. Keep this file plain
//! `pub const` only, no logic, so it can be included from every module without
//! pulling additional dependencies.

use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::pubkey;

/// PDA seed for the singleton `Config` account.
pub const CONFIG_SEED: &[u8] = b"config";

/// PDA seed prefix for a `Pet` account.
pub const PET_SEED: &[u8] = b"pet";

/// PDA seed prefix for a `Launch` account, scoped under a pet.
pub const LAUNCH_SEED: &[u8] = b"launch";

/// PDA seed prefix for a `KingOfHill` account, scoped under a pet.
pub const KING_SEED: &[u8] = b"king";

/// PDA seed prefix for the NFT escrow vault inside a king account.
pub const KING_ESCROW_SEED: &[u8] = b"king_escrow";

/// PDA seed prefix for a `Distribution` epoch root.
pub const DISTRIBUTION_SEED: &[u8] = b"distribution";

/// PDA seed prefix for a `HolderClaim` receipt account.
pub const HOLDER_CLAIM_SEED: &[u8] = b"holder_claim";

/// PDA seed for the protocol-wide fee vault.
pub const FEE_VAULT_SEED: &[u8] = b"fee_vault";

/// Maximum bytes in a stored `kol_name`.
pub const KOL_NAME_LEN: usize = 32;

/// Max bytes Metaplex Token Metadata V3 accepts for `name`.
pub const MAX_METADATA_NAME_LEN: usize = 32;

/// Max bytes Metaplex Token Metadata V3 accepts for `symbol`.
pub const MAX_METADATA_SYMBOL_LEN: usize = 10;

/// Max bytes Metaplex Token Metadata V3 accepts for `uri`.
pub const MAX_METADATA_URI_LEN: usize = 200;

/// Slot count that represents approximately seven days at 0.4 seconds per slot.
///
/// `7 * 24 * 60 * 60 / 0.4 = 1_512_000`.
pub const THRONE_SETTLEMENT_SLOTS: u64 = 1_512_000;

/// Anchor account discriminator length in bytes.
pub const DISCRIMINATOR_LEN: usize = 8;

/// Hard cap on fee basis points the admin can configure (10000 bps = 100%).
pub const MAX_FEE_BPS: u32 = 10_000;

/// System program address used as a default sentinel for "no champion yet".
pub const SYSTEM_PROGRAM_ID: Pubkey = pubkey!("11111111111111111111111111111111");

/// Decimals the king-of-hill NFT mint is created with. A 1/1 NFT always uses
/// zero decimals so that the supply of one is indivisible.
pub const NFT_DECIMALS: u8 = 0;

/// Mint supply for a 1/1 NFT.
pub const NFT_SUPPLY: u64 = 1;
