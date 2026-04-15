import {
  Commitment,
  Connection,
  PublicKey,
  TransactionInstruction
} from "@solana/web3.js";
import {
  KOLZ_API_BASE,
  KOLZ_PROGRAM_ID,
  NO_CHAMPION,
  SETTLEMENT_WINDOW_SLOTS
} from "./constants";
import {
  buildBindLaunchIx,
  BindLaunchArgs,
  buildClaimHolderFeesIx,
  ClaimHolderFeesArgs,
  buildCommitDistributionRootIx,
  CommitDistributionRootArgs,
  buildInitConfigIx,
  InitConfigArgs,
  buildMintKolNftIx,
  MintKolNftArgs,
  MintKolNftBuildResult,
  buildSettleThroneIx,
  SettleThroneArgs,
  buildTakeThroneIx,
  TakeThroneArgs
} from "./instructions";
import {
  configPda,
  distributionPda,
  feeVaultPda,
  holderClaimPda,
  kingOfHillPda,
  launchPda,
  petPda,
  PdaResult
} from "./pdas";
import {
  decodeConfig,
  decodeDistribution,
  decodeHolderClaim,
  decodeKingOfHill,
  decodeKolzAccount,
  decodeLaunch,
  decodePet,
  DecodedAccount,
  tagDecoded
} from "./decoder";
import {
  ConfigAccount,
  DistributionAccount,
  HolderClaimAccount,
  KingOfHillAccount,
  KolzAccount,
  KolzClientOptions,
  LaunchAccount,
  PetAccount
} from "./types";
import { encodeKolName } from "./util";
import { KolzError } from "./errors";

/**
 * High level entry point. Each method returns a TransactionInstruction
 * (or a small bundle of them) ready for the caller to add to a
 * VersionedTransaction or legacy Transaction. The client never signs.
 */
export class KolzClient {
  public readonly connection: Connection;
  public readonly programId: PublicKey;
  public readonly apiBase: string;
  private readonly hooks: KolzClientOptions["hooks"];

  public constructor(connection: Connection, options: KolzClientOptions = {}) {
    this.connection = connection;
    this.programId = options.programId ?? KOLZ_PROGRAM_ID;
    this.apiBase = options.apiBase ?? KOLZ_API_BASE;
    this.hooks = options.hooks;
  }

  /**
   * Predict the program-derived address for the global Config PDA
   * under this client's program id.
   */
  public configAddress(): PdaResult {
    return configPda(this.programId);
  }

  /**
   * Derive the pet PDA for a given KOL.
   */
  public petAddress(kolOwner: PublicKey, kolName: string | Uint8Array): PdaResult {
    const bytes = typeof kolName === "string" ? encodeKolName(kolName) : kolName;
    return petPda(kolOwner, bytes, this.programId);
  }

  /**
   * Derive the launch PDA bonded to a given pet.
   */
  public launchAddress(pet: PublicKey): PdaResult {
    return launchPda(pet, this.programId);
  }

  /**
   * Derive the king of hill PDA for a given pet.
   */
  public kingAddress(pet: PublicKey): PdaResult {
    return kingOfHillPda(pet, this.programId);
  }

  /**
   * Derive the fee vault PDA holding pooled creator fees.
   */
  public feeVaultAddress(): PdaResult {
    return feeVaultPda(this.programId);
  }

  /**
   * Derive the distribution PDA for an epoch.
   */
  public distributionAddress(epoch: bigint): PdaResult {
    return distributionPda(epoch, this.programId);
  }

  /**
   * Derive the per-holder claim receipt PDA.
   */
  public holderClaimAddress(holder: PublicKey, epoch: bigint): PdaResult {
    return holderClaimPda(holder, epoch, this.programId);
  }

  /**
   * Build the init_config instruction.
   */
  public buildInitConfig(args: Omit<InitConfigArgs, "programId">): TransactionInstruction {
    const ix = buildInitConfigIx({ ...args, programId: this.programId });
    this.emit("init_config");
    return ix;
  }

  /**
   * Build the oracle_bind_pumpfun_launch instruction.
   */
  public buildBindLaunch(
    args: Omit<BindLaunchArgs, "programId">
  ): TransactionInstruction {
    const ix = buildBindLaunchIx({ ...args, programId: this.programId });
    this.emit("oracle_bind_pumpfun_launch");
    return ix;
  }

  /**
   * Build the mint_kol_nft instruction.
   */
  public buildMintKolNft(
    args: Omit<MintKolNftArgs, "programId">
  ): MintKolNftBuildResult {
    const result = buildMintKolNftIx({ ...args, programId: this.programId });
    this.emit("mint_kol_nft");
    return result;
  }

  /**
   * Build the take_throne instruction. When omitted, currentChampion
   * defaults to NO_CHAMPION (system program), which signals a first
   * capture.
   */
  public buildTakeThrone(
    args: Omit<TakeThroneArgs, "programId">
  ): TransactionInstruction {
    const ix = buildTakeThroneIx({ ...args, programId: this.programId });
    this.emit("take_throne");
    return ix;
  }

  /**
   * Build the settle_throne instruction.
   */
  public buildSettleThrone(
    args: Omit<SettleThroneArgs, "programId">
  ): TransactionInstruction {
    const ix = buildSettleThroneIx({ ...args, programId: this.programId });
    this.emit("settle_throne");
    return ix;
  }

  /**
   * Build the commit_distribution_root instruction.
   */
  public buildCommitDistributionRoot(
    args: Omit<CommitDistributionRootArgs, "programId">
  ): TransactionInstruction {
    const ix = buildCommitDistributionRootIx({ ...args, programId: this.programId });
    this.emit("commit_distribution_root");
    return ix;
  }

  /**
   * Build the claim_holder_fees instruction.
   */
  public buildClaimHolderFees(
    args: Omit<ClaimHolderFeesArgs, "programId">
  ): TransactionInstruction {
    const ix = buildClaimHolderFeesIx({ ...args, programId: this.programId });
    this.emit("claim_holder_fees");
    return ix;
  }

  /**
   * Fetch and decode the global Config PDA. Returns null when the
   * account does not exist yet.
   */
  public async fetchConfig(
    commitment?: Commitment
  ): Promise<DecodedAccount<{ kind: "config"; data: ConfigAccount }> | null> {
    const { address } = this.configAddress();
    const info = await this.connection.getAccountInfo(address, commitment);
    if (!info) return null;
    return tagDecoded(address, { kind: "config", data: decodeConfig(info.data) });
  }

  /**
   * Fetch and decode a Pet account.
   */
  public async fetchPet(
    kolOwner: PublicKey,
    kolName: string | Uint8Array,
    commitment?: Commitment
  ): Promise<DecodedAccount<{ kind: "pet"; data: PetAccount }> | null> {
    const { address } = this.petAddress(kolOwner, kolName);
    const info = await this.connection.getAccountInfo(address, commitment);
    if (!info) return null;
    return tagDecoded(address, { kind: "pet", data: decodePet(info.data) });
  }

  /**
   * Fetch and decode a Launch account.
   */
  public async fetchLaunch(
    pet: PublicKey,
    commitment?: Commitment
  ): Promise<DecodedAccount<{ kind: "launch"; data: LaunchAccount }> | null> {
    const { address } = this.launchAddress(pet);
    const info = await this.connection.getAccountInfo(address, commitment);
    if (!info) return null;
    return tagDecoded(address, { kind: "launch", data: decodeLaunch(info.data) });
  }

  /**
   * Fetch and decode a KingOfHill account.
   */
  public async fetchKing(
    pet: PublicKey,
    commitment?: Commitment
  ): Promise<DecodedAccount<{ kind: "kingOfHill"; data: KingOfHillAccount }> | null> {
    const { address } = this.kingAddress(pet);
    const info = await this.connection.getAccountInfo(address, commitment);
    if (!info) return null;
    return tagDecoded(address, {
      kind: "kingOfHill",
      data: decodeKingOfHill(info.data)
    });
  }

  /**
   * Fetch and decode a Distribution account for a specific epoch.
   */
  public async fetchDistribution(
    epoch: bigint,
    commitment?: Commitment
  ): Promise<DecodedAccount<{ kind: "distribution"; data: DistributionAccount }> | null> {
    const { address } = this.distributionAddress(epoch);
    const info = await this.connection.getAccountInfo(address, commitment);
    if (!info) return null;
    return tagDecoded(address, {
      kind: "distribution",
      data: decodeDistribution(info.data)
    });
  }

  /**
   * Fetch and decode a HolderClaim receipt.
   */
  public async fetchHolderClaim(
    holder: PublicKey,
    epoch: bigint,
    commitment?: Commitment
  ): Promise<DecodedAccount<{ kind: "holderClaim"; data: HolderClaimAccount }> | null> {
    const { address } = this.holderClaimAddress(holder, epoch);
    const info = await this.connection.getAccountInfo(address, commitment);
    if (!info) return null;
    return tagDecoded(address, {
      kind: "holderClaim",
      data: decodeHolderClaim(info.data)
    });
  }

  /**
   * Generic account loader. Decodes whichever kolz state variant the
   * account holds.
   */
  public async fetchAccount(
    address: PublicKey,
    commitment?: Commitment
  ): Promise<KolzAccount | null> {
    const info = await this.connection.getAccountInfo(address, commitment);
    if (!info) return null;
    return decodeKolzAccount(info.data);
  }

  /**
   * Return the predicted settles_at_slot for a fresh take_throne first
   * capture given a starting slot. Useful for previewing the UI
   * countdown without hitting RPC.
   */
  public predictSettleSlot(currentSlot: bigint): bigint {
    return currentSlot + SETTLEMENT_WINDOW_SLOTS;
  }

  /**
   * Return the sentinel address representing "no champion" used by
   * the on-chain state and the take_throne flow.
   */
  public static noChampion(): PublicKey {
    return NO_CHAMPION;
  }

  /**
   * Fetch the current cluster slot via the connection. Wrapper for
   * symmetry with the other helpers.
   */
  public async getCurrentSlot(commitment?: Commitment): Promise<bigint> {
    const slot = await this.connection.getSlot(commitment);
    if (!Number.isSafeInteger(slot)) {
      throw new KolzError(`getCurrentSlot: returned non-safe integer ${slot}`);
    }
    return BigInt(slot);
  }

  private emit(name: string): void {
    if (this.hooks && this.hooks.onInstructionBuilt) {
      this.hooks.onInstructionBuilt(name);
    }
  }
}
