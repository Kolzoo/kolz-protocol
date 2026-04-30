/**
 * Shared environment loader for the KOLZ example scripts.
 *
 * Reads a small set of variables from the process environment, falls back to
 * a colocated .env file when present, and exposes a single loadEnv() entry
 * point that every example consumes. Each script can run in isolation as long
 * as KOLZ_RPC_URL and KOLZ_WALLET_PATH point at a real cluster and a real
 * funded keypair.
 *
 * Environment variables consumed:
 *   KOLZ_RPC_URL          Solana JSON RPC endpoint (devnet by default)
 *   KOLZ_WS_URL           Optional websocket endpoint, derived from RPC if absent
 *   KOLZ_WALLET_PATH      Filesystem path to a JSON byte-array Solana keypair
 *   KOLZ_ORACLE_PATH      Filesystem path to the oracle authority keypair
 *   KOLZ_PROGRAM_ID       Deployed KOLZ program id, defaults to the devnet build
 *   KOLZ_COMMITMENT       Commitment level: processed | confirmed | finalized
 *   KOLZ_API_BASE         REST endpoint for the off-chain merkle / oracle service
 */

import * as fs from "fs";
import * as path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  Commitment,
} from "@solana/web3.js";

import { PROGRAM_ID as SDK_PROGRAM_ID, KOLZ_API_BASE } from "../../sdk/src";

const DEFAULT_RPC = "https://api.devnet.solana.com";
const DEFAULT_COMMITMENT: Commitment = "confirmed";
const DEFAULT_API = "https://kolz-api.fly.dev";

export interface KolzEnv {
  connection: Connection;
  wallet: Keypair;
  oracle: Keypair;
  programId: PublicKey;
  commitment: Commitment;
  apiBase: string;
  rpcUrl: string;
}

function readDotEnv(): void {
  const dotEnvPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(dotEnvPath)) {
    return;
  }
  const raw = fs.readFileSync(dotEnvPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadKeypair(filePath: string): Keypair {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`keypair not found at ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw) as number[];
  if (!Array.isArray(parsed) || parsed.length !== 64) {
    throw new Error(`keypair file ${resolved} is not a 64-byte JSON array`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

function parseCommitment(raw: string | undefined): Commitment {
  switch (raw) {
    case "processed":
    case "confirmed":
    case "finalized":
      return raw;
    default:
      return DEFAULT_COMMITMENT;
  }
}

export function loadEnv(): KolzEnv {
  readDotEnv();

  const rpcUrl = process.env.KOLZ_RPC_URL ?? DEFAULT_RPC;
  const wsUrl = process.env.KOLZ_WS_URL;
  const commitment = parseCommitment(process.env.KOLZ_COMMITMENT);

  const walletPath = process.env.KOLZ_WALLET_PATH;
  if (!walletPath) {
    throw new Error("KOLZ_WALLET_PATH is required (path to wallet keypair json)");
  }
  const oraclePath = process.env.KOLZ_ORACLE_PATH ?? walletPath;

  const wallet = loadKeypair(walletPath);
  const oracle = loadKeypair(oraclePath);

  const programIdRaw = process.env.KOLZ_PROGRAM_ID;
  const programId = programIdRaw ? new PublicKey(programIdRaw) : SDK_PROGRAM_ID;

  const apiBase = process.env.KOLZ_API_BASE ?? KOLZ_API_BASE ?? DEFAULT_API;

  const connection = new Connection(rpcUrl, {
    commitment,
    wsEndpoint: wsUrl,
  });

  return {
    connection,
    wallet,
    oracle,
    programId,
    commitment,
    apiBase,
    rpcUrl,
  };
}

export function shortAddress(pubkey: PublicKey): string {
  const s = pubkey.toBase58();
  return `${s.slice(0, 4)}..${s.slice(-4)}`;
}

export function lamportsToSol(lamports: number | bigint): string {
  const n = typeof lamports === "bigint" ? Number(lamports) : lamports;
  return (n / 1_000_000_000).toFixed(6);
}

export async function airdropIfNeeded(
  env: KolzEnv,
  target: PublicKey,
  minSol: number,
): Promise<void> {
  const balance = await env.connection.getBalance(target);
  const minLamports = Math.floor(minSol * 1_000_000_000);
  if (balance >= minLamports) {
    return;
  }
  const sig = await env.connection.requestAirdrop(target, minLamports);
  await env.connection.confirmTransaction(sig, env.commitment);
}

export function logHeader(title: string): void {
  const bar = "=".repeat(Math.max(8, title.length + 4));
  process.stdout.write(`\n${bar}\n  ${title}\n${bar}\n`);
}
