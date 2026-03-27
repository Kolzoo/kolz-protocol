import { PublicKey } from "@solana/web3.js";

/**
 * Default program id for the KOLZ on-chain Anchor program.
 * The deployed program id is fixed across devnet and mainnet so the SDK
 * ships with this as the default. Callers may override per-client.
 */
export const KOLZ_PROGRAM_ID: PublicKey = new PublicKey(
  "KoLZ1111111111111111111111111111111111111111"
);

/**
 * Metaplex Token Metadata program id. Used by mint_kol_nft to attach
 * metadata V3 to the 1/1 NFT minted to the king of the hill escrow.
 */
export const TOKEN_METADATA_PROGRAM_ID: PublicKey = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

/**
 * System program id. Also used as the sentinel "no champion" value
 * inside the KingOfHill state.
 */
export const SYSTEM_PROGRAM_ID: PublicKey = new PublicKey(
  "11111111111111111111111111111111"
);

/**
 * Sentinel champion address for the king of hill state when no
 * challenger has captured the NFT yet.
 */
export const NO_CHAMPION: PublicKey = SYSTEM_PROGRAM_ID;

/**
 * KOLZ HTTP API base used for off-chain oracle data and merkle root
 * publishing. The client only reads from this endpoint, never writes.
 */
export const KOLZ_API_BASE: string = "https://kolz-api.fly.dev";

/**
 * PDA seed strings. These mirror the on-chain program seeds 1:1.
 */
export const SEED_CONFIG: Buffer = Buffer.from("config");
export const SEED_PET: Buffer = Buffer.from("pet");
export const SEED_LAUNCH: Buffer = Buffer.from("launch");
export const SEED_KING: Buffer = Buffer.from("king");
export const SEED_DISTRIBUTION: Buffer = Buffer.from("distribution");
export const SEED_HOLDER_CLAIM: Buffer = Buffer.from("holder_claim");
export const SEED_FEE_VAULT: Buffer = Buffer.from("fee_vault");
export const SEED_NFT_ESCROW_VAULT: Buffer = Buffer.from("nft_escrow_vault");

/**
 * Settlement window in slots. With Solana's 400 ms target slot time this
 * is approximately 7 days.
 */
export const SETTLEMENT_WINDOW_SLOTS: bigint = 1_512_000n;

/**
 * Maximum sizes enforced on user-supplied strings by the program.
 */
export const MAX_KOL_NAME_BYTES: number = 32;
export const MAX_NFT_NAME_BYTES: number = 32;
export const MAX_NFT_SYMBOL_BYTES: number = 10;
export const MAX_NFT_URI_BYTES: number = 200;

/**
 * Anchor account discriminator length. Every account first 8 bytes are
 * the SHA-256 of "account:<Name>" truncated to 8 bytes.
 */
export const DISCRIMINATOR_LEN: number = 8;
