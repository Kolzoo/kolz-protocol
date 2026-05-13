import { PublicKey } from "@solana/web3.js";
import { keccak_256 } from "js-sha3";

export interface MerkleLeaf {
  holder: PublicKey;
  epoch: bigint;
  amount: bigint;
}

export interface MerkleProof {
  leaf: Buffer;
  proof: Buffer[];
  root: Buffer;
  index: number;
}

function keccak(data: Buffer): Buffer {
  const hash = keccak_256.create();
  hash.update(data);
  return Buffer.from(hash.hex(), "hex");
}

export function hashLeaf(leaf: MerkleLeaf): Buffer {
  const epochBuf = Buffer.alloc(8);
  epochBuf.writeBigUInt64LE(leaf.epoch, 0);
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(leaf.amount, 0);
  const concatenated = Buffer.concat([
    leaf.holder.toBuffer(),
    epochBuf,
    amountBuf,
  ]);
  return keccak(concatenated);
}

export function hashPair(a: Buffer, b: Buffer): Buffer {
  if (Buffer.compare(a, b) <= 0) {
    return keccak(Buffer.concat([a, b]));
  }
  return keccak(Buffer.concat([b, a]));
}

export class MerkleTree {
  public readonly layers: Buffer[][];

  constructor(leaves: Buffer[]) {
    if (leaves.length === 0) {
      throw new Error("MerkleTree requires at least one leaf");
    }
    const layers: Buffer[][] = [];
    layers.push(leaves.map((l) => Buffer.from(l)));
    while (layers[layers.length - 1].length > 1) {
      const current = layers[layers.length - 1];
      const next: Buffer[] = [];
      for (let i = 0; i < current.length; i += 2) {
        if (i + 1 < current.length) {
          next.push(hashPair(current[i], current[i + 1]));
        } else {
          next.push(current[i]);
        }
      }
      layers.push(next);
    }
    this.layers = layers;
  }

  root(): Buffer {
    return this.layers[this.layers.length - 1][0];
  }

  proofFor(index: number): Buffer[] {
    if (index < 0 || index >= this.layers[0].length) {
      throw new Error("leaf index out of range");
    }
    const proof: Buffer[] = [];
    let idx = index;
    for (let layer = 0; layer < this.layers.length - 1; layer++) {
      const nodes = this.layers[layer];
      const pairIdx = idx ^ 1;
      if (pairIdx < nodes.length) {
        proof.push(nodes[pairIdx]);
      }
      idx = Math.floor(idx / 2);
    }
    return proof;
  }
}

export function buildTree(leaves: MerkleLeaf[]): MerkleTree {
  const hashed = leaves.map(hashLeaf);
  return new MerkleTree(hashed);
}

export function buildProof(
  leaves: MerkleLeaf[],
  index: number
): MerkleProof {
  const tree = buildTree(leaves);
  return {
    leaf: hashLeaf(leaves[index]),
    proof: tree.proofFor(index),
    root: tree.root(),
    index,
  };
}

export function verifyProof(
  leaf: Buffer,
  proof: Buffer[],
  root: Buffer
): boolean {
  let acc = Buffer.from(leaf);
  for (const sibling of proof) {
    acc = hashPair(acc, sibling);
  }
  return Buffer.compare(acc, root) === 0;
}

export function rootAsArray(root: Buffer): number[] {
  return Array.from(root);
}

export function proofAsArrays(proof: Buffer[]): number[][] {
  return proof.map((p) => Array.from(p));
}
