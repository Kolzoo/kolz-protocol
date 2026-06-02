import { sha256 } from "@noble/hashes/sha256";
import { DISCRIMINATOR_LEN } from "./constants";

/**
 * Compute the 8-byte Anchor discriminator for either an instruction or
 * an account. Anchor takes the SHA-256 of "<namespace>:<name>" and
 * truncates the first 8 bytes.
 */
export function anchorDiscriminator(namespace: string, name: string): Uint8Array {
  const preimage = `${namespace}:${name}`;
  const digest = sha256(Buffer.from(preimage, "utf8"));
  return digest.slice(0, DISCRIMINATOR_LEN);
}

/**
 * Compute the discriminator for an Anchor instruction handler in a
 * Rust snake_case function. Anchor uses the "global" namespace for
 * all top level program instructions.
 */
export function instructionDiscriminator(snakeName: string): Uint8Array {
  return anchorDiscriminator("global", snakeName);
}

/**
 * Compute the discriminator Anchor stores at the front of an account
 * buffer. The struct name is the PascalCase Rust identifier.
 */
export function accountDiscriminator(structName: string): Uint8Array {
  return anchorDiscriminator("account", structName);
}

/**
 * Pre-computed instruction discriminators for the cols program.
 * Computed eagerly so callers do not pay the hash cost per ix build.
 */
export const IX_DISCRIMINATORS = {
  initConfig: instructionDiscriminator("init_config"),
  oracleBindPumpfunLaunch: instructionDiscriminator("oracle_bind_pumpfun_launch"),
  mintKolNft: instructionDiscriminator("mint_kol_nft"),
  takeThrone: instructionDiscriminator("take_throne"),
  settleThrone: instructionDiscriminator("settle_throne"),
  commitDistributionRoot: instructionDiscriminator("commit_distribution_root"),
  claimHolderFees: instructionDiscriminator("claim_holder_fees")
} as const;

/**
 * Pre-computed account discriminators for every state struct.
 */
export const ACCOUNT_DISCRIMINATORS = {
  Config: accountDiscriminator("Config"),
  Pet: accountDiscriminator("Pet"),
  Launch: accountDiscriminator("Launch"),
  KingOfHill: accountDiscriminator("KingOfHill"),
  Distribution: accountDiscriminator("Distribution"),
  HolderClaim: accountDiscriminator("HolderClaim")
} as const;

/**
 * Compare the first 8 bytes of an account buffer to a known
 * discriminator. Returns true if they match.
 */
export function matchAccountDiscriminator(
  buf: Uint8Array,
  expected: Uint8Array
): boolean {
  if (buf.length < DISCRIMINATOR_LEN) {
    return false;
  }
  for (let i = 0; i < DISCRIMINATOR_LEN; i++) {
    if (buf[i] !== expected[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Identify which cols account variant a raw buffer corresponds to,
 * or null if the discriminator does not match any known struct.
 */
export function classifyAccount(buf: Uint8Array): keyof typeof ACCOUNT_DISCRIMINATORS | null {
  const entries = Object.entries(ACCOUNT_DISCRIMINATORS) as Array<
    [keyof typeof ACCOUNT_DISCRIMINATORS, Uint8Array]
  >;
  for (const [name, disc] of entries) {
    if (matchAccountDiscriminator(buf, disc)) {
      return name;
    }
  }
  return null;
}
