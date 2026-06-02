/**
 * Example 04: take_throne (Alice captures, Bob seizes)
 *
 * Walks the King of the Hill capture protocol end to end with two challengers,
 * Alice and Bob. The script:
 *
 *   1. Verifies the NFT mint is parked in the escrow vault.
 *   2. Alice captures the NFT for the first time. The escrow vault transfers
 *      the NFT into Alice's ATA, Alice delegates her ATA to the king PDA,
 *      settles_at_slot is set to current_slot + 1_512_000.
 *   3. Bob now holds more of the memecoin than Alice. Bob captures: the king
 *      PDA pulls the NFT from Alice's ATA into Bob's ATA, and Bob delegates
 *      his ATA to the king PDA so the cycle repeats.
 *
 * The example loads or generates Alice and Bob keypairs and assumes they hold
 * the appropriate memecoin balances (which the oracle has snapshotted into
 * the launch state). For local devnet experiments, generated balances are
 * stubbed in via COLS_ALICE_BAL / COLS_BOB_BAL.
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
  findNftEscrowVaultPda,
  fetchKing,
} from "../sdk/src";

import {
  loadEnv,
  logHeader,
  shortAddress,
  airdropIfNeeded,
} from "./lib/env";

const DEFAULT_KOL_NAME = "satoshi-of-pumpfun";
const DEFAULT_ALICE_BAL = 1_000_000n * 10n ** 6n;
const DEFAULT_BOB_BAL = 5_000_000n * 10n ** 6n;

function loadChallenger(envKey: string, fallback: Keypair): Keypair {
  const raw = process.env[envKey];
  if (!raw) {
    return fallback;
  }
  const parsed = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

async function main(): Promise<void> {
  logHeader("COLS example 04: take_throne (Alice -> Bob)");

  const env = loadEnv();
  const client = new ColsClient({
    connection: env.connection,
    programId: env.programId,
    payer: env.wallet,
  });

  const kolNameBytes = encodeKolName(process.env.COLS_KOL_NAME ?? DEFAULT_KOL_NAME);
  const kolOwner: PublicKey = process.env.COLS_KOL_OWNER
    ? new PublicKey(process.env.COLS_KOL_OWNER)
    : Keypair.generate().publicKey;

  const [petPda] = findPetPda(env.programId, kolOwner, kolNameBytes);
  const [kingPda] = findKingPda(env.programId, petPda);
  const [escrowVault] = findNftEscrowVaultPda(env.programId, petPda);

  const king = await fetchKing(env.connection, kingPda);
  if (king === null) {
    throw new Error("KingOfHill PDA not found. Run 03_mint_nft.ts first.");
  }
  if (king.nftMint === null) {
    throw new Error("NFT mint missing from KingOfHill state");
  }
  if (king.settled) {
    throw new Error("Throne already settled. take_throne would revert.");
  }

  const alice = loadChallenger("COLS_ALICE_SECRET", Keypair.generate());
  const bob = loadChallenger("COLS_BOB_SECRET", Keypair.generate());

  process.stdout.write(`pet           ${petPda.toBase58()}\n`);
  process.stdout.write(`king          ${kingPda.toBase58()}\n`);
  process.stdout.write(`escrow vault  ${escrowVault.toBase58()}\n`);
  process.stdout.write(`nft mint      ${king.nftMint.toBase58()}\n`);
  process.stdout.write(`alice         ${alice.publicKey.toBase58()}\n`);
  process.stdout.write(`bob           ${bob.publicKey.toBase58()}\n`);

  await airdropIfNeeded(env, alice.publicKey, 0.5);
  await airdropIfNeeded(env, bob.publicKey, 0.5);

  const aliceBal = BigInt(process.env.COLS_ALICE_BAL ?? DEFAULT_ALICE_BAL.toString());
  const bobBal = BigInt(process.env.COLS_BOB_BAL ?? DEFAULT_BOB_BAL.toString());

  if (aliceBal <= king.championBalance) {
    throw new Error(
      `Alice balance ${aliceBal.toString()} is not greater than current champion balance ${king.championBalance.toString()}`,
    );
  }
  if (bobBal <= aliceBal) {
    throw new Error(
      `Bob balance ${bobBal.toString()} must exceed Alice balance ${aliceBal.toString()} to seize`,
    );
  }

  process.stdout.write(`\n--- Phase 1: Alice captures (first capture) ---\n`);
  const aliceIx = await client.takeThroneInstruction({
    challenger: alice.publicKey,
    petPda,
    nftMint: king.nftMint,
    previousChampionAta: null,
    challengerBalance: aliceBal,
  });
  const aliceTx = new Transaction().add(aliceIx);
  const aliceSig = await sendAndConfirmTransaction(
    env.connection,
    aliceTx,
    [alice],
    { commitment: env.commitment },
  );
  process.stdout.write(`  signature ${aliceSig}\n`);

  const afterAlice = await fetchKing(env.connection, kingPda);
  if (afterAlice === null) {
    throw new Error("KingOfHill PDA disappeared mid-flow");
  }
  if (!afterAlice.currentChampion.equals(alice.publicKey)) {
    throw new Error(
      `Champion mismatch: expected ${alice.publicKey.toBase58()}, got ${afterAlice.currentChampion.toBase58()}`,
    );
  }
  process.stdout.write(
    `  champion        ${shortAddress(afterAlice.currentChampion)}\n`,
  );
  process.stdout.write(
    `  champion balance ${afterAlice.championBalance.toString()}\n`,
  );
  process.stdout.write(`  takeovers        ${afterAlice.takeOvers}\n`);
  process.stdout.write(`  settles_at_slot  ${afterAlice.settlesAtSlot.toString()}\n`);

  process.stdout.write(`\n--- Phase 2: Bob seizes (delegated transfer) ---\n`);
  const bobIx = await client.takeThroneInstruction({
    challenger: bob.publicKey,
    petPda,
    nftMint: king.nftMint,
    previousChampionAta: afterAlice.currentChampion,
    challengerBalance: bobBal,
  });
  const bobTx = new Transaction().add(bobIx);
  const bobSig = await sendAndConfirmTransaction(env.connection, bobTx, [bob], {
    commitment: env.commitment,
  });
  process.stdout.write(`  signature ${bobSig}\n`);

  const afterBob = await fetchKing(env.connection, kingPda);
  if (afterBob === null) {
    throw new Error("KingOfHill PDA missing after Bob's capture");
  }
  if (!afterBob.currentChampion.equals(bob.publicKey)) {
    throw new Error("Bob did not become the new champion");
  }
  process.stdout.write(
    `  champion        ${shortAddress(afterBob.currentChampion)}\n`,
  );
  process.stdout.write(
    `  champion balance ${afterBob.championBalance.toString()}\n`,
  );
  process.stdout.write(`  takeovers        ${afterBob.takeOvers}\n`);
  process.stdout.write(
    `  last_captured    slot ${afterBob.lastCapturedSlot.toString()}\n`,
  );
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
