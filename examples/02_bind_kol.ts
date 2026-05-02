/**
 * Example 02: oracle_bind_pumpfun_launch
 *
 * The oracle authority bonds a KOL identity to a pump.fun launch. Two PDAs
 * are created in this step:
 *
 *   Pet     seeds = ["pet", kol_owner, kol_name]
 *   Launch  seeds = ["launch", pet]
 *
 * kol_name is encoded as a fixed-width 32-byte buffer (right-padded with
 * zeros). The oracle is the only signer; the KOL owner and the pump mint
 * are referenced as read-only metadata.
 *
 * Usage:
 *   ts-node examples/02_bind_kol.ts
 */

import {
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";

import {
  KolzClient,
  encodeKolName,
  findConfigPda,
  findPetPda,
  findLaunchPda,
  fetchConfig,
  fetchPet,
  fetchLaunch,
} from "../sdk/src";

import {
  loadEnv,
  logHeader,
  shortAddress,
  airdropIfNeeded,
} from "./lib/env";

const DEFAULT_KOL_NAME = "satoshi-of-pumpfun";

async function main(): Promise<void> {
  logHeader("KOLZ example 02: bind KOL to pump.fun launch");

  const env = loadEnv();
  const client = new KolzClient({
    connection: env.connection,
    programId: env.programId,
    payer: env.oracle,
  });

  const config = await fetchConfig(env.connection, env.programId);
  if (config === null) {
    throw new Error("Config PDA missing. Run 01_init_config.ts first.");
  }
  if (!config.oracle.equals(env.oracle.publicKey)) {
    throw new Error(
      `Oracle mismatch: config oracle=${config.oracle.toBase58()}, signer=${env.oracle.publicKey.toBase58()}`,
    );
  }

  const kolNameStr = process.env.KOLZ_KOL_NAME ?? DEFAULT_KOL_NAME;
  const kolNameBytes = encodeKolName(kolNameStr);
  if (kolNameBytes.length !== 32) {
    throw new Error("encodeKolName must return exactly 32 bytes");
  }

  const kolOwnerRaw = process.env.KOLZ_KOL_OWNER;
  const kolOwner: PublicKey = kolOwnerRaw
    ? new PublicKey(kolOwnerRaw)
    : Keypair.generate().publicKey;

  const pumpMintRaw = process.env.KOLZ_PUMP_MINT;
  const pumpMint: PublicKey = pumpMintRaw
    ? new PublicKey(pumpMintRaw)
    : Keypair.generate().publicKey;

  const [configPda] = findConfigPda(env.programId);
  const [petPda, petBump] = findPetPda(env.programId, kolOwner, kolNameBytes);
  const [launchPda, launchBump] = findLaunchPda(env.programId, petPda);

  process.stdout.write(`kol name      ${kolNameStr}\n`);
  process.stdout.write(`kol owner     ${kolOwner.toBase58()}\n`);
  process.stdout.write(`pump mint     ${pumpMint.toBase58()}\n`);
  process.stdout.write(`config pda    ${configPda.toBase58()}\n`);
  process.stdout.write(`pet pda       ${petPda.toBase58()} (bump ${petBump})\n`);
  process.stdout.write(`launch pda    ${launchPda.toBase58()} (bump ${launchBump})\n`);

  await airdropIfNeeded(env, env.oracle.publicKey, 0.5);

  const existingLaunch = await fetchLaunch(env.connection, launchPda);
  if (existingLaunch !== null) {
    process.stdout.write(`\nLaunch already bonded at slot ${existingLaunch.bondedSlot.toString()}.\n`);
    return;
  }

  const ix = await client.oracleBindPumpfunLaunchInstruction({
    oracle: env.oracle.publicKey,
    kolOwner,
    pumpMint,
    kolName: kolNameBytes,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(env.connection, tx, [env.oracle], {
    commitment: env.commitment,
  });

  process.stdout.write(`\nBind transaction confirmed.\n`);
  process.stdout.write(`  signature ${sig}\n`);

  const pet = await fetchPet(env.connection, petPda);
  const launch = await fetchLaunch(env.connection, launchPda);
  if (pet === null || launch === null) {
    throw new Error("Pet or Launch PDA not found after bind");
  }

  process.stdout.write(`\nPet state:\n`);
  process.stdout.write(`  owner        ${pet.owner.toBase58()}\n`);
  process.stdout.write(`  bonded_at    slot ${pet.bondedAt.toString()}\n`);
  process.stdout.write(`Launch state:\n`);
  process.stdout.write(`  pump_mint    ${launch.pumpMint.toBase58()}\n`);
  process.stdout.write(`  graduated    ${launch.graduated}\n`);
  process.stdout.write(`  sol reserve  ${launch.realSolReserve.toString()}\n`);
  process.stdout.write(`  tok reserve  ${launch.realTokenReserve.toString()}\n`);

  const recap = {
    pet: shortAddress(petPda),
    launch: shortAddress(launchPda),
    pumpMint: shortAddress(pumpMint),
  };
  process.stdout.write(`\nrecap ${JSON.stringify(recap)}\n`);
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
