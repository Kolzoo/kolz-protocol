import {
  AccountMeta,
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { BorshWriter } from "../borsh";
import { IX_DISCRIMINATORS } from "../discriminators";
import { kingOfHillPda, nftEscrowVaultPda, petPda } from "../pdas";
import {
  COLS_PROGRAM_ID,
  MAX_NFT_NAME_BYTES,
  MAX_NFT_SYMBOL_BYTES,
  MAX_NFT_URI_BYTES,
  TOKEN_METADATA_PROGRAM_ID
} from "../constants";
import { encodeKolName } from "../util";

/**
 * Arguments to mint the 1/1 KOL NFT into the king of hill escrow vault.
 */
export interface MintKolNftArgs {
  oracle: PublicKey;
  kolOwner: PublicKey;
  kolName: string | Uint8Array;
  nftMint: PublicKey | Keypair;
  name: string;
  symbol: string;
  uri: string;
  programId?: PublicKey;
}

/**
 * Result of a mint_kol_nft build: the ix plus the generated NFT mint
 * keypair (when the caller didn't provide one) so the caller can sign.
 */
export interface MintKolNftBuildResult {
  instruction: TransactionInstruction;
  nftMint: PublicKey;
  nftMintKeypair: Keypair | null;
  escrowAta: PublicKey;
  king: PublicKey;
}

function deriveMetadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer()
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

function deriveMasterEditionPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from("edition")
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Build a mint_kol_nft TransactionInstruction. When nftMint is supplied
 * as a Keypair it must also sign the wrapping transaction (the mint
 * account is being initialized fresh).
 */
export function buildMintKolNftIx(args: MintKolNftArgs): MintKolNftBuildResult {
  const programId = args.programId ?? COLS_PROGRAM_ID;

  const nameBytes = Buffer.from(args.name, "utf8");
  if (nameBytes.length > MAX_NFT_NAME_BYTES) {
    throw new Error(
      `buildMintKolNftIx: name exceeds ${MAX_NFT_NAME_BYTES} bytes (got ${nameBytes.length})`
    );
  }
  const symbolBytes = Buffer.from(args.symbol, "utf8");
  if (symbolBytes.length > MAX_NFT_SYMBOL_BYTES) {
    throw new Error(
      `buildMintKolNftIx: symbol exceeds ${MAX_NFT_SYMBOL_BYTES} bytes (got ${symbolBytes.length})`
    );
  }
  const uriBytes = Buffer.from(args.uri, "utf8");
  if (uriBytes.length > MAX_NFT_URI_BYTES) {
    throw new Error(
      `buildMintKolNftIx: uri exceeds ${MAX_NFT_URI_BYTES} bytes (got ${uriBytes.length})`
    );
  }

  let mintKeypair: Keypair | null = null;
  let nftMint: PublicKey;
  if (args.nftMint instanceof PublicKey) {
    nftMint = args.nftMint;
  } else {
    mintKeypair = args.nftMint;
    nftMint = mintKeypair.publicKey;
  }

  const kolNameBytes =
    typeof args.kolName === "string" ? encodeKolName(args.kolName) : args.kolName;
  const { address: pet } = petPda(args.kolOwner, kolNameBytes, programId);
  const { address: king } = kingOfHillPda(pet, programId);
  const { address: vaultAuthority } = nftEscrowVaultPda(king, programId);
  const escrowAta = getAssociatedTokenAddressSync(nftMint, vaultAuthority, true);
  const metadata = deriveMetadataPda(nftMint);
  const masterEdition = deriveMasterEditionPda(nftMint);

  const data = new BorshWriter()
    .raw(IX_DISCRIMINATORS.mintKolNft)
    .string(args.name)
    .string(args.symbol)
    .string(args.uri)
    .toBuffer();

  const keys: AccountMeta[] = [
    { pubkey: args.oracle, isSigner: true, isWritable: true },
    { pubkey: pet, isSigner: false, isWritable: false },
    { pubkey: king, isSigner: false, isWritable: true },
    { pubkey: nftMint, isSigner: mintKeypair !== null, isWritable: true },
    { pubkey: vaultAuthority, isSigner: false, isWritable: false },
    { pubkey: escrowAta, isSigner: false, isWritable: true },
    { pubkey: metadata, isSigner: false, isWritable: true },
    { pubkey: masterEdition, isSigner: false, isWritable: true },
    { pubkey: TOKEN_METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
  ];

  const instruction = new TransactionInstruction({ programId, keys, data });
  return {
    instruction,
    nftMint,
    nftMintKeypair: mintKeypair,
    escrowAta,
    king
  };
}
