use solana_sdk::pubkey::Pubkey;

/// PDA seed for the global Config account.
pub const CONFIG_SEED: &[u8] = b"config";
/// PDA seed prefix for Pet accounts.
pub const PET_SEED: &[u8] = b"pet";
/// PDA seed prefix for Launch accounts.
pub const LAUNCH_SEED: &[u8] = b"launch";
/// PDA seed prefix for KingOfHill accounts.
pub const KING_SEED: &[u8] = b"king";
/// PDA seed prefix for the NFT escrow vault owned by a KingOfHill.
pub const NFT_VAULT_SEED: &[u8] = b"nft_vault";
/// PDA seed prefix for Distribution accounts.
pub const DISTRIBUTION_SEED: &[u8] = b"distribution";
/// PDA seed prefix for HolderClaim accounts.
pub const HOLDER_CLAIM_SEED: &[u8] = b"holder_claim";
/// PDA seed for the fee vault account.
pub const FEE_VAULT_SEED: &[u8] = b"fee_vault";

/// Derive the global Config PDA for the given program id.
pub fn config(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[CONFIG_SEED], program_id)
}

/// Derive the Pet PDA for `(kol_owner, kol_name)`.
///
/// The `kol_name` slice is padded to or truncated to exactly 32 bytes to
/// match the on-chain seed scheme.
pub fn pet(program_id: &Pubkey, kol_owner: &Pubkey, kol_name: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[PET_SEED, kol_owner.as_ref(), kol_name.as_ref()], program_id)
}

/// Derive the Launch PDA for a given pet.
pub fn launch(program_id: &Pubkey, pet_pda: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[LAUNCH_SEED, pet_pda.as_ref()], program_id)
}

/// Derive the KingOfHill PDA for a given pet.
pub fn king(program_id: &Pubkey, pet_pda: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[KING_SEED, pet_pda.as_ref()], program_id)
}

/// Derive the NFT escrow vault PDA for a given KingOfHill account.
pub fn nft_vault(program_id: &Pubkey, king_pda: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[NFT_VAULT_SEED, king_pda.as_ref()], program_id)
}

/// Derive the Distribution PDA for a given epoch number.
pub fn distribution(program_id: &Pubkey, epoch: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[DISTRIBUTION_SEED, &epoch.to_le_bytes()],
        program_id,
    )
}

/// Derive the HolderClaim PDA for a given (holder, epoch) pair.
pub fn holder_claim(program_id: &Pubkey, holder: &Pubkey, epoch: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[HOLDER_CLAIM_SEED, holder.as_ref(), &epoch.to_le_bytes()],
        program_id,
    )
}

/// Derive the global fee vault PDA.
pub fn fee_vault(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[FEE_VAULT_SEED], program_id)
}

/// Encode a UTF-8 kol name into the fixed 32 byte seed buffer.
///
/// Names shorter than 32 bytes are right padded with zeroes. Names longer
/// than 32 bytes are rejected so the caller can surface a clear error to the
/// user.
pub fn encode_kol_name(name: &str) -> Result<[u8; 32], String> {
    let bytes = name.as_bytes();
    if bytes.len() > 32 {
        return Err(format!(
            "kol_name length {} exceeds 32 byte limit",
            bytes.len()
        ));
    }
    let mut buf = [0u8; 32];
    buf[..bytes.len()].copy_from_slice(bytes);
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_pads_short_names() {
        let encoded = encode_kol_name("abc").unwrap();
        assert_eq!(&encoded[..3], b"abc");
        assert_eq!(encoded[3], 0);
        assert_eq!(encoded[31], 0);
    }

    #[test]
    fn encode_rejects_long_names() {
        let long = "x".repeat(33);
        assert!(encode_kol_name(&long).is_err());
    }
}
