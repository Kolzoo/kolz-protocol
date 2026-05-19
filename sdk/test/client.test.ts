import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { KolzClient } from "../src/client";
import {
  IX_DISCRIMINATORS,
  ACCOUNT_DISCRIMINATORS
} from "../src/discriminators";
import { encodeKolName, decodeKolName, solToLamports, lamportsToSol } from "../src/util";
import { BorshReader, BorshWriter } from "../src/borsh";
import { KolzError, KolzProgramError, codeToName, parseAnchorErrorLogs } from "../src/errors";
import { ErrorCode } from "../src/types";
import { decodeConfig } from "../src/decoder";
import { NO_CHAMPION } from "../src/constants";

function pk(prefix: number): PublicKey {
  const bytes = new Uint8Array(32);
  bytes[0] = prefix;
  return new PublicKey(bytes);
}

function mockConnection(): Connection {
  const stub = {
    getAccountInfo: jest.fn().mockResolvedValue(null),
    getSlot: jest.fn().mockResolvedValue(123456)
  };
  return stub as unknown as Connection;
}

describe("KolzClient", () => {
  it("uses default program id when not provided", () => {
    const c = new KolzClient(mockConnection());
    expect(c.programId).toBeInstanceOf(PublicKey);
    expect(c.configAddress().address).toBeInstanceOf(PublicKey);
  });

  it("predicts settle slot at 1_512_000 ahead", () => {
    const c = new KolzClient(mockConnection());
    expect(c.predictSettleSlot(0n)).toBe(1_512_000n);
    expect(c.predictSettleSlot(1000n)).toBe(1_513_000n);
  });

  it("exposes NO_CHAMPION sentinel", () => {
    expect(KolzClient.noChampion().toBase58()).toBe(NO_CHAMPION.toBase58());
  });

  it("fetchConfig returns null when account is missing", async () => {
    const c = new KolzClient(mockConnection());
    expect(await c.fetchConfig()).toBeNull();
  });

  it("getCurrentSlot returns bigint", async () => {
    const c = new KolzClient(mockConnection());
    const s = await c.getCurrentSlot();
    expect(typeof s).toBe("bigint");
    expect(s).toBe(123456n);
  });

  it("builds init_config with correct discriminator prefix", () => {
    const c = new KolzClient(mockConnection());
    const ix = c.buildInitConfig({
      admin: pk(1),
      oracleAuthority: pk(2),
      feeBasisPoints: 250
    });
    expect(ix.programId.equals(c.programId)).toBe(true);
    const prefix = ix.data.subarray(0, 8);
    expect(Buffer.from(prefix).equals(Buffer.from(IX_DISCRIMINATORS.initConfig))).toBe(true);
    expect(ix.keys.length).toBe(3);
    expect(ix.keys[1].isSigner).toBe(true);
    expect(ix.keys[2].pubkey.equals(SystemProgram.programId)).toBe(true);
  });

  it("rejects fee_basis_points out of range", () => {
    const c = new KolzClient(mockConnection());
    expect(() =>
      c.buildInitConfig({ admin: pk(1), oracleAuthority: pk(2), feeBasisPoints: -1 })
    ).toThrow();
    expect(() =>
      c.buildInitConfig({ admin: pk(1), oracleAuthority: pk(2), feeBasisPoints: 10001 })
    ).toThrow();
  });

  it("builds bind_launch with 7 accounts", () => {
    const c = new KolzClient(mockConnection());
    const ix = c.buildBindLaunch({
      oracle: pk(1),
      kolOwner: pk(2),
      kolName: "doge",
      pumpMint: pk(3)
    });
    expect(ix.keys.length).toBe(7);
    expect(ix.keys[1].isSigner).toBe(true);
  });

  it("builds take_throne with first-capture sentinels", () => {
    const c = new KolzClient(mockConnection());
    const ix = c.buildTakeThrone({
      challenger: pk(1),
      kolOwner: pk(2),
      kolName: "alpha",
      pumpMint: pk(3),
      nftMint: pk(4)
    });
    expect(ix.keys.length).toBe(13);
    expect(ix.keys[9].pubkey.equals(NO_CHAMPION)).toBe(true);
    expect(ix.keys[10].pubkey.equals(NO_CHAMPION)).toBe(true);
    expect(ix.keys[11].pubkey.equals(NO_CHAMPION)).toBe(true);
  });

  it("rejects take_throne with champion but no prev ATAs", () => {
    const c = new KolzClient(mockConnection());
    expect(() =>
      c.buildTakeThrone({
        challenger: pk(1),
        kolOwner: pk(2),
        kolName: "alpha",
        pumpMint: pk(3),
        nftMint: pk(4),
        currentChampion: pk(99)
      })
    ).toThrow();
  });

  it("builds settle_throne with 7 accounts", () => {
    const c = new KolzClient(mockConnection());
    const ix = c.buildSettleThrone({
      oracle: pk(1),
      kolOwner: pk(2),
      kolName: "x",
      currentChampion: pk(3),
      championNftAta: pk(4)
    });
    expect(ix.keys.length).toBe(7);
    expect(ix.keys[1].isSigner).toBe(true);
  });

  it("builds commit_distribution_root and rejects bad input", () => {
    const c = new KolzClient(mockConnection());
    const root = new Uint8Array(32);
    root[0] = 7;
    const ix = c.buildCommitDistributionRoot({
      oracle: pk(1),
      epoch: 42n,
      root,
      poolLamports: 1000n
    });
    expect(ix.keys.length).toBe(4);
    expect(() =>
      c.buildCommitDistributionRoot({
        oracle: pk(1),
        epoch: 42n,
        root: new Uint8Array(16),
        poolLamports: 1000n
      })
    ).toThrow();
    expect(() =>
      c.buildCommitDistributionRoot({
        oracle: pk(1),
        epoch: 42n,
        root,
        poolLamports: 0n
      })
    ).toThrow();
  });

  it("builds claim_holder_fees with proof bytes", () => {
    const c = new KolzClient(mockConnection());
    const ix = c.buildClaimHolderFees({
      holder: pk(1),
      epoch: 5n,
      amount: 1234n,
      proof: [new Uint8Array(32), new Uint8Array(32)]
    });
    expect(ix.keys.length).toBe(5);
    expect(ix.keys[0].isSigner).toBe(true);
  });

  it("builds mint_kol_nft and returns escrow ATA", () => {
    const c = new KolzClient(mockConnection());
    const mintKp = Keypair.generate();
    const result = c.buildMintKolNft({
      oracle: pk(1),
      kolOwner: pk(2),
      kolName: "kol",
      nftMint: mintKp,
      name: "Kolz NFT",
      symbol: "KZ",
      uri: "https://example.invalid/n.json"
    });
    expect(result.nftMint.equals(mintKp.publicKey)).toBe(true);
    expect(result.nftMintKeypair).not.toBeNull();
    expect(result.escrowAta).toBeInstanceOf(PublicKey);
    expect(result.king).toBeInstanceOf(PublicKey);
  });

  it("rejects mint_kol_nft with oversized strings", () => {
    const c = new KolzClient(mockConnection());
    expect(() =>
      c.buildMintKolNft({
        oracle: pk(1),
        kolOwner: pk(2),
        kolName: "k",
        nftMint: pk(9),
        name: "a".repeat(33),
        symbol: "S",
        uri: "u"
      })
    ).toThrow();
  });

  it("invokes onInstructionBuilt hook", () => {
    const seen: string[] = [];
    const c = new KolzClient(mockConnection(), {
      hooks: { onInstructionBuilt: (n) => seen.push(n) }
    });
    c.buildInitConfig({ admin: pk(1), oracleAuthority: pk(2), feeBasisPoints: 0 });
    expect(seen).toEqual(["init_config"]);
  });
});

describe("util", () => {
  it("encodes and decodes kol names", () => {
    const name = "shiba";
    const encoded = encodeKolName(name);
    expect(encoded.length).toBe(32);
    expect(decodeKolName(encoded)).toBe(name);
  });

  it("rejects oversize kol names", () => {
    expect(() => encodeKolName("a".repeat(33))).toThrow();
  });

  it("round trips SOL/lamports", () => {
    expect(solToLamports("1")).toBe(1_000_000_000n);
    expect(lamportsToSol(1_000_000_000n)).toBe("1");
    expect(solToLamports("0.5")).toBe(500_000_000n);
    expect(lamportsToSol(500_000_000n)).toBe("0.5");
    expect(lamportsToSol(0n)).toBe("0");
  });
});

describe("borsh", () => {
  it("writes and reads primitives", () => {
    const buf = new BorshWriter().u8(7).u32(0x12345678).u64(1n << 40n).bool(true).toBuffer();
    const r = new BorshReader(buf);
    expect(r.u8()).toBe(7);
    expect(r.u32()).toBe(0x12345678);
    expect(r.u64()).toBe(1n << 40n);
    expect(r.bool()).toBe(true);
    expect(r.remaining()).toBe(0);
  });

  it("writes and reads strings and pubkeys", () => {
    const key = pk(33);
    const buf = new BorshWriter().string("hello").pubkey(key).toBuffer();
    const r = new BorshReader(buf);
    expect(r.string()).toBe("hello");
    expect(r.pubkey().equals(key)).toBe(true);
  });

  it("encodes vecBytes32", () => {
    const a = new Uint8Array(32);
    a[0] = 1;
    const b = new Uint8Array(32);
    b[0] = 2;
    const buf = new BorshWriter().vecBytes32([a, b]).toBuffer();
    const r = new BorshReader(buf);
    const v = r.vecBytes32();
    expect(v.length).toBe(2);
    expect(v[0][0]).toBe(1);
    expect(v[1][0]).toBe(2);
  });
});

describe("errors", () => {
  it("codeToName maps known anchor codes", () => {
    expect(codeToName(6003)).toBe("NotTopHolder");
    expect(codeToName(9999)).toBeNull();
  });

  it("parses anchor error logs by name", () => {
    const err = parseAnchorErrorLogs([
      "Program log: Instruction: TakeThrone",
      "Program log: Error Code: NotTopHolder",
      "Program log: Error Number: 6003"
    ]);
    expect(err).toBeInstanceOf(KolzProgramError);
    expect(err?.code).toBe(ErrorCode.NotTopHolder);
  });

  it("parses anchor error logs by hex code", () => {
    const err = parseAnchorErrorLogs([
      `Program failed: custom program error: 0x${(6010).toString(16)}`
    ]);
    expect(err).toBeInstanceOf(KolzProgramError);
    expect(err?.codeName).toBe("InvalidProof");
  });

  it("KolzError is distinguishable via instanceof", () => {
    const e = new KolzError("boom");
    expect(e).toBeInstanceOf(KolzError);
    expect(e).toBeInstanceOf(Error);
  });
});

describe("decoder integration", () => {
  it("round trips a Config account through encode + decode", () => {
    const admin = pk(11);
    const oracle = pk(22);
    const buf = new BorshWriter()
      .raw(ACCOUNT_DISCRIMINATORS.Config)
      .pubkey(admin)
      .pubkey(oracle)
      .u32(123)
      .u8(254)
      .toBuffer();
    const decoded = decodeConfig(buf);
    expect(decoded.admin.equals(admin)).toBe(true);
    expect(decoded.oracle.equals(oracle)).toBe(true);
    expect(decoded.feeBasisPoints).toBe(123);
    expect(decoded.bump).toBe(254);
  });
});
