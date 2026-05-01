/**
 * Example 01: init_config
 *
 * Creates (or reuses) the global Config PDA at seeds=["config"]. The signer of
 * this transaction becomes the protocol admin. The oracle pubkey written into
 * the Config is the only key authorized to submit oracle-gated instructions
 * such as bind_kol, mint_kol_nft, settle_throne, and commit_distribution_root.
 *
 * Usage:
 *   ts-node examples/01_init_config.ts
 *
 * Required env:
 *   KOLZ_RPC_URL, KOLZ_WALLET_PATH, KOLZ_ORACLE_PATH
 */

import { sendAndConfirmTransaction, Transaction } from "@solana/web3.js";

import {
  KolzClient,
  findConfigPda,
  fetchConfig,
} from "../sdk/src";

import {
  loadEnv,
  logHeader,
  shortAddress,
  airdropIfNeeded,
  lamportsToSol,
} from "./lib/env";

const DEFAULT_FEE_BPS = 150;

async function main(): Promise<void> {
  logHeader("KOLZ example 01: init_config");

  const env = loadEnv();
  const client = new KolzClient({
    connection: env.connection,
    programId: env.programId,
    payer: env.wallet,
  });

  const [configPda, configBump] = findConfigPda(env.programId);

  process.stdout.write(`rpc           ${env.rpcUrl}\n`);
  process.stdout.write(`program       ${env.programId.toBase58()}\n`);
  process.stdout.write(`admin         ${env.wallet.publicKey.toBase58()}\n`);
  process.stdout.write(`oracle        ${env.oracle.publicKey.toBase58()}\n`);
  process.stdout.write(`config pda    ${configPda.toBase58()}\n`);
  process.stdout.write(`config bump   ${configBump}\n`);

  await airdropIfNeeded(env, env.wallet.publicKey, 0.5);
  const balance = await env.connection.getBalance(env.wallet.publicKey);
  process.stdout.write(`admin balance ${lamportsToSol(balance)} SOL\n`);

  const existing = await fetchConfig(env.connection, env.programId);
  if (existing !== null) {
    process.stdout.write(`\nConfig already exists. Skipping init.\n`);
    process.stdout.write(`  admin              ${existing.admin.toBase58()}\n`);
    process.stdout.write(`  oracle             ${existing.oracle.toBase58()}\n`);
    process.stdout.write(`  fee basis points   ${existing.feeBasisPoints}\n`);
    process.stdout.write(`  bump               ${existing.bump}\n`);
    return;
  }

  const feeBps = Number(process.env.KOLZ_FEE_BPS ?? DEFAULT_FEE_BPS);
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error(`KOLZ_FEE_BPS out of range: ${feeBps}`);
  }
  process.stdout.write(`fee bps       ${feeBps}\n`);

  const ix = await client.initConfigInstruction({
    admin: env.wallet.publicKey,
    oracleAuthority: env.oracle.publicKey,
    feeBasisPoints: feeBps,
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(env.connection, tx, [env.wallet], {
    commitment: env.commitment,
    skipPreflight: false,
  });

  process.stdout.write(`\nConfig PDA created.\n`);
  process.stdout.write(`  signature ${sig}\n`);
  process.stdout.write(`  admin     ${shortAddress(env.wallet.publicKey)}\n`);
  process.stdout.write(`  oracle    ${shortAddress(env.oracle.publicKey)}\n`);

  const refreshed = await fetchConfig(env.connection, env.programId);
  if (refreshed === null) {
    throw new Error("Config account did not appear after init");
  }
  if (refreshed.feeBasisPoints !== feeBps) {
    throw new Error(
      `Fee bps mismatch: wrote ${feeBps}, read ${refreshed.feeBasisPoints}`,
    );
  }
}

main().then(
  () => {
    process.stdout.write("\nDone.\n");
    process.exit(0);
  },
  (err) => {
    process.stderr.write(`\nFAILED: ${err instanceof Error ? err.message : String(err)}\n`);
    if (err instanceof Error && err.stack) {
      process.stderr.write(`${err.stack}\n`);
    }
    process.exit(1);
  },
);
