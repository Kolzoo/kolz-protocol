/**
 * Example 05: settle_throne
 *
 * After 1_512_000 slots (about seven days at 0.4 seconds per slot) have
 * elapsed since the first capture, the oracle authority calls settle_throne
 * to:
 *
 *   1. Revoke the king PDA delegate from the current champion's ATA.
 *   2. Flip KingOfHill.settled = true.
 *
 * From that point onward, take_throne reverts with SettlementPeriodEnded
 * and the current champion permanently owns the NFT.
 *
 * Usage:
 *   ts-node examples/05_settle_throne.ts
 */

import {
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";

import {
  ColsClient,
  encodeKolName,
  findPetPda,
  findKingPda,
  fetchConfig,
  fetchKing,
} from "../sdk/src";

import {
  loadEnv,
  logHeader,
  shortAddress,
  airdropIfNeeded,
} from "./lib/env";

const DEFAULT_KOL_NAME = "satoshi-of-pumpfun";

async function main(): Promise<void> {
  logHeader("COLS example 05: settle_throne");

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

  const kolNameBytes = encodeKolName(process.env.COLS_KOL_NAME ?? DEFAULT_KOL_NAME);
  const kolOwner: PublicKey = process.env.COLS_KOL_OWNER
    ? new PublicKey(process.env.COLS_KOL_OWNER)
    : Keypair.generate().publicKey;

  const [petPda] = findPetPda(env.programId, kolOwner, kolNameBytes);
  const [kingPda] = findKingPda(env.programId, petPda);

  const king = await fetchKing(env.connection, kingPda);
  if (king === null) {
    throw new Error("KingOfHill PDA not found. Run 03_mint_nft.ts first.");
  }
  if (king.nftMint === null) {
    throw new Error("NFT mint missing from KingOfHill state");
  }
  if (king.settled) {
    process.stdout.write(`Throne already settled. Champion locked: ${king.currentChampion.toBase58()}\n`);
    return;
  }

  const currentSlot = await env.connection.getSlot(env.commitment);
  const target = king.settlesAtSlot;
  process.stdout.write(`pet pda       ${petPda.toBase58()}\n`);
  process.stdout.write(`king pda      ${kingPda.toBase58()}\n`);
  process.stdout.write(`current slot  ${currentSlot}\n`);
  process.stdout.write(`settle slot   ${target.toString()}\n`);
  process.stdout.write(`champion      ${king.currentChampion.toBase58()}\n`);

  if (BigInt(currentSlot) < target) {
    const remaining = target - BigInt(currentSlot);
    throw new Error(
      `SettlementNotReady: ${remaining.toString()} slots remaining (~${(Number(remaining) * 0.4 / 86400).toFixed(2)} days)`,
    );
  }

  await airdropIfNeeded(env, env.oracle.publicKey, 0.2);

  const ix = await client.settleThroneInstruction({
    oracle: env.oracle.publicKey,
    petPda,
    nftMint: king.nftMint,
    currentChampion: king.currentChampion,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(env.connection, tx, [env.oracle], {
    commitment: env.commitment,
  });
  process.stdout.write(`\nSettle transaction confirmed.\n`);
  process.stdout.write(`  signature ${sig}\n`);

  const after = await fetchKing(env.connection, kingPda);
  if (after === null) {
    throw new Error("KingOfHill PDA missing after settle");
  }
  if (!after.settled) {
    throw new Error("settled flag did not flip to true");
  }
  process.stdout.write(`\nThrone settled. Permanent champion: ${shortAddress(after.currentChampion)}\n`);
  process.stdout.write(`Takeovers across lifetime: ${after.takeOvers}\n`);
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
