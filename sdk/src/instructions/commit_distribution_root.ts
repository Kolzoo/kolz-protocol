import {
  AccountMeta,
  PublicKey,
  SystemProgram,
  TransactionInstruction
} from "@solana/web3.js";
import { BorshWriter } from "../borsh";
import { IX_DISCRIMINATORS } from "../discriminators";
import { configPda, distributionPda } from "../pdas";
import { KOLZ_PROGRAM_ID } from "../constants";

/**
 * Arguments to commit a per-epoch merkle root that holders will use
 * to claim their share of pooled fees.
 */
export interface CommitDistributionRootArgs {
  oracle: PublicKey;
  epoch: bigint;
  root: Uint8Array;
  poolLamports: bigint;
  programId?: PublicKey;
}

/**
 * Build a commit_distribution_root TransactionInstruction.
 *
 * Accounts:
 *   0. config                []
 *   1. oracle                [signer, writable]
 *   2. distribution PDA      [writable]
 *   3. system program        []
 */
export function buildCommitDistributionRootIx(
  args: CommitDistributionRootArgs
): TransactionInstruction {
  const programId = args.programId ?? KOLZ_PROGRAM_ID;
  if (args.root.length !== 32) {
    throw new Error(
      `buildCommitDistributionRootIx: root must be 32 bytes, got ${args.root.length}`
    );
  }
  if (args.poolLamports <= 0n) {
    throw new Error("buildCommitDistributionRootIx: poolLamports must be positive");
  }

  const { address: config } = configPda(programId);
  const { address: distribution } = distributionPda(args.epoch, programId);

  const data = new BorshWriter()
    .raw(IX_DISCRIMINATORS.commitDistributionRoot)
    .u64(args.epoch)
    .fixedBytes(args.root, 32)
    .u64(args.poolLamports)
    .toBuffer();

  const keys: AccountMeta[] = [
    { pubkey: config, isSigner: false, isWritable: false },
    { pubkey: args.oracle, isSigner: true, isWritable: true },
    { pubkey: distribution, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
  ];

  return new TransactionInstruction({ programId, keys, data });
}
