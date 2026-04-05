import {
  AccountMeta,
  PublicKey,
  SystemProgram,
  TransactionInstruction
} from "@solana/web3.js";
import { BorshWriter } from "../borsh";
import { IX_DISCRIMINATORS } from "../discriminators";
import { configPda, launchPda, petPda } from "../pdas";
import { KOLZ_PROGRAM_ID, MAX_KOL_NAME_BYTES } from "../constants";
import { encodeKolName } from "../util";

/**
 * Arguments to bind a freshly created pump.fun launch to a KOL.
 * kolName may be supplied either as a UTF-8 string (encoded to the
 * fixed 32-byte buffer here) or as the canonical Uint8Array.
 */
export interface BindLaunchArgs {
  oracle: PublicKey;
  kolOwner: PublicKey;
  kolName: string | Uint8Array;
  pumpMint: PublicKey;
  programId?: PublicKey;
}

/**
 * Build an oracle_bind_pumpfun_launch TransactionInstruction.
 *
 * Accounts (in order):
 *   0. config PDA          []
 *   1. oracle              [signer, writable]
 *   2. kol_owner           []
 *   3. pump_mint           []
 *   4. pet PDA             [writable]
 *   5. launch PDA          [writable]
 *   6. system program      []
 */
export function buildBindLaunchIx(args: BindLaunchArgs): TransactionInstruction {
  const programId = args.programId ?? KOLZ_PROGRAM_ID;
  const kolNameBytes =
    typeof args.kolName === "string" ? encodeKolName(args.kolName) : args.kolName;

  if (kolNameBytes.length !== MAX_KOL_NAME_BYTES) {
    throw new Error(
      `buildBindLaunchIx: kolName must be ${MAX_KOL_NAME_BYTES} bytes, got ${kolNameBytes.length}`
    );
  }

  const { address: config } = configPda(programId);
  const { address: pet } = petPda(args.kolOwner, kolNameBytes, programId);
  const { address: launch } = launchPda(pet, programId);

  const data = new BorshWriter()
    .raw(IX_DISCRIMINATORS.oracleBindPumpfunLaunch)
    .fixedBytes(kolNameBytes, MAX_KOL_NAME_BYTES)
    .toBuffer();

  const keys: AccountMeta[] = [
    { pubkey: config, isSigner: false, isWritable: false },
    { pubkey: args.oracle, isSigner: true, isWritable: true },
    { pubkey: args.kolOwner, isSigner: false, isWritable: false },
    { pubkey: args.pumpMint, isSigner: false, isWritable: false },
    { pubkey: pet, isSigner: false, isWritable: true },
    { pubkey: launch, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
  ];

  return new TransactionInstruction({ programId, keys, data });
}
