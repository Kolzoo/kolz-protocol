/**
 * Example 03: mint_kol_nft
 *
 * The oracle mints the 1/1 King of the Hill NFT for a previously bonded pet.
 * The NFT is delivered to an escrow ATA controlled by the KingOfHill PDA,
 * and a Metaplex Token Metadata V3 account is created with the supplied
 * name, symbol, and URI.
 *
 *   KingOfHill seeds = ["king", pet]
 *   escrow ATA owner = KingOfHill PDA
 *
 * Usage:
 *   ts-node examples/03_mint_nft.ts
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
  findKingPda,
  findNftEscrowVaultPda,
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
const DEFAULT_NFT_NAME = "KOLZ Crown";
const DEFAULT_NFT_SYMBOL = "KCROWN";
const DEFAULT_NFT_URI = "https://kolz-api.fly.dev/metadata/sample.json";

async function main(): Promise<void> {
  logHeader("KOLZ example 03: mint 1/1 KingOfHill NFT");

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
    throw new Error("Signer is not the configured oracle authority");
  }

  const kolNameStr = process.env.KOLZ_KOL_NAME ?? DEFAULT_KOL_NAME;
  const kolNameBytes = encodeKolName(kolNameStr);
  const kolOwnerRaw = process.env.KOLZ_KOL_OWNER;
  const kolOwner: PublicKey = kolOwnerRaw
    ? new PublicKey(kolOwnerRaw)
    : Keypair.generate().publicKey;

  const [petPda] = findPetPda(env.programId, kolOwner, kolNameBytes);
  const [kingPda, kingBump] = findKingPda(env.programId, petPda);
  const [escrowVault, escrowBump] = findNftEscrowVaultPda(env.programId, petPda);

  process.stdout.write(`pet pda       ${petPda.toBase58()}\n`);
  process.stdout.write(`king pda      ${kingPda.toBase58()} (bump ${kingBump})\n`);
  process.stdout.write(`escrow vault  ${escrowVault.toBase58()} (bump ${escrowBump})\n`);

  await airdropIfNeeded(env, env.oracle.publicKey, 0.5);

  const existing = await fetchKing(env.connection, kingPda);
  if (existing !== null && existing.nftMint !== null) {
    process.stdout.write(`\nNFT already minted. mint=${existing.nftMint.toBase58()}\n`);
    return;
  }

  const mint = Keypair.generate();
  process.stdout.write(`nft mint      ${mint.publicKey.toBase58()}\n`);

  const nftName = (process.env.KOLZ_NFT_NAME ?? DEFAULT_NFT_NAME).slice(0, 32);
  const nftSymbol = (process.env.KOLZ_NFT_SYMBOL ?? DEFAULT_NFT_SYMBOL).slice(0, 10);
  const nftUri = (process.env.KOLZ_NFT_URI ?? DEFAULT_NFT_URI).slice(0, 200);

  process.stdout.write(`name          ${nftName}\n`);
  process.stdout.write(`symbol        ${nftSymbol}\n`);
  process.stdout.write(`uri           ${nftUri}\n`);

  const ix = await client.mintKolNftInstruction({
    oracle: env.oracle.publicKey,
    petPda,
    nftMint: mint.publicKey,
    name: nftName,
    symbol: nftSymbol,
    uri: nftUri,
  });

  const [configPda] = findConfigPda(env.programId);
  process.stdout.write(`config pda    ${configPda.toBase58()}\n`);

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(
    env.connection,
    tx,
    [env.oracle, mint],
    { commitment: env.commitment },
  );

  process.stdout.write(`\nMint transaction confirmed.\n`);
  process.stdout.write(`  signature ${sig}\n`);

  const king = await fetchKing(env.connection, kingPda);
  if (king === null) {
    throw new Error("KingOfHill PDA missing after mint");
  }

  process.stdout.write(`\nKingOfHill state:\n`);
  process.stdout.write(`  pet              ${king.pet.toBase58()}\n`);
  process.stdout.write(`  nft mint         ${king.nftMint?.toBase58() ?? "<none>"}\n`);
  process.stdout.write(`  escrow vault     ${king.nftEscrowVault?.toBase58() ?? "<none>"}\n`);
  process.stdout.write(`  current champion ${king.currentChampion.toBase58()}\n`);
  process.stdout.write(`  champion balance ${king.championBalance.toString()}\n`);
  process.stdout.write(`  takeovers        ${king.takeOvers}\n`);
  process.stdout.write(`  settled          ${king.settled}\n`);
  process.stdout.write(`  settles at slot  ${king.settlesAtSlot.toString()}\n`);
  process.stdout.write(`\nrecap mint=${shortAddress(mint.publicKey)} king=${shortAddress(kingPda)}\n`);
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
