/**
 * Example 06: commit_distribution_root
 *
 * Builds a keccak256 merkle tree from a five-holder snapshot, commits the
 * root and pool size on chain, and writes the per-leaf proofs to
 * data/distribution.sample.json so example 07 can claim from it.
 *
 * The leaf layout matches the on-chain verifier:
 *   leaf = keccak256( holder_pubkey_32 || epoch_u64_le || amount_u64_le )
 * Internal nodes use the sorted-pair scheme:
 *   parent = keccak256( min(left,right) || max(left,right) )
 *
 * Usage:
 *   ts-node examples/06_commit_distribution.ts
 */

import * as fs from "fs";
import * as path from "path";

import {
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";

import {
  ColsClient,
  findDistributionPda,
  fetchConfig,
  fetchDistribution,
  buildHolderMerkleTree,
  hashHolderLeaf,
} from "../sdk/src";

import {
  loadEnv,
  logHeader,
  shortAddress,
  airdropIfNeeded,
} from "./lib/env";

interface SnapshotEntry {
  address: string;
  balance: string;
  share_lamports: string;
}

interface Snapshot {
  epoch: number;
  snapshot_slot: number;
  total_pool_lamports: string;
  fee_basis_points: number;
  holders: SnapshotEntry[];
}

interface DistributionLeaf {
  address: string;
  amount: string;
  leaf_index: number;
  proof_hex: string[];
}

interface DistributionFile {
  epoch: number;
  merkle_root_hex: string;
  pool_lamports: string;
  committed_at_slot: number;
  leaves: DistributionLeaf[];
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

async function main(): Promise<void> {
  logHeader("COLS example 06: commit_distribution_root");

  const env = loadEnv();
  const client = new ColsClient({
    connection: env.connection,
    programId: env.programId,
    payer: env.oracle,
  });

  const config = await fetchConfig(env.connection, env.programId);
  if (config === null) {
    throw new Error("Config PDA missing. Run 01_init_config.ts first.");
  }
  if (!config.oracle.equals(env.oracle.publicKey)) {
    throw new Error("Signer is not the configured oracle authority");
  }

  const snapshotPath = path.resolve(
    process.cwd(),
    "examples/data/holder_snapshot.sample.json",
  );
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as Snapshot;
  process.stdout.write(`snapshot      ${snapshotPath}\n`);
  process.stdout.write(`epoch         ${snapshot.epoch}\n`);
  process.stdout.write(`holders       ${snapshot.holders.length}\n`);
  process.stdout.write(`pool lamports ${snapshot.total_pool_lamports}\n`);

  const epoch = BigInt(snapshot.epoch);
  const poolLamports = BigInt(snapshot.total_pool_lamports);

  const entries = snapshot.holders.map((h) => ({
    holder: new PublicKey(h.address),
    amount: BigInt(h.share_lamports),
  }));

  let totalShare = 0n;
  for (const e of entries) {
    totalShare += e.amount;
  }
  if (totalShare !== poolLamports) {
    throw new Error(
      `Sum of holder shares ${totalShare.toString()} does not equal pool ${poolLamports.toString()}`,
    );
  }

  const tree = buildHolderMerkleTree(entries, epoch);
  process.stdout.write(`merkle root   0x${toHex(tree.root)}\n`);
  process.stdout.write(`leaf count    ${tree.leaves.length}\n`);

  for (let i = 0; i < entries.length; i++) {
    const leafBytes = hashHolderLeaf(entries[i].holder, epoch, entries[i].amount);
    if (toHex(leafBytes) !== toHex(tree.leaves[i])) {
      throw new Error(`Leaf ${i} hash mismatch between buildHolderMerkleTree and hashHolderLeaf`);
    }
  }

  const [distributionPda, distributionBump] = findDistributionPda(
    env.programId,
    epoch,
  );
  process.stdout.write(`distribution  ${distributionPda.toBase58()} (bump ${distributionBump})\n`);

  const existing = await fetchDistribution(env.connection, env.programId, epoch);
  if (existing !== null) {
    process.stdout.write(`\nDistribution for epoch ${epoch.toString()} already committed at slot ${existing.committedAt.toString()}.\n`);
    process.stdout.write(`  existing root 0x${toHex(existing.root)}\n`);
    if (toHex(existing.root) !== toHex(tree.root)) {
      throw new Error("On-chain root differs from recomputed root for this snapshot");
    }
    return;
  }

  await airdropIfNeeded(env, env.oracle.publicKey, 0.2);

  const ix = await client.commitDistributionRootInstruction({
    oracle: env.oracle.publicKey,
    epoch,
    root: tree.root,
    poolLamports,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(env.connection, tx, [env.oracle], {
    commitment: env.commitment,
  });
  process.stdout.write(`\nCommit transaction confirmed.\n`);
  process.stdout.write(`  signature ${sig}\n`);

  const committedAtSlot = await env.connection.getSlot(env.commitment);

  const distributionFile: DistributionFile = {
    epoch: Number(epoch),
    merkle_root_hex: toHex(tree.root),
    pool_lamports: poolLamports.toString(),
    committed_at_slot: committedAtSlot,
    leaves: entries.map((entry, idx) => {
      const proof = tree.proofs[idx];
      return {
        address: entry.holder.toBase58(),
        amount: entry.amount.toString(),
        leaf_index: idx,
        proof_hex: proof.map((p) => toHex(p)),
      };
    }),
  };

  const outPath = path.resolve(
    process.cwd(),
    "examples/data/distribution.sample.json",
  );
  fs.writeFileSync(outPath, `${JSON.stringify(distributionFile, null, 2)}\n`, "utf8");
  process.stdout.write(`\nWrote proof bundle to ${outPath}\n`);
  process.stdout.write(`distribution pda recap: ${shortAddress(distributionPda)}\n`);
}

main().then(
  () => {
    process.stdout.write("\nDone.\n");
    process.exit(0);
  },
  (err) => {
    process.stderr.write(`\nFAILED: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
