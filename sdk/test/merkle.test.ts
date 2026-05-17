import { PublicKey } from "@solana/web3.js";
import {
  buildMerkleTree,
  hashLeaf,
  hashPair,
  makeLeaf,
  verifyProof
} from "../src/merkle";
import { bytesEqual } from "../src/util";

function pk(prefix: number): PublicKey {
  const bytes = new Uint8Array(32);
  bytes[0] = prefix;
  return new PublicKey(bytes);
}

describe("merkle", () => {
  it("hashes a leaf deterministically", () => {
    const leaf = makeLeaf(pk(1), 7n, 1000n);
    const h1 = hashLeaf(leaf);
    const h2 = hashLeaf(leaf);
    expect(bytesEqual(h1, h2)).toBe(true);
    expect(h1.length).toBe(32);
  });

  it("hashPair is commutative via lexicographic ordering", () => {
    const a = new Uint8Array(32);
    a[0] = 5;
    const b = new Uint8Array(32);
    b[0] = 9;
    const ab = hashPair(a, b);
    const ba = hashPair(b, a);
    expect(bytesEqual(ab, ba)).toBe(true);
  });

  it("builds a single-leaf tree where root equals leaf hash", () => {
    const leaf = makeLeaf(pk(42), 0n, 500n);
    const { root, proofs } = buildMerkleTree([leaf]);
    expect(bytesEqual(root, hashLeaf(leaf))).toBe(true);
    expect(proofs.get(pk(42).toBase58())?.length).toBe(0);
    expect(verifyProof(leaf, [], root)).toBe(true);
  });

  it("builds a 2-leaf tree and verifies both proofs", () => {
    const a = makeLeaf(pk(1), 3n, 100n);
    const b = makeLeaf(pk(2), 3n, 200n);
    const { root, proofs } = buildMerkleTree([a, b]);
    const pa = proofs.get(a.holder.toBase58())!;
    const pb = proofs.get(b.holder.toBase58())!;
    expect(pa.length).toBe(1);
    expect(pb.length).toBe(1);
    expect(verifyProof(a, pa, root)).toBe(true);
    expect(verifyProof(b, pb, root)).toBe(true);
  });

  it("builds a 5-leaf (odd) tree where the last leaf duplicates", () => {
    const leaves = [1, 2, 3, 4, 5].map((n) => makeLeaf(pk(n), 11n, BigInt(n * 100)));
    const { root, proofs } = buildMerkleTree(leaves);
    for (const leaf of leaves) {
      const proof = proofs.get(leaf.holder.toBase58())!;
      expect(verifyProof(leaf, proof, root)).toBe(true);
    }
  });

  it("rejects a tampered amount", () => {
    const a = makeLeaf(pk(1), 3n, 100n);
    const b = makeLeaf(pk(2), 3n, 200n);
    const { root, proofs } = buildMerkleTree([a, b]);
    const tampered = makeLeaf(pk(1), 3n, 101n);
    const proof = proofs.get(a.holder.toBase58())!;
    expect(verifyProof(tampered, proof, root)).toBe(false);
  });

  it("rejects empty leaf set", () => {
    expect(() => buildMerkleTree([])).toThrow();
  });

  it("produces identical roots for identical input ordering", () => {
    const leaves = [makeLeaf(pk(7), 1n, 10n), makeLeaf(pk(8), 1n, 20n)];
    const t1 = buildMerkleTree(leaves);
    const t2 = buildMerkleTree(leaves);
    expect(bytesEqual(t1.root, t2.root)).toBe(true);
  });
});
