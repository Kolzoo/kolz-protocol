import { PublicKey } from "@solana/web3.js";
import { BorshReader } from "./borsh";
import { ACCOUNT_DISCRIMINATORS, matchAccountDiscriminator } from "./discriminators";
import { DISCRIMINATOR_LEN, MAX_KOL_NAME_BYTES } from "./constants";
import {
  ConfigAccount,
  DistributionAccount,
  HolderClaimAccount,
  KingOfHillAccount,
  KolzAccount,
  LaunchAccount,
  PetAccount
} from "./types";
import { KolzError } from "./errors";

function stripDiscriminator(buf: Uint8Array, expected: Uint8Array, label: string): Uint8Array {
  if (!matchAccountDiscriminator(buf, expected)) {
    throw new KolzError(`decoder: account is not a ${label}`);
  }
  return buf.slice(DISCRIMINATOR_LEN);
}

/**
 * Decode a Config account from its raw on-chain buffer.
 * Layout: admin (32) | oracle (32) | fee_basis_points (u32) | bump (u8)
 */
export function decodeConfig(buf: Uint8Array): ConfigAccount {
  const body = stripDiscriminator(buf, ACCOUNT_DISCRIMINATORS.Config, "Config");
  const r = new BorshReader(body);
  const admin = r.pubkey();
  const oracle = r.pubkey();
  const feeBasisPoints = r.u32();
  const bump = r.u8();
  return { admin, oracle, feeBasisPoints, bump };
}

/**
 * Decode a Pet account.
 * Layout: owner (32) | kol_name ([u8;32]) | bonded_at (u64) | bump (u8)
 */
export function decodePet(buf: Uint8Array): PetAccount {
  const body = stripDiscriminator(buf, ACCOUNT_DISCRIMINATORS.Pet, "Pet");
  const r = new BorshReader(body);
  const owner = r.pubkey();
  const kolName = r.fixedBytes(MAX_KOL_NAME_BYTES);
  const bondedAt = r.u64();
  const bump = r.u8();
  return { owner, kolName, bondedAt, bump };
}

/**
 * Decode a Launch account.
 * Layout: pet (32) | pump_mint (32) | bonded_slot (u64) | real_sol (u64) |
 * real_token (u64) | creator_fees (u64) | total_volume (u64) |
 * graduated (bool) | bump (u8)
 */
export function decodeLaunch(buf: Uint8Array): LaunchAccount {
  const body = stripDiscriminator(buf, ACCOUNT_DISCRIMINATORS.Launch, "Launch");
  const r = new BorshReader(body);
  return {
    pet: r.pubkey(),
    pumpMint: r.pubkey(),
    bondedSlot: r.u64(),
    realSolReserve: r.u64(),
    realTokenReserve: r.u64(),
    creatorFeesLamports: r.u64(),
    totalVolumeLamports: r.u64(),
    graduated: r.bool(),
    bump: r.u8()
  };
}

/**
 * Decode a KingOfHill account.
 * Layout: pet (32) | nft_mint (32) | nft_escrow_vault (32) |
 * current_champion (32) | champion_balance (u64) |
 * last_captured_slot (u64) | take_overs (u32) | bump (u8) |
 * nft_escrow_vault_bump (u8) | settles_at_slot (u64) | settled (bool)
 */
export function decodeKingOfHill(buf: Uint8Array): KingOfHillAccount {
  const body = stripDiscriminator(buf, ACCOUNT_DISCRIMINATORS.KingOfHill, "KingOfHill");
  const r = new BorshReader(body);
  return {
    pet: r.pubkey(),
    nftMint: r.pubkey(),
    nftEscrowVault: r.pubkey(),
    currentChampion: r.pubkey(),
    championBalance: r.u64(),
    lastCapturedSlot: r.u64(),
    takeOvers: r.u32(),
    bump: r.u8(),
    nftEscrowVaultBump: r.u8(),
    settlesAtSlot: r.u64(),
    settled: r.bool()
  };
}

/**
 * Decode a Distribution account.
 * Layout: epoch (u64) | root ([u8;32]) | pool_lamports (u64) |
 * committed_at (u64) | bump (u8)
 */
export function decodeDistribution(buf: Uint8Array): DistributionAccount {
  const body = stripDiscriminator(buf, ACCOUNT_DISCRIMINATORS.Distribution, "Distribution");
  const r = new BorshReader(body);
  return {
    epoch: r.u64(),
    root: r.fixedBytes(32),
    poolLamports: r.u64(),
    committedAt: r.u64(),
    bump: r.u8()
  };
}

/**
 * Decode a HolderClaim account.
 * Layout: holder (32) | epoch (u64) | amount_claimed (u64) |
 * claimed_at_slot (u64) | bump (u8)
 */
export function decodeHolderClaim(buf: Uint8Array): HolderClaimAccount {
  const body = stripDiscriminator(buf, ACCOUNT_DISCRIMINATORS.HolderClaim, "HolderClaim");
  const r = new BorshReader(body);
  return {
    holder: r.pubkey(),
    epoch: r.u64(),
    amountClaimed: r.u64(),
    claimedAtSlot: r.u64(),
    bump: r.u8()
  };
}

/**
 * Dispatch on the discriminator and decode whichever kolz account
 * variant a raw buffer holds. Throws when no discriminator matches.
 */
export function decodeKolzAccount(buf: Uint8Array): KolzAccount {
  if (matchAccountDiscriminator(buf, ACCOUNT_DISCRIMINATORS.Config)) {
    return { kind: "config", data: decodeConfig(buf) };
  }
  if (matchAccountDiscriminator(buf, ACCOUNT_DISCRIMINATORS.Pet)) {
    return { kind: "pet", data: decodePet(buf) };
  }
  if (matchAccountDiscriminator(buf, ACCOUNT_DISCRIMINATORS.Launch)) {
    return { kind: "launch", data: decodeLaunch(buf) };
  }
  if (matchAccountDiscriminator(buf, ACCOUNT_DISCRIMINATORS.KingOfHill)) {
    return { kind: "kingOfHill", data: decodeKingOfHill(buf) };
  }
  if (matchAccountDiscriminator(buf, ACCOUNT_DISCRIMINATORS.Distribution)) {
    return { kind: "distribution", data: decodeDistribution(buf) };
  }
  if (matchAccountDiscriminator(buf, ACCOUNT_DISCRIMINATORS.HolderClaim)) {
    return { kind: "holderClaim", data: decodeHolderClaim(buf) };
  }
  throw new KolzError("decoder: unknown account discriminator");
}

/**
 * Helper for callers fetching with getAccountInfo. Wraps the raw
 * account data slice as a PublicKey-tagged decoded variant.
 */
export interface DecodedAccount<T extends KolzAccount> {
  address: PublicKey;
  account: T;
}

export function tagDecoded<T extends KolzAccount>(
  address: PublicKey,
  account: T
): DecodedAccount<T> {
  return { address, account };
}
