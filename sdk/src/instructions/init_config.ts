import {
  AccountMeta,
  PublicKey,
  SystemProgram,
  TransactionInstruction
} from "@solana/web3.js";
import { BorshWriter } from "../borsh";
import { IX_DISCRIMINATORS } from "../discriminators";
import { configPda } from "../pdas";
import { COLS_PROGRAM_ID } from "../constants";

/**
 * Arguments to build an init_config instruction.
 */
export interface InitConfigArgs {
  admin: PublicKey;
  oracleAuthority: PublicKey;
  feeBasisPoints: number;
  programId?: PublicKey;
}

/**
 * Build an init_config TransactionInstruction. The admin signer must
 * also be the fee payer of the wrapping transaction.
 *
 * Accounts (in order, mirroring the on-chain context):
 *   0. config PDA          [writable]
 *   1. admin               [signer, writable]
 *   2. system program      []
 */
export function buildInitConfigIx(args: InitConfigArgs): TransactionInstruction {
  const programId = args.programId ?? COLS_PROGRAM_ID;
  const { address: config } = configPda(programId);

  if (args.feeBasisPoints < 0 || args.feeBasisPoints > 10_000) {
    throw new Error(
      `buildInitConfigIx: feeBasisPoints out of range (0..=10000): ${args.feeBasisPoints}`
    );
  }

  const data = new BorshWriter()
    .raw(IX_DISCRIMINATORS.initConfig)
    .pubkey(args.oracleAuthority)
    .u32(args.feeBasisPoints)
    .toBuffer();

  const keys: AccountMeta[] = [
    { pubkey: config, isSigner: false, isWritable: true },
    { pubkey: args.admin, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
  ];

  return new TransactionInstruction({ programId, keys, data });
}
