import { PublicKey } from "@solana/web3.js";

/**
 * Anchor program Config PDA. seeds = ["config"].
 */
export interface ConfigAccount {
  admin: PublicKey;
  oracle: PublicKey;
  feeBasisPoints: number;
  bump: number;
}

/**
 * Per-KOL pet PDA. seeds = ["pet", kol_owner, kol_name].
 * kolName is the fixed 32-byte representation used on chain; trailing
 * zero bytes pad shorter names.
 */
export interface PetAccount {
  owner: PublicKey;
  kolName: Uint8Array;
  bondedAt: bigint;
  bump: number;
}

/**
 * Launch PDA. seeds = ["launch", pet PDA].
 * Mirrors the bonded pump.fun mint and the latest indexer snapshot of
 * its bonding curve reserves.
 */
export interface LaunchAccount {
  pet: PublicKey;
  pumpMint: PublicKey;
  bondedSlot: bigint;
  realSolReserve: bigint;
  realTokenReserve: bigint;
  creatorFeesLamports: bigint;
  totalVolumeLamports: bigint;
  graduated: boolean;
  bump: number;
}

/**
 * KingOfHill PDA. seeds = ["king", pet PDA].
 * Holds the 1/1 NFT mint and tracks the current top holder.
 */
export interface KingOfHillAccount {
  pet: PublicKey;
  nftMint: PublicKey;
  nftEscrowVault: PublicKey;
  currentChampion: PublicKey;
  championBalance: bigint;
  lastCapturedSlot: bigint;
  takeOvers: number;
  bump: number;
  nftEscrowVaultBump: number;
  settlesAtSlot: bigint;
  settled: boolean;
}

/**
 * Distribution root PDA. seeds = ["distribution", epoch.to_le_bytes()].
 */
export interface DistributionAccount {
  epoch: bigint;
  root: Uint8Array;
  poolLamports: bigint;
  committedAt: bigint;
  bump: number;
}

/**
 * Per-holder claim receipt PDA.
 * seeds = ["holder_claim", holder, epoch.to_le_bytes()].
 */
export interface HolderClaimAccount {
  holder: PublicKey;
  epoch: bigint;
  amountClaimed: bigint;
  claimedAtSlot: bigint;
  bump: number;
}

/**
 * Union of every Anchor account type the SDK can decode.
 */
export type ColsAccount =
  | { kind: "config"; data: ConfigAccount }
  | { kind: "pet"; data: PetAccount }
  | { kind: "launch"; data: LaunchAccount }
  | { kind: "kingOfHill"; data: KingOfHillAccount }
  | { kind: "distribution"; data: DistributionAccount }
  | { kind: "holderClaim"; data: HolderClaimAccount };

/**
 * Mirror of the on-chain #[error_code] enum. The numeric value matches
 * the variant index used by Anchor at runtime.
 */
export enum ErrorCode {
  Unauthorized = 6000,
  OracleMismatch = 6001,
  AdminMismatch = 6002,
  NotTopHolder = 6003,
  SettlementPeriodEnded = 6004,
  AlreadySettled = 6005,
  SettlementNotReady = 6006,
  MissingPrevChampionAta = 6007,
  MissingMetadataProgram = 6008,
  AlreadyClaimed = 6009,
  InvalidProof = 6010,
  EpochNotCommitted = 6011,
  InsufficientVault = 6012,
  InvalidAmount = 6013,
  NameTooLong = 6014,
  UriTooLong = 6015,
  SymbolTooLong = 6016,
  BondingCurveNotInitialized = 6017
}

/**
 * Human friendly enum name for an error code, used by ColsError.
 */
export type ErrorCodeName = keyof typeof ErrorCode;

/**
 * Optional callbacks the high level client emits during long flows.
 */
export interface ClientHooks {
  onInstructionBuilt?: (name: string) => void;
}

/**
 * Configuration for a ColsClient.
 */
export interface ColsClientOptions {
  programId?: PublicKey;
  apiBase?: string;
  hooks?: ClientHooks;
}

/**
 * Single leaf entry inside a distribution merkle tree. Used by both
 * the off-chain builder and the on-chain proof verifier.
 */
export interface DistributionLeaf {
  holder: PublicKey;
  epoch: bigint;
  amount: bigint;
}

/**
 * Result of building a merkle tree off-chain: the root that gets
 * committed and a map from holder to proof bytes.
 */
export interface MerkleTreeBuildResult {
  root: Uint8Array;
  proofs: Map<string, Uint8Array[]>;
}
