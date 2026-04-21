use borsh::BorshDeserialize;
use serde::Serialize;
use solana_sdk::pubkey::Pubkey;

use crate::discriminator::{self, DISCRIMINATOR_LEN};
use crate::error::{CliError, CliResult};

/// On-chain layout of the global Config PDA.
#[derive(BorshDeserialize, Serialize, Debug, Clone)]
pub struct Config {
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub fee_basis_points: u32,
    pub bump: u8,
}

/// On-chain layout of a Pet PDA.
#[derive(BorshDeserialize, Serialize, Debug, Clone)]
pub struct Pet {
    pub owner: Pubkey,
    pub kol_name: [u8; 32],
    pub bonded_at: u64,
    pub bump: u8,
}

/// On-chain layout of a Launch PDA.
#[derive(BorshDeserialize, Serialize, Debug, Clone)]
pub struct Launch {
    pub pet: Pubkey,
    pub pump_mint: Pubkey,
    pub bonded_slot: u64,
    pub real_sol_reserve: u64,
    pub real_token_reserve: u64,
    pub creator_fees_lamports: u64,
    pub total_volume_lamports: u64,
    pub graduated: bool,
    pub bump: u8,
}

/// On-chain layout of a KingOfHill PDA.
#[derive(BorshDeserialize, Serialize, Debug, Clone)]
pub struct KingOfHill {
    pub pet: Pubkey,
    pub nft_mint: Pubkey,
    pub nft_escrow_vault: Pubkey,
    pub current_champion: Pubkey,
    pub champion_balance: u64,
    pub last_captured_slot: u64,
    pub take_overs: u32,
    pub bump: u8,
    pub nft_escrow_vault_bump: u8,
    pub settles_at_slot: u64,
    pub settled: bool,
}

/// On-chain layout of a Distribution PDA.
#[derive(BorshDeserialize, Serialize, Debug, Clone)]
pub struct Distribution {
    pub epoch: u64,
    pub root: [u8; 32],
    pub pool_lamports: u64,
    pub committed_at: u64,
    pub bump: u8,
}

/// On-chain layout of a HolderClaim PDA.
#[derive(BorshDeserialize, Serialize, Debug, Clone)]
pub struct HolderClaim {
    pub holder: Pubkey,
    pub epoch: u64,
    pub amount_claimed: u64,
    pub claimed_at_slot: u64,
    pub bump: u8,
}

/// Strip the Anchor 8 byte discriminator and verify it matches expectations.
fn split_discriminator<'a>(
    address: &str,
    expected_account: &str,
    raw: &'a [u8],
) -> CliResult<&'a [u8]> {
    if raw.len() < DISCRIMINATOR_LEN {
        return Err(CliError::AccountTooSmall {
            address: address.to_string(),
            expected: DISCRIMINATOR_LEN,
            actual: raw.len(),
        });
    }
    let expected = discriminator::account(expected_account);
    let actual = &raw[..DISCRIMINATOR_LEN];
    if actual != expected {
        return Err(CliError::DiscriminatorMismatch {
            address: address.to_string(),
            expected: discriminator::fmt(&expected),
            found: discriminator::fmt(actual),
        });
    }
    Ok(&raw[DISCRIMINATOR_LEN..])
}

/// Helper that wraps a borsh deserialization with our error type.
fn decode<T: BorshDeserialize>(target: &str, body: &[u8]) -> CliResult<T> {
    T::try_from_slice(body).map_err(|e| CliError::Decode {
        target: target.to_string(),
        reason: e.to_string(),
    })
}

/// Decode a Config account.
pub fn decode_config(address: &str, raw: &[u8]) -> CliResult<Config> {
    let body = split_discriminator(address, "Config", raw)?;
    decode("Config", body)
}

/// Decode a Pet account.
pub fn decode_pet(address: &str, raw: &[u8]) -> CliResult<Pet> {
    let body = split_discriminator(address, "Pet", raw)?;
    decode("Pet", body)
}

/// Decode a Launch account.
pub fn decode_launch(address: &str, raw: &[u8]) -> CliResult<Launch> {
    let body = split_discriminator(address, "Launch", raw)?;
    decode("Launch", body)
}

/// Decode a KingOfHill account.
pub fn decode_king(address: &str, raw: &[u8]) -> CliResult<KingOfHill> {
    let body = split_discriminator(address, "KingOfHill", raw)?;
    decode("KingOfHill", body)
}

/// Decode a Distribution account.
pub fn decode_distribution(address: &str, raw: &[u8]) -> CliResult<Distribution> {
    let body = split_discriminator(address, "Distribution", raw)?;
    decode("Distribution", body)
}

/// Decode a HolderClaim account.
pub fn decode_holder_claim(address: &str, raw: &[u8]) -> CliResult<HolderClaim> {
    let body = split_discriminator(address, "HolderClaim", raw)?;
    decode("HolderClaim", body)
}

/// Convert a `[u8; 32]` kol name to a UTF-8 string, stripping trailing zeros.
pub fn kol_name_to_string(name: &[u8; 32]) -> String {
    let end = name.iter().position(|b| *b == 0).unwrap_or(name.len());
    String::from_utf8_lossy(&name[..end]).into_owned()
}
