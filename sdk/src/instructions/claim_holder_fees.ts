import {
  AccountMeta,
  PublicKey,
  SystemProgram,
  TransactionInstruction
} from "@solana/web3.js";
import { BorshWriter } from "../borsh";
import { IX_DISCRIMINATORS } from "../discriminators";
import { distributionPda, feeVaultPda, holderClaimPda } from "../pdas";
import { KOLZ_PROGRAM_ID } from "../constants";

/**
 * Arguments to claim a single holder's slice of an epoch.
 */
export interface ClaimHolderFeesArgs {
  holder: PublicKey;
  epoch: bigint;
  amount: bigint;
  proof: Uint8Array[];
  programId?: PublicKey;
}

/**
 * Build a claim_holder_fees TransactionInstruction.
 *
 * Accounts:
 *   0. holder                  [signer, writable]
 *   1. distribution PDA        []
 *   2. holder_claim PDA        [writable]
 *   3. fee_vault PDA           [writable]
 *   4. system program          []
 */
export function buildClaimHolderFeesIx(
  args: ClaimHolderFeesArgs
): TransactionInstruction {
  const programId = args.programId ?? KOLZ_PROGRAM_ID;
  if (args.amount <= 0n) {
    throw new Error("buildClaimHolderFeesIx: amount must be positive");
  }
  for (const node of args.proof) {
    if (node.length !== 32) {
      throw new Error("buildClaimHolderFeesIx: proof nodes must be 32 bytes each");
    }
  }

  const { address: distribution } = distributionPda(args.epoch, programId);
  const { address: holderClaim } = holderClaimPda(args.holder, args.epoch, programId);
  const { address: feeVault } = feeVaultPda(programId);

  const data = new BorshWriter()
    .raw(IX_DISCRIMINATORS.claimHolderFees)
    .u64(args.epoch)
    .u64(args.amount)
    .vecBytes32(args.proof)
    .toBuffer();

  const keys: AccountMeta[] = [
    { pubkey: args.holder, isSigner: true, isWritable: true },
    { pubkey: distribution, isSigner: false, isWritable: false },
    { pubkey: holderClaim, isSigner: false, isWritable: true },
    { pubkey: feeVault, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
  ];

  return new TransactionInstruction({ programId, keys, data });
}
