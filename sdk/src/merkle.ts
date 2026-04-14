import { keccak_256 } from "@noble/hashes/sha3";
import { PublicKey } from "@solana/web3.js";
import {
  bytesEqual,
  compareBytes,
  concatBytes,
  u64LeBytes
} from "./util";
import { DistributionLeaf, MerkleTreeBuildResult } from "./types";

/**
 * Hash a single distribution leaf. The pre-image format is fixed by
 * the on-chain verifier:
 *   leaf = keccak256(holder_pubkey || epoch_u64_le || amount_u64_le)
 * Total 32 + 8 + 8 = 48 input bytes.
 */
export function hashLeaf(leaf: DistributionLeaf): Uint8Array {
  const buf = new Uint8Array(48);
  buf.set(leaf.holder.toBytes(), 0);
  buf.set(u64LeBytes(leaf.epoch), 32);
  buf.set(u64LeBytes(leaf.amount), 40);
  return keccak_256(buf);
}

/**
 * Hash an internal node from two child hashes. To match the standard
 * OpenZeppelin merkle hash convention, children are ordered
 * lexicographically before hashing. This avoids the need to encode
 * left vs right position in the proof.
 */
export function hashPair(a: Uint8Array, b: Uint8Array): Uint8Array {
  const ordered = compareBytes(a, b) <= 0 ? concatBytes(a, b) : concatBytes(b, a);
  return keccak_256(ordered);
}

/**
 * Build a merkle tree over the given leaves. Returns the root and a
 * map from holder base58 address to the proof byte arrays the holder
 * needs to claim. The pool_lamports field is the caller's
 * responsibility; this builder only handles the hashing.
 */
export function buildMerkleTree(leaves: DistributionLeaf[]): MerkleTreeBuildResult {
  if (leaves.length === 0) {
    throw new Error("buildMerkleTree: at least one leaf is required");
  }
  const leafHashes: Uint8Array[] = leaves.map(hashLeaf);
  const layers: Uint8Array[][] = [leafHashes];

  let current = leafHashes;
  while (current.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : current[i];
      next.push(hashPair(left, right));
    }
    layers.push(next);
    current = next;
  }

  const root = current[0];
  const proofs = new Map<string, Uint8Array[]>();

  for (let leafIndex = 0; leafIndex < leaves.length; leafIndex++) {
    const proof: Uint8Array[] = [];
    let index = leafIndex;
    for (let depth = 0; depth < layers.length - 1; depth++) {
      const layer = layers[depth];
      const siblingIndex = index ^ 1;
      if (siblingIndex < layer.length) {
        proof.push(layer[siblingIndex]);
      }
      index = Math.floor(index / 2);
    }
    proofs.set(leaves[leafIndex].holder.toBase58(), proof);
  }

  return { root, proofs };
}

/**
 * Verify a merkle proof. Matches the on-chain verifier byte-for-byte
 * by reusing hashLeaf and the sorted-pair hashPair. Returns true if
 * the proof reconstructs the expected root.
 */
export function verifyProof(
  leaf: DistributionLeaf,
  proof: Uint8Array[],
  root: Uint8Array
): boolean {
  let computed = hashLeaf(leaf);
  for (const sibling of proof) {
    computed = hashPair(computed, sibling);
  }
  return bytesEqual(computed, root);
}

/**
 * Convenience helper for building a leaf without explicitly importing
 * PublicKey at the call site.
 */
export function makeLeaf(
  holder: PublicKey,
  epoch: bigint,
  amount: bigint
): DistributionLeaf {
  return { holder, epoch, amount };
}
