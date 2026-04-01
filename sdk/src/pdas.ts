import { PublicKey } from "@solana/web3.js";
import {
  KOLZ_PROGRAM_ID,
  SEED_CONFIG,
  SEED_PET,
  SEED_LAUNCH,
  SEED_KING,
  SEED_DISTRIBUTION,
  SEED_HOLDER_CLAIM,
  SEED_FEE_VAULT,
  SEED_NFT_ESCROW_VAULT
} from "./constants";
import { u64LeBytes } from "./util";

/**
 * Result tuple for a PDA derivation: the address plus the bump seed
 * that produced it.
 */
export interface PdaResult {
  address: PublicKey;
  bump: number;
}

function derive(seeds: Buffer[], programId: PublicKey): PdaResult {
  const [address, bump] = PublicKey.findProgramAddressSync(seeds, programId);
  return { address, bump };
}

/**
 * seeds = ["config"]
 */
export function configPda(programId: PublicKey = KOLZ_PROGRAM_ID): PdaResult {
  return derive([SEED_CONFIG], programId);
}

/**
 * seeds = ["pet", kol_owner, kol_name]
 * kolName must already be the canonical 32-byte buffer.
 */
export function petPda(
  kolOwner: PublicKey,
  kolName: Uint8Array,
  programId: PublicKey = KOLZ_PROGRAM_ID
): PdaResult {
  if (kolName.length !== 32) {
    throw new Error(
      `petPda: kolName must be 32 bytes, got ${kolName.length}`
    );
  }
  return derive(
    [SEED_PET, kolOwner.toBuffer(), Buffer.from(kolName)],
    programId
  );
}

/**
 * seeds = ["launch", pet PDA]
 */
export function launchPda(
  pet: PublicKey,
  programId: PublicKey = KOLZ_PROGRAM_ID
): PdaResult {
  return derive([SEED_LAUNCH, pet.toBuffer()], programId);
}

/**
 * seeds = ["king", pet PDA]
 */
export function kingOfHillPda(
  pet: PublicKey,
  programId: PublicKey = KOLZ_PROGRAM_ID
): PdaResult {
  return derive([SEED_KING, pet.toBuffer()], programId);
}

/**
 * seeds = ["nft_escrow_vault", king PDA]
 * The vault PDA is the ATA-style authority that holds the 1/1 NFT
 * before the first take_throne capture.
 */
export function nftEscrowVaultPda(
  king: PublicKey,
  programId: PublicKey = KOLZ_PROGRAM_ID
): PdaResult {
  return derive([SEED_NFT_ESCROW_VAULT, king.toBuffer()], programId);
}

/**
 * seeds = ["distribution", epoch.to_le_bytes()]
 */
export function distributionPda(
  epoch: bigint,
  programId: PublicKey = KOLZ_PROGRAM_ID
): PdaResult {
  return derive(
    [SEED_DISTRIBUTION, Buffer.from(u64LeBytes(epoch))],
    programId
  );
}

/**
 * seeds = ["holder_claim", holder, epoch.to_le_bytes()]
 */
export function holderClaimPda(
  holder: PublicKey,
  epoch: bigint,
  programId: PublicKey = KOLZ_PROGRAM_ID
): PdaResult {
  return derive(
    [SEED_HOLDER_CLAIM, holder.toBuffer(), Buffer.from(u64LeBytes(epoch))],
    programId
  );
}

/**
 * seeds = ["fee_vault"]
 * The PDA that holds the pooled creator fees before claim_holder_fees
 * transfers them out per merkle leaf.
 */
export function feeVaultPda(programId: PublicKey = KOLZ_PROGRAM_ID): PdaResult {
  return derive([SEED_FEE_VAULT], programId);
}
