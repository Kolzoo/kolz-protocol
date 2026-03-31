import { ErrorCode, ErrorCodeName } from "./types";

/**
 * Human friendly messages mirroring the on-chain #[msg(...)] strings.
 * Kept here so callers can render the same UI without round-tripping
 * the IDL.
 */
export const ERROR_MESSAGES: Record<ErrorCodeName, string> = {
  Unauthorized: "Signer is not authorized for this instruction",
  OracleMismatch: "Provided oracle account does not match the configured oracle",
  AdminMismatch: "Provided admin account does not match the configured admin",
  NotTopHolder: "Challenger does not hold strictly more than the current champion",
  SettlementPeriodEnded: "King of the hill settlement window has ended",
  AlreadySettled: "King of the hill state is already settled",
  SettlementNotReady: "Settlement window has not elapsed yet",
  MissingPrevChampionAta: "Previous champion ATA account is missing from the transaction",
  MissingMetadataProgram: "Token Metadata program account is missing from the transaction",
  AlreadyClaimed: "Holder has already claimed this epoch",
  InvalidProof: "Merkle proof does not match the committed root",
  EpochNotCommitted: "Distribution root for this epoch has not been committed",
  InsufficientVault: "Fee vault does not hold enough lamports to satisfy the claim",
  InvalidAmount: "Amount must be greater than zero",
  NameTooLong: "Name exceeds the on-chain length limit",
  UriTooLong: "URI exceeds the on-chain length limit",
  SymbolTooLong: "Symbol exceeds the on-chain length limit",
  BondingCurveNotInitialized: "Pump.fun bonding curve has not been initialized for this mint"
};

/**
 * Base error class for SDK and on-chain errors. Programmatically
 * distinguishable from generic Error via instanceof.
 */
export class KolzError extends Error {
  public readonly code: number | null;
  public readonly codeName: ErrorCodeName | null;

  public constructor(message: string, code?: number | null, codeName?: ErrorCodeName | null) {
    super(message);
    this.name = "KolzError";
    this.code = code ?? null;
    this.codeName = codeName ?? null;
    Object.setPrototypeOf(this, KolzError.prototype);
  }
}

/**
 * Error subclass produced when a Solana RPC call returns a program
 * error whose code maps to one of the kolz enum variants. The
 * original Solana logs are attached as the `logs` field for debugging.
 */
export class KolzProgramError extends KolzError {
  public readonly logs: string[];

  public constructor(codeName: ErrorCodeName, logs: string[] = []) {
    const code = ErrorCode[codeName];
    super(`${codeName}: ${ERROR_MESSAGES[codeName]}`, code, codeName);
    this.name = "KolzProgramError";
    this.logs = logs;
    Object.setPrototypeOf(this, KolzProgramError.prototype);
  }
}

/**
 * Resolve an anchor numeric error code into a human readable enum
 * name, or null if the code is not part of the kolz enum range.
 */
export function codeToName(code: number): ErrorCodeName | null {
  const entries = Object.entries(ErrorCode) as Array<[string, number | string]>;
  for (const [name, value] of entries) {
    if (typeof value === "number" && value === code) {
      return name as ErrorCodeName;
    }
  }
  return null;
}

/**
 * Parse Solana transaction logs for an "Error Code: <N>" line, return
 * a KolzProgramError when the code maps to our enum. Otherwise null.
 */
export function parseAnchorErrorLogs(logs: string[]): KolzProgramError | null {
  for (const line of logs) {
    const match = line.match(/Error Code: (\w+)/);
    if (match) {
      const name = match[1] as ErrorCodeName;
      if (name in ErrorCode) {
        return new KolzProgramError(name, logs);
      }
    }
    const numMatch = line.match(/custom program error: 0x([0-9a-fA-F]+)/);
    if (numMatch) {
      const code = parseInt(numMatch[1], 16);
      const name = codeToName(code);
      if (name) {
        return new KolzProgramError(name, logs);
      }
    }
  }
  return null;
}

/**
 * Wrap any thrown value into a KolzError. If the input is already a
 * KolzError it is returned unchanged.
 */
export function wrapUnknown(err: unknown): KolzError {
  if (err instanceof KolzError) {
    return err;
  }
  if (err instanceof Error) {
    return new KolzError(err.message);
  }
  return new KolzError(String(err));
}
