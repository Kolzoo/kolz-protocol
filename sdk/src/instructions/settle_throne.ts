import {
  AccountMeta,
  PublicKey,
  TransactionInstruction
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BorshWriter } from "../borsh";
import { IX_DISCRIMINATORS } from "../discriminators";
import { configPda, kingOfHillPda, petPda } from "../pdas";
import { KOLZ_PROGRAM_ID } from "../constants";
import { encodeKolName } from "../util";

/**
 * Arguments to settle the king of hill state after the 7-day window.
 */
export interface SettleThroneArgs {
  oracle: PublicKey;
  kolOwner: PublicKey;
  kolName: string | Uint8Array;
  currentChampion: PublicKey;
  championNftAta: PublicKey;
  programId?: PublicKey;
}

/**
 * Build a settle_throne TransactionInstruction. The oracle must sign.
 *
 * Accounts:
 *   0. config                  []
 *   1. oracle                  [signer]
 *   2. pet                     []
 *   3. king                    [writable]
 *   4. current_champion        []
 *   5. champion_nft_ata        [writable]
 *   6. token program           []
 */
export function buildSettleThroneIx(args: SettleThroneArgs): TransactionInstruction {
  const programId = args.programId ?? KOLZ_PROGRAM_ID;

  const kolNameBytes =
    typeof args.kolName === "string" ? encodeKolName(args.kolName) : args.kolName;

  const { address: config } = configPda(programId);
  const { address: pet } = petPda(args.kolOwner, kolNameBytes, programId);
  const { address: king } = kingOfHillPda(pet, programId);

  const data = new BorshWriter().raw(IX_DISCRIMINATORS.settleThrone).toBuffer();

  const keys: AccountMeta[] = [
    { pubkey: config, isSigner: false, isWritable: false },
    { pubkey: args.oracle, isSigner: true, isWritable: false },
    { pubkey: pet, isSigner: false, isWritable: false },
    { pubkey: king, isSigner: false, isWritable: true },
    { pubkey: args.currentChampion, isSigner: false, isWritable: false },
    { pubkey: args.championNftAta, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
  ];

  return new TransactionInstruction({ programId, keys, data });
}
