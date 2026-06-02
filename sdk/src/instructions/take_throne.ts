import {
  AccountMeta,
  PublicKey,
  TransactionInstruction
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { BorshWriter } from "../borsh";
import { IX_DISCRIMINATORS } from "../discriminators";
import { kingOfHillPda, launchPda, nftEscrowVaultPda, petPda } from "../pdas";
import { COLS_PROGRAM_ID, NO_CHAMPION } from "../constants";
import { encodeKolName } from "../util";

/**
 * Arguments to challenge the current king and capture the NFT.
 */
export interface TakeThroneArgs {
  challenger: PublicKey;
  kolOwner: PublicKey;
  kolName: string | Uint8Array;
  pumpMint: PublicKey;
  nftMint: PublicKey;
  /**
   * Current champion address. When the throne has never been claimed,
   * pass NO_CHAMPION (= system program). When set to a real wallet the
   * caller MUST also provide prevChampionMemecoinAta and
   * prevChampionNftAta so the program can move the NFT off the old
   * champion.
   */
  currentChampion?: PublicKey;
  prevChampionMemecoinAta?: PublicKey;
  prevChampionNftAta?: PublicKey;
  programId?: PublicKey;
}

/**
 * Build a take_throne TransactionInstruction.
 *
 * Account layout:
 *   0. challenger                   [signer, writable]
 *   1. pet                          []
 *   2. launch                       []
 *   3. king                         [writable]
 *   4. nft_mint                     []
 *   5. nft_escrow_vault             []
 *   6. nft_escrow_ata               [writable]
 *   7. challenger_memecoin_ata      [writable]
 *   8. challenger_nft_ata           [writable]
 *   9. current_champion             []
 *  10. prev_champion_memecoin_ata   [writable] (or NO_CHAMPION clone)
 *  11. prev_champion_nft_ata        [writable] (or NO_CHAMPION clone)
 *  12. token program                []
 */
export function buildTakeThroneIx(args: TakeThroneArgs): TransactionInstruction {
  const programId = args.programId ?? COLS_PROGRAM_ID;
  const champion = args.currentChampion ?? NO_CHAMPION;
  const isFirstCapture = champion.equals(NO_CHAMPION);

  if (!isFirstCapture) {
    if (!args.prevChampionMemecoinAta || !args.prevChampionNftAta) {
      throw new Error(
        "buildTakeThroneIx: prevChampionMemecoinAta and prevChampionNftAta are required when currentChampion is set"
      );
    }
  }

  const kolNameBytes =
    typeof args.kolName === "string" ? encodeKolName(args.kolName) : args.kolName;

  const { address: pet } = petPda(args.kolOwner, kolNameBytes, programId);
  const { address: launch } = launchPda(pet, programId);
  const { address: king } = kingOfHillPda(pet, programId);
  const { address: nftEscrowVault } = nftEscrowVaultPda(king, programId);

  const escrowAta = getAssociatedTokenAddressSync(args.nftMint, nftEscrowVault, true);
  const challengerMemecoinAta = getAssociatedTokenAddressSync(
    args.pumpMint,
    args.challenger,
    false
  );
  const challengerNftAta = getAssociatedTokenAddressSync(
    args.nftMint,
    args.challenger,
    false
  );

  const prevMemecoinAta = isFirstCapture
    ? NO_CHAMPION
    : (args.prevChampionMemecoinAta as PublicKey);
  const prevNftAta = isFirstCapture
    ? NO_CHAMPION
    : (args.prevChampionNftAta as PublicKey);

  const data = new BorshWriter().raw(IX_DISCRIMINATORS.takeThrone).toBuffer();

  const keys: AccountMeta[] = [
    { pubkey: args.challenger, isSigner: true, isWritable: true },
    { pubkey: pet, isSigner: false, isWritable: false },
    { pubkey: launch, isSigner: false, isWritable: false },
    { pubkey: king, isSigner: false, isWritable: true },
    { pubkey: args.nftMint, isSigner: false, isWritable: false },
    { pubkey: nftEscrowVault, isSigner: false, isWritable: false },
    { pubkey: escrowAta, isSigner: false, isWritable: true },
    { pubkey: challengerMemecoinAta, isSigner: false, isWritable: true },
    { pubkey: challengerNftAta, isSigner: false, isWritable: true },
    { pubkey: champion, isSigner: false, isWritable: false },
    { pubkey: prevMemecoinAta, isSigner: false, isWritable: !isFirstCapture },
    { pubkey: prevNftAta, isSigner: false, isWritable: !isFirstCapture },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
  ];

  return new TransactionInstruction({ programId, keys, data });
}
