/**
 * Example 07: claim_holder_fees
 *
 * A holder presents a merkle proof against the committed distribution root
 * and receives their share of the fee vault. The proof bundle written by
 * example 06 (examples/data/distribution.sample.json) is the canonical input.
 *
 * Errors surfaced by the program:
 *   AlreadyClaimed       HolderClaim PDA already initialized for this epoch
 *   InvalidProof         merkle verification failed
 *   EpochNotCommitted    Distribution PDA for this epoch does not exist
 *   InsufficientVault    fee_vault balance < amount
 *
 * Usage:
 *   ts-node examples/07_claim_fees.ts
 */

import * as fs from "fs";
import * as path from "path";

import {
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";

import {
  KolzClient,
  findDistributionPda,
  findHolderClaimPda,
  findFeeVaultPda,
  fetchConfig,
  fetchDistribution,
  fetchHolderClaim,
  hashHolderLeaf,
  verifyHolderProof,
} from "../sdk/src";

import {
  loadEnv,
  logHeader,
  shortAddress,
  lamportsToSol,
} from "./lib/env";

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

function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${clean.length}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

async function main(): Promise<void> {
  logHeader("KOLZ example 07: claim_holder_fees");

  const env = loadEnv();
  const client = new KolzClient({
    connection: env.connection,
    programId: env.programId,
    payer: env.wallet,
  });

  const config = await fetchConfig(env.connection, env.programId);
  if (config === null) {
    throw new Error("Config PDA missing. Run 01_init_config.ts first.");
  }

  const distPath = path.resolve(
    process.cwd(),
    "examples/data/distribution.sample.json",
  );
  if (!fs.existsSync(distPath)) {
    throw new Error(`distribution bundle not found at ${distPath}; run 06 first`);
  }
  const dist = JSON.parse(fs.readFileSync(distPath, "utf8")) as DistributionFile;
  const epoch = BigInt(dist.epoch);
  const root = fromHex(dist.merkle_root_hex);
  if (root.length !== 32) {
    throw new Error(`expected 32 byte root, got ${root.length}`);
  }

  process.stdout.write(`epoch         ${epoch.toString()}\n`);
  process.stdout.write(`root          0x${dist.merkle_root_hex}\n`);
  process.stdout.write(`pool          ${dist.pool_lamports} lamports\n`);

  const claimer = env.wallet.publicKey;
  const claimerStr = claimer.toBase58();

  let leaf = dist.leaves.find((l) => l.address === claimerStr);
  if (!leaf) {
    leaf = dist.leaves[0];
    process.stdout.write(`\nWallet ${shortAddress(claimer)} not in snapshot.\n`);
    process.stdout.write(`Using leaf 0 (${shortAddress(new PublicKey(leaf.address))}) for demonstration.\n`);
  }

  const holderPubkey = new PublicKey(leaf.address);
  const amount = BigInt(leaf.amount);
  const proof: Uint8Array[] = leaf.proof_hex.map((h) => {
    const bytes = fromHex(h);
    if (bytes.length !== 32) {
      throw new Error(`proof segment must be 32 bytes, got ${bytes.length}`);
    }
    return bytes;
  });

  process.stdout.write(`holder        ${holderPubkey.toBase58()}\n`);
  process.stdout.write(`amount        ${amount.toString()} lamports (${lamportsToSol(amount)} SOL)\n`);
  process.stdout.write(`leaf index    ${leaf.leaf_index}\n`);
  process.stdout.write(`proof depth   ${proof.length}\n`);

  const leafHash = hashHolderLeaf(holderPubkey, epoch, amount);
  process.stdout.write(`leaf hash     0x${toHex(leafHash)}\n`);

  const ok = verifyHolderProof(root, leafHash, proof);
  if (!ok) {
    throw new Error("Local proof verification failed; refusing to send claim");
  }
  process.stdout.write(`proof check   ok (matches root)\n`);

  const [distributionPda] = findDistributionPda(env.programId, epoch);
  const [holderClaimPda] = findHolderClaimPda(env.programId, holderPubkey, epoch);
  const [feeVaultPda] = findFeeVaultPda(env.programId);
  process.stdout.write(`distribution  ${distributionPda.toBase58()}\n`);
  process.stdout.write(`holder claim  ${holderClaimPda.toBase58()}\n`);
  process.stdout.write(`fee vault     ${feeVaultPda.toBase58()}\n`);

  const onchain = await fetchDistribution(env.connection, env.programId, epoch);
  if (onchain === null) {
    throw new Error("Distribution PDA missing on chain; run 06 first");
  }
  if (toHex(onchain.root) !== toHex(root)) {
    throw new Error(
      `On-chain root 0x${toHex(onchain.root)} does not match local bundle 0x${toHex(root)}`,
    );
  }

  const existingClaim = await fetchHolderClaim(env.connection, env.programId, holderPubkey, epoch);
  if (existingClaim !== null) {
    process.stdout.write(`\nHolder already claimed ${existingClaim.amountClaimed.toString()} lamports at slot ${existingClaim.claimedAtSlot.toString()}.\n`);
    return;
  }

  const vaultBalance = await env.connection.getBalance(feeVaultPda);
  if (BigInt(vaultBalance) < amount) {
    throw new Error(
      `InsufficientVault: vault has ${vaultBalance} lamports, claim wants ${amount.toString()}`,
    );
  }

  if (!holderPubkey.equals(claimer)) {
    process.stdout.write(`\nSelected leaf does not match the loaded wallet.\n`);
    process.stdout.write(`The on-chain instruction requires the holder to sign. Switch KOLZ_WALLET_PATH and rerun.\n`);
    return;
  }

  const ix = await client.claimHolderFeesInstruction({
    holder: claimer,
    epoch,
    amount,
    proof,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(env.connection, tx, [env.wallet], {
    commitment: env.commitment,
  });

  process.stdout.write(`\nClaim transaction confirmed.\n`);
  process.stdout.write(`  signature ${sig}\n`);

  const after = await fetchHolderClaim(env.connection, env.programId, claimer, epoch);
  if (after === null) {
    throw new Error("HolderClaim PDA missing after claim");
  }
  process.stdout.write(`  claimed   ${after.amountClaimed.toString()} lamports\n`);
  process.stdout.write(`  at slot   ${after.claimedAtSlot.toString()}\n`);
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
