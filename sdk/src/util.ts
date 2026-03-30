import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import { MAX_KOL_NAME_BYTES } from "./constants";

/**
 * Convert a SOL amount (number or bigint) into integer lamports as a
 * bigint. Truncates beyond 9 decimals.
 */
export function solToLamports(sol: number | string): bigint {
  const s = typeof sol === "number" ? sol.toString() : sol;
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`solToLamports: invalid SOL amount ${s}`);
  }
  const negative = s.startsWith("-");
  const body = negative ? s.slice(1) : s;
  const [whole, frac = ""] = body.split(".");
  const fracPadded = (frac + "000000000").slice(0, 9);
  const lamports = BigInt(whole) * BigInt(LAMPORTS_PER_SOL) + BigInt(fracPadded);
  return negative ? -lamports : lamports;
}

/**
 * Convert lamports to a decimal SOL string with up to 9 decimal places
 * and no trailing zeros.
 */
export function lamportsToSol(lamports: bigint): string {
  const negative = lamports < 0n;
  const abs = negative ? -lamports : lamports;
  const whole = abs / BigInt(LAMPORTS_PER_SOL);
  const frac = abs % BigInt(LAMPORTS_PER_SOL);
  let fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
  const body = fracStr.length > 0 ? `${whole.toString()}.${fracStr}` : whole.toString();
  return negative ? `-${body}` : body;
}

/**
 * Approximate slot count for a given duration in seconds using the
 * 400 ms target slot time.
 */
export function secondsToSlots(seconds: number | bigint): bigint {
  const s = typeof seconds === "bigint" ? seconds : BigInt(Math.floor(seconds));
  return (s * 1000n) / 400n;
}

/**
 * Inverse of secondsToSlots.
 */
export function slotsToSeconds(slots: bigint): bigint {
  return (slots * 400n) / 1000n;
}

/**
 * Encode a UTF-8 string into the fixed 32-byte buffer the program
 * expects for kol_name. Shorter names are zero-padded; longer names
 * throw.
 */
export function encodeKolName(name: string): Uint8Array {
  const bytes = Buffer.from(name, "utf8");
  if (bytes.length > MAX_KOL_NAME_BYTES) {
    throw new Error(
      `encodeKolName: name exceeds ${MAX_KOL_NAME_BYTES} bytes (got ${bytes.length})`
    );
  }
  const out = new Uint8Array(MAX_KOL_NAME_BYTES);
  out.set(bytes, 0);
  return out;
}

/**
 * Inverse of encodeKolName. Trailing zero bytes are stripped.
 */
export function decodeKolName(bytes: Uint8Array): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) {
    end--;
  }
  return Buffer.from(bytes.slice(0, end)).toString("utf8");
}

/**
 * Convert a base58 string into a PublicKey, validating it on the way.
 */
export function pubkeyFromBase58(s: string): PublicKey {
  const raw = bs58.decode(s);
  if (raw.length !== 32) {
    throw new Error(`pubkeyFromBase58: expected 32 byte key, got ${raw.length}`);
  }
  return new PublicKey(raw);
}

/**
 * Encode a u64 little endian byte buffer. Used for distribution PDA
 * seeds and for the merkle leaf hashing pre-image.
 */
export function u64LeBytes(value: bigint): Uint8Array {
  if (value < 0n) {
    throw new Error("u64LeBytes: negative value");
  }
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/**
 * Decode a u64 from the first 8 bytes of a little endian buffer.
 */
export function readU64Le(buf: Uint8Array, offset: number = 0): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) {
    v = (v << 8n) | BigInt(buf[offset + i]);
  }
  return v;
}

/**
 * Decode a u32 from the first 4 bytes of a little endian buffer.
 */
export function readU32Le(buf: Uint8Array, offset: number = 0): number {
  return (
    buf[offset] |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    (buf[offset + 3] << 24)
  );
}

/**
 * Write a 32-bit little endian unsigned int. Used by the borsh writer.
 */
export function writeU32Le(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

/**
 * Constant-time byte buffer equality. Used by merkle proof verification
 * to avoid leaking timing information about partial matches.
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Concatenate two byte buffers into a fresh Uint8Array.
 */
export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Lexicographic comparison of two byte buffers, returning a number
 * suitable for Array.prototype.sort.
 */
export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return a.length - b.length;
}
