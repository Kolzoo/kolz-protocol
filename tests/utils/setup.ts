import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, Wallet, web3 } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

export const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
export const METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export interface TestContext {
  provider: AnchorProvider;
  connection: Connection;
  payer: Keypair;
  programId: PublicKey;
  oracle: Keypair;
  admin: Keypair;
}

export function loadKeypairFromFile(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, "utf-8");
  const arr = JSON.parse(raw) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

export function loadKeypairFromEnv(envVar: string): Keypair {
  const value = process.env[envVar];
  if (!value) {
    throw new Error("Environment variable " + envVar + " is not set");
  }
  if (fs.existsSync(value)) {
    return loadKeypairFromFile(value);
  }
  const arr = JSON.parse(value) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

export function generateFundedKeypair(): Keypair {
  return Keypair.generate();
}

export async function airdrop(
  connection: Connection,
  target: PublicKey,
  lamports: number
): Promise<string> {
  const sig = await connection.requestAirdrop(target, lamports);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      signature: sig,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    "confirmed"
  );
  return sig;
}

export async function airdropMany(
  connection: Connection,
  targets: PublicKey[],
  lamports: number
): Promise<void> {
  for (const target of targets) {
    await airdrop(connection, target, lamports);
  }
}

export function loadDevnetFixture(): {
  rpc: string;
  programId: string;
  oracle: string;
  feeBasisPoints: number;
} {
  const fixturePath = path.join(__dirname, "..", "fixtures", "devnet.json");
  const raw = fs.readFileSync(fixturePath, "utf-8");
  return JSON.parse(raw);
}

export function buildProvider(): AnchorProvider {
  const env = anchor.AnchorProvider.env();
  anchor.setProvider(env);
  return env;
}

export function buildLocalProvider(payer: Keypair): AnchorProvider {
  const url = process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899";
  const connection = new Connection(url, "confirmed");
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);
  return provider;
}

export async function createTestMint(
  connection: Connection,
  payer: Keypair,
  mintAuthority: PublicKey,
  decimals: number
): Promise<PublicKey> {
  return await createMint(
    connection,
    payer,
    mintAuthority,
    null,
    decimals
  );
}

export async function createAtaAndMint(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
  authority: Keypair,
  amount: number | bigint
): Promise<PublicKey> {
  const ata = await createAssociatedTokenAccount(connection, payer, mint, owner);
  await mintTo(connection, payer, mint, ata, authority, amount);
  return ata;
}

export async function ensureAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  const info = await connection.getAccountInfo(ata);
  if (info === null) {
    await createAssociatedTokenAccount(connection, payer, mint, owner);
  }
  return ata;
}

export function findConfigPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
}

export function findPetPda(
  programId: PublicKey,
  kolOwner: PublicKey,
  kolName: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pet"), kolOwner.toBuffer(), kolName],
    programId
  );
}

export function findLaunchPda(
  programId: PublicKey,
  pet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("launch"), pet.toBuffer()],
    programId
  );
}

export function findKingPda(
  programId: PublicKey,
  pet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("king"), pet.toBuffer()],
    programId
  );
}

export function findFeeVaultPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault")],
    programId
  );
}

export function findDistributionPda(
  programId: PublicKey,
  epoch: bigint
): [PublicKey, number] {
  const epochBytes = Buffer.alloc(8);
  epochBytes.writeBigUInt64LE(epoch, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("distribution"), epochBytes],
    programId
  );
}

export function findHolderClaimPda(
  programId: PublicKey,
  holder: PublicKey,
  epoch: bigint
): [PublicKey, number] {
  const epochBytes = Buffer.alloc(8);
  epochBytes.writeBigUInt64LE(epoch, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("holder_claim"), holder.toBuffer(), epochBytes],
    programId
  );
}

export function padKolName(name: string): Buffer {
  const buf = Buffer.alloc(32);
  const bytes = Buffer.from(name, "utf-8");
  if (bytes.length > 32) {
    throw new Error("kol_name exceeds 32 bytes");
  }
  bytes.copy(buf, 0);
  return buf;
}

export async function waitSlots(
  connection: Connection,
  slots: number
): Promise<void> {
  const start = await connection.getSlot("confirmed");
  let current = start;
  while (current < start + slots) {
    await new Promise((r) => setTimeout(r, 400));
    current = await connection.getSlot("confirmed");
  }
}

export function defaultPayer(): Keypair {
  const envPath = process.env.ANCHOR_WALLET;
  if (envPath && fs.existsSync(envPath)) {
    return loadKeypairFromFile(envPath);
  }
  return Keypair.generate();
}
