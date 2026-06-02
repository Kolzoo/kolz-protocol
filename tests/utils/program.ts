import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

export const DEFAULT_PROGRAM_ID = new PublicKey(
  "KLZooaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
);

export function loadIdl(): Idl {
  const idlPath = path.join(
    __dirname,
    "..",
    "..",
    "programs",
    "cols",
    "idl",
    "cols.json"
  );
  if (!fs.existsSync(idlPath)) {
    return synthesizeIdl();
  }
  const raw = fs.readFileSync(idlPath, "utf-8");
  return JSON.parse(raw) as Idl;
}

export function loadProgram(provider: AnchorProvider, programId?: PublicKey): Program {
  const idl = loadIdl();
  const id = programId ?? programIdFromIdl(idl);
  return new Program(idl, id, provider);
}

export function programIdFromIdl(idl: Idl): PublicKey {
  const metadata = (idl as unknown as { metadata?: { address?: string } }).metadata;
  if (metadata && metadata.address) {
    return new PublicKey(metadata.address);
  }
  return DEFAULT_PROGRAM_ID;
}

export function synthesizeIdl(): Idl {
  return {
    version: "0.1.0",
    name: "cols",
    instructions: [
      {
        name: "initConfig",
        accounts: [
          { name: "config", isMut: true, isSigner: false },
          { name: "admin", isMut: true, isSigner: true },
          { name: "systemProgram", isMut: false, isSigner: false },
        ],
        args: [
          { name: "oracleAuthority", type: "publicKey" },
          { name: "feeBasisPoints", type: "u32" },
        ],
      },
      {
        name: "oracleBindPumpfunLaunch",
        accounts: [
          { name: "config", isMut: false, isSigner: false },
          { name: "oracle", isMut: true, isSigner: true },
          { name: "kolOwner", isMut: false, isSigner: false },
          { name: "pumpMint", isMut: false, isSigner: false },
          { name: "pet", isMut: true, isSigner: false },
          { name: "launch", isMut: true, isSigner: false },
          { name: "systemProgram", isMut: false, isSigner: false },
        ],
        args: [{ name: "kolName", type: { array: ["u8", 32] } }],
      },
      {
        name: "mintKolNft",
        accounts: [
          { name: "config", isMut: false, isSigner: false },
          { name: "oracle", isMut: true, isSigner: true },
          { name: "pet", isMut: false, isSigner: false },
          { name: "king", isMut: true, isSigner: false },
          { name: "nftMint", isMut: true, isSigner: true },
          { name: "nftEscrowVault", isMut: true, isSigner: false },
          { name: "metadata", isMut: true, isSigner: false },
          { name: "tokenProgram", isMut: false, isSigner: false },
          { name: "associatedTokenProgram", isMut: false, isSigner: false },
          { name: "metadataProgram", isMut: false, isSigner: false },
          { name: "systemProgram", isMut: false, isSigner: false },
          { name: "rent", isMut: false, isSigner: false },
        ],
        args: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "uri", type: "string" },
        ],
      },
      {
        name: "takeThrone",
        accounts: [
          { name: "king", isMut: true, isSigner: false },
          { name: "pet", isMut: false, isSigner: false },
          { name: "challenger", isMut: true, isSigner: true },
          { name: "challengerKolAta", isMut: false, isSigner: false },
          { name: "challengerNftAta", isMut: true, isSigner: false },
          { name: "prevChampionNftAta", isMut: true, isSigner: false },
          { name: "nftMint", isMut: false, isSigner: false },
          { name: "nftEscrowVault", isMut: true, isSigner: false },
          { name: "tokenProgram", isMut: false, isSigner: false },
          { name: "associatedTokenProgram", isMut: false, isSigner: false },
          { name: "systemProgram", isMut: false, isSigner: false },
        ],
        args: [],
      },
      {
        name: "settleThrone",
        accounts: [
          { name: "config", isMut: false, isSigner: false },
          { name: "king", isMut: true, isSigner: false },
          { name: "oracle", isMut: false, isSigner: true },
          { name: "currentChampionAta", isMut: true, isSigner: false },
          { name: "tokenProgram", isMut: false, isSigner: false },
        ],
        args: [],
      },
      {
        name: "commitDistributionRoot",
        accounts: [
          { name: "config", isMut: false, isSigner: false },
          { name: "oracle", isMut: true, isSigner: true },
          { name: "distribution", isMut: true, isSigner: false },
          { name: "systemProgram", isMut: false, isSigner: false },
        ],
        args: [
          { name: "epoch", type: "u64" },
          { name: "root", type: { array: ["u8", 32] } },
          { name: "poolLamports", type: "u64" },
        ],
      },
      {
        name: "claimHolderFees",
        accounts: [
          { name: "distribution", isMut: false, isSigner: false },
          { name: "holderClaim", isMut: true, isSigner: false },
          { name: "holder", isMut: true, isSigner: true },
          { name: "feeVault", isMut: true, isSigner: false },
          { name: "systemProgram", isMut: false, isSigner: false },
        ],
        args: [
          { name: "epoch", type: "u64" },
          { name: "amount", type: "u64" },
          { name: "proof", type: { vec: { array: ["u8", 32] } } },
        ],
      },
    ],
    accounts: [
      {
        name: "Config",
        type: {
          kind: "struct",
          fields: [
            { name: "admin", type: "publicKey" },
            { name: "oracle", type: "publicKey" },
            { name: "feeBasisPoints", type: "u32" },
            { name: "bump", type: "u8" },
          ],
        },
      },
      {
        name: "Pet",
        type: {
          kind: "struct",
          fields: [
            { name: "owner", type: "publicKey" },
            { name: "kolName", type: { array: ["u8", 32] } },
            { name: "bondedAt", type: "u64" },
            { name: "bump", type: "u8" },
          ],
        },
      },
      {
        name: "Launch",
        type: {
          kind: "struct",
          fields: [
            { name: "pet", type: "publicKey" },
            { name: "pumpMint", type: "publicKey" },
            { name: "bondedSlot", type: "u64" },
            { name: "realSolReserve", type: "u64" },
            { name: "realTokenReserve", type: "u64" },
            { name: "creatorFeesLamports", type: "u64" },
            { name: "totalVolumeLamports", type: "u64" },
            { name: "graduated", type: "bool" },
            { name: "bump", type: "u8" },
          ],
        },
      },
      {
        name: "KingOfHill",
        type: {
          kind: "struct",
          fields: [
            { name: "pet", type: "publicKey" },
            { name: "nftMint", type: "publicKey" },
            { name: "nftEscrowVault", type: "publicKey" },
            { name: "currentChampion", type: "publicKey" },
            { name: "championBalance", type: "u64" },
            { name: "lastCapturedSlot", type: "u64" },
            { name: "takeOvers", type: "u32" },
            { name: "bump", type: "u8" },
            { name: "nftEscrowVaultBump", type: "u8" },
            { name: "settlesAtSlot", type: "u64" },
            { name: "settled", type: "bool" },
          ],
        },
      },
      {
        name: "Distribution",
        type: {
          kind: "struct",
          fields: [
            { name: "epoch", type: "u64" },
            { name: "root", type: { array: ["u8", 32] } },
            { name: "poolLamports", type: "u64" },
            { name: "committedAt", type: "u64" },
            { name: "bump", type: "u8" },
          ],
        },
      },
      {
        name: "HolderClaim",
        type: {
          kind: "struct",
          fields: [
            { name: "holder", type: "publicKey" },
            { name: "epoch", type: "u64" },
            { name: "amountClaimed", type: "u64" },
            { name: "claimedAtSlot", type: "u64" },
            { name: "bump", type: "u8" },
          ],
        },
      },
    ],
    errors: [
      { code: 6000, name: "Unauthorized", msg: "Unauthorized signer" },
      { code: 6001, name: "OracleMismatch", msg: "Oracle key does not match config" },
      { code: 6002, name: "AdminMismatch", msg: "Admin key does not match config" },
      { code: 6003, name: "NotTopHolder", msg: "Challenger is not the top holder" },
      { code: 6004, name: "SettlementPeriodEnded", msg: "Settlement period has ended" },
      { code: 6005, name: "AlreadySettled", msg: "Throne already settled" },
      { code: 6006, name: "SettlementNotReady", msg: "Settlement window has not elapsed" },
      { code: 6007, name: "MissingPrevChampionAta", msg: "Previous champion ATA was not supplied" },
      { code: 6008, name: "MissingMetadataProgram", msg: "Metadata program account was not supplied" },
      { code: 6009, name: "AlreadyClaimed", msg: "Holder already claimed this epoch" },
      { code: 6010, name: "InvalidProof", msg: "Merkle proof did not verify" },
      { code: 6011, name: "EpochNotCommitted", msg: "Distribution epoch has not been committed" },
      { code: 6012, name: "InsufficientVault", msg: "Fee vault lamport balance is insufficient" },
      { code: 6013, name: "InvalidAmount", msg: "Amount must be greater than zero" },
      { code: 6014, name: "NameTooLong", msg: "Metadata name exceeds limit" },
      { code: 6015, name: "UriTooLong", msg: "Metadata uri exceeds limit" },
      { code: 6016, name: "SymbolTooLong", msg: "Metadata symbol exceeds limit" },
      { code: 6017, name: "BondingCurveNotInitialized", msg: "Bonding curve state is uninitialized" },
    ],
    metadata: {
      address: DEFAULT_PROGRAM_ID.toBase58(),
    },
  } as unknown as Idl;
}

export function asBn(value: number | bigint): anchor.BN {
  if (typeof value === "bigint") {
    return new anchor.BN(value.toString());
  }
  return new anchor.BN(value);
}
