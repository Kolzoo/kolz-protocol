//! Shared helpers used by multiple instructions.
//!
//! Keep this module dependency-light: it must compile inside the BPF target
//! and must not reference Anchor accounts directly. Only pure functions and
//! tiny stateless transforms belong here.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

use crate::constants::{KOL_NAME_LEN, MAX_FEE_BPS, MAX_METADATA_NAME_LEN,
    MAX_METADATA_SYMBOL_LEN, MAX_METADATA_URI_LEN};
use crate::errors::ColsError;

/// Encode an arbitrary input string into a fixed-width `[u8; KOL_NAME_LEN]`
/// buffer. The trailing bytes are zero-padded. Returns `NameTooLong` when the
/// input exceeds the budget.
pub fn pack_kol_name(input: &[u8]) -> Result<[u8; KOL_NAME_LEN]> {
    if input.len() > KOL_NAME_LEN {
        return err!(ColsError::NameTooLong);
    }
    let mut out = [0u8; KOL_NAME_LEN];
    out[..input.len()].copy_from_slice(input);
    Ok(out)
}

/// Reject metaplex metadata strings that exceed protocol-side limits.
pub fn check_metadata_lengths(name: &str, symbol: &str, uri: &str) -> Result<()> {
    if name.as_bytes().len() > MAX_METADATA_NAME_LEN {
        return err!(ColsError::NameTooLong);
    }
    if symbol.as_bytes().len() > MAX_METADATA_SYMBOL_LEN {
        return err!(ColsError::SymbolTooLong);
    }
    if uri.as_bytes().len() > MAX_METADATA_URI_LEN {
        return err!(ColsError::UriTooLong);
    }
    Ok(())
}

/// Reject obviously bogus fee basis points.
pub fn check_fee_bps(bps: u32) -> Result<()> {
    if bps > MAX_FEE_BPS {
        return err!(ColsError::FeeBpsOutOfRange);
    }
    Ok(())
}

/// Compute the leaf hash used by the distribution merkle tree.
///
/// Leaf preimage: `holder.to_bytes() || epoch.to_le_bytes() || amount.to_le_bytes()`.
/// Hashed with keccak256 so the proof format matches typical EVM tooling and
/// the off-chain aggregator can reuse standard libraries.
pub fn compute_distribution_leaf(holder: &Pubkey, epoch: u64, amount: u64) -> [u8; 32] {
    let mut preimage = [0u8; 32 + 8 + 8];
    preimage[..32].copy_from_slice(holder.as_ref());
    preimage[32..40].copy_from_slice(&epoch.to_le_bytes());
    preimage[40..48].copy_from_slice(&amount.to_le_bytes());
    keccak::hash(&preimage).to_bytes()
}

/// Verify a keccak256 merkle proof against `root`.
///
/// Each step concatenates the running hash with the next sibling in
/// lexicographic order before hashing again. Returns true when the rebuilt
/// root equals the supplied root.
pub fn verify_merkle_proof(leaf: [u8; 32], proof: &[[u8; 32]], root: [u8; 32]) -> bool {
    let mut current = leaf;
    for sibling in proof {
        let mut buf = [0u8; 64];
        if current <= *sibling {
            buf[..32].copy_from_slice(&current);
            buf[32..].copy_from_slice(sibling);
        } else {
            buf[..32].copy_from_slice(sibling);
            buf[32..].copy_from_slice(&current);
        }
        current = keccak::hash(&buf).to_bytes();
    }
    current == root
}

/// Trim a fixed-width name buffer down to the first non-zero run for display
/// purposes. Used by external read paths; on-chain instructions do not need
/// it but keeping it next to the packer keeps the symmetry obvious.
pub fn unpack_kol_name(buf: &[u8; KOL_NAME_LEN]) -> &[u8] {
    let mut end = buf.len();
    while end > 0 && buf[end - 1] == 0 {
        end -= 1;
    }
    &buf[..end]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_unpack_roundtrip() {
        let packed = pack_kol_name(b"alice").unwrap();
        assert_eq!(unpack_kol_name(&packed), b"alice");
    }

    #[test]
    fn rejects_long_name() {
        let too_long = [b'x'; KOL_NAME_LEN + 1];
        assert!(pack_kol_name(&too_long).is_err());
    }

    #[test]
    fn leaf_is_stable() {
        let pk = Pubkey::new_from_array([7u8; 32]);
        let a = compute_distribution_leaf(&pk, 42, 1_000);
        let b = compute_distribution_leaf(&pk, 42, 1_000);
        assert_eq!(a, b);
    }

    #[test]
    fn proof_of_single_leaf_root() {
        let pk = Pubkey::new_from_array([1u8; 32]);
        let leaf = compute_distribution_leaf(&pk, 1, 1);
        assert!(verify_merkle_proof(leaf, &[], leaf));
    }

    #[test]
    fn fee_bps_check() {
        assert!(check_fee_bps(0).is_ok());
        assert!(check_fee_bps(10_000).is_ok());
        assert!(check_fee_bps(10_001).is_err());
    }

    #[test]
    fn metadata_length_guard() {
        let long = "x".repeat(MAX_METADATA_URI_LEN + 1);
        assert!(check_metadata_lengths("name", "SYM", &long).is_err());
        assert!(check_metadata_lengths("name", "SYM", "ok").is_ok());
        let long_name = "x".repeat(MAX_METADATA_NAME_LEN + 1);
        assert!(check_metadata_lengths(&long_name, "SYM", "ok").is_err());
        let long_sym = "x".repeat(MAX_METADATA_SYMBOL_LEN + 1);
        assert!(check_metadata_lengths("name", &long_sym, "ok").is_err());
    }

    #[test]
    fn merkle_two_leaf_root_lex_order() {
        // Build a tiny root manually so the on-chain verifier matches the
        // off-chain shape: sort siblings lexicographically before hashing.
        let pk_a = Pubkey::new_from_array([1u8; 32]);
        let pk_b = Pubkey::new_from_array([2u8; 32]);
        let leaf_a = compute_distribution_leaf(&pk_a, 5, 100);
        let leaf_b = compute_distribution_leaf(&pk_b, 5, 200);
        let mut combined = [0u8; 64];
        if leaf_a <= leaf_b {
            combined[..32].copy_from_slice(&leaf_a);
            combined[32..].copy_from_slice(&leaf_b);
        } else {
            combined[..32].copy_from_slice(&leaf_b);
            combined[32..].copy_from_slice(&leaf_a);
        }
        let root = keccak::hash(&combined).to_bytes();
        assert!(verify_merkle_proof(leaf_a, &[leaf_b], root));
        assert!(verify_merkle_proof(leaf_b, &[leaf_a], root));
        assert!(!verify_merkle_proof(leaf_a, &[leaf_a], root));
    }

    #[test]
    fn pack_kol_name_pads_with_zeros() {
        let packed = pack_kol_name(b"abc").unwrap();
        assert_eq!(&packed[..3], b"abc");
        for byte in &packed[3..] {
            assert_eq!(*byte, 0);
        }
    }
}

/// Off-chain merkle helpers, gated behind the `cfg(not(target_os = "solana"))`
/// guard so the BPF target does not pull in these allocations.
///
/// The on-chain verifier in `verify_merkle_proof` consumes a `proof: &[[u8; 32]]`
/// in the same byte order this builder produces, so a Node-side harness that
/// links this crate via `wasm-bindgen` or via a thin Rust shim shares one
/// authoritative implementation.
#[cfg(not(target_os = "solana"))]
pub mod offchain_merkle {
    use anchor_lang::solana_program::keccak;

    /// Build a full merkle tree from raw leaves, returning the levels bottom-up.
    pub fn build_tree(leaves: &[[u8; 32]]) -> Vec<Vec<[u8; 32]>> {
        if leaves.is_empty() {
            return Vec::new();
        }
        let mut levels = Vec::new();
        let mut current: Vec<[u8; 32]> = leaves.to_vec();
        levels.push(current.clone());
        while current.len() > 1 {
            let mut next: Vec<[u8; 32]> = Vec::with_capacity((current.len() + 1) / 2);
            for chunk in current.chunks(2) {
                if chunk.len() == 2 {
                    next.push(hash_pair(chunk[0], chunk[1]));
                } else {
                    next.push(chunk[0]);
                }
            }
            current = next;
            levels.push(current.clone());
        }
        levels
    }

    /// Return the merkle root for a vector of leaves.
    pub fn root(leaves: &[[u8; 32]]) -> Option<[u8; 32]> {
        build_tree(leaves).last().and_then(|lvl| lvl.first().copied())
    }

    /// Build the proof for the leaf at `index`.
    pub fn proof_for(leaves: &[[u8; 32]], index: usize) -> Vec<[u8; 32]> {
        let levels = build_tree(leaves);
        let mut proof = Vec::new();
        let mut idx = index;
        for level in levels.iter().take(levels.len().saturating_sub(1)) {
            let sibling_idx = if idx % 2 == 0 { idx + 1 } else { idx - 1 };
            if sibling_idx < level.len() {
                proof.push(level[sibling_idx]);
            }
            idx /= 2;
        }
        proof
    }

    fn hash_pair(a: [u8; 32], b: [u8; 32]) -> [u8; 32] {
        let mut buf = [0u8; 64];
        if a <= b {
            buf[..32].copy_from_slice(&a);
            buf[32..].copy_from_slice(&b);
        } else {
            buf[..32].copy_from_slice(&b);
            buf[32..].copy_from_slice(&a);
        }
        keccak::hash(&buf).to_bytes()
    }
}

#[cfg(test)]
#[cfg(not(target_os = "solana"))]
mod offchain_tests {
    use super::offchain_merkle;
    use super::{compute_distribution_leaf, verify_merkle_proof};
    use anchor_lang::prelude::Pubkey;

    #[test]
    fn builder_matches_verifier() {
        let leaves: Vec<[u8; 32]> = (0u8..5)
            .map(|i| compute_distribution_leaf(&Pubkey::new_from_array([i; 32]), 9, (i as u64) * 100))
            .collect();
        let root = offchain_merkle::root(&leaves).unwrap();
        for (i, leaf) in leaves.iter().enumerate() {
            let proof = offchain_merkle::proof_for(&leaves, i);
            assert!(verify_merkle_proof(*leaf, &proof, root), "leaf {} failed", i);
        }
    }

    #[test]
    fn builder_rejects_other_leaf() {
        let leaves: Vec<[u8; 32]> = (0u8..4)
            .map(|i| compute_distribution_leaf(&Pubkey::new_from_array([i; 32]), 1, 1))
            .collect();
        let root = offchain_merkle::root(&leaves).unwrap();
        let proof = offchain_merkle::proof_for(&leaves, 0);
        // Swap the leaf with one that wasn't in the original set.
        let bogus = compute_distribution_leaf(&Pubkey::new_from_array([99; 32]), 1, 1);
        assert!(!verify_merkle_proof(bogus, &proof, root));
    }
}

/// Slot count helpers exposed for off-chain TS sanity checks.
///
/// These functions wrap `THRONE_SETTLEMENT_SLOTS` arithmetic so it can be
/// unit-tested in isolation and re-used from any future instruction without
/// re-deriving the constant inline.
pub mod slots {
    use crate::constants::THRONE_SETTLEMENT_SLOTS;

    /// Returns the slot at which the settlement window ends, given the slot
    /// the first capture happened on. Saturating to avoid wraparound on a
    /// pathological slot value that exceeds u64::MAX - window.
    pub fn settles_at(first_capture_slot: u64) -> u64 {
        first_capture_slot.saturating_add(THRONE_SETTLEMENT_SLOTS)
    }

    /// Returns true when `now` is past the settlement window.
    pub fn is_window_over(now: u64, settles_at_slot: u64) -> bool {
        settles_at_slot != 0 && now >= settles_at_slot
    }
}

#[cfg(test)]
mod slot_tests {
    use super::slots;
    use crate::constants::THRONE_SETTLEMENT_SLOTS;

    #[test]
    fn settles_at_window() {
        assert_eq!(slots::settles_at(0), THRONE_SETTLEMENT_SLOTS);
        assert_eq!(slots::settles_at(100), 100 + THRONE_SETTLEMENT_SLOTS);
    }

    #[test]
    fn window_check() {
        let start = 1_000_000u64;
        let end = slots::settles_at(start);
        assert!(!slots::is_window_over(start, end));
        assert!(!slots::is_window_over(end - 1, end));
        assert!(slots::is_window_over(end, end));
        assert!(slots::is_window_over(end + 1, end));
        assert!(!slots::is_window_over(end, 0));
    }
}
