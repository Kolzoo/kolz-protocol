import { PublicKey } from "@solana/web3.js";
import {
  configPda,
  distributionPda,
  feeVaultPda,
  holderClaimPda,
  kingOfHillPda,
  launchPda,
  nftEscrowVaultPda,
  petPda
} from "../src/pdas";
import { encodeKolName } from "../src/util";
import { KOLZ_PROGRAM_ID } from "../src/constants";

function pk(prefix: number): PublicKey {
  const bytes = new Uint8Array(32);
  bytes[0] = prefix;
  return new PublicKey(bytes);
}

describe("pdas", () => {
  it("config PDA derivation is deterministic", () => {
    const a = configPda();
    const b = configPda();
    expect(a.address.toBase58()).toBe(b.address.toBase58());
    expect(a.bump).toBe(b.bump);
  });

  it("pet PDA depends on kol owner and name", () => {
    const owner1 = pk(1);
    const owner2 = pk(2);
    const name = encodeKolName("alice");
    const a = petPda(owner1, name);
    const b = petPda(owner2, name);
    const c = petPda(owner1, encodeKolName("bob"));
    expect(a.address.toBase58()).not.toBe(b.address.toBase58());
    expect(a.address.toBase58()).not.toBe(c.address.toBase58());
  });

  it("pet PDA rejects non-32-byte name", () => {
    const owner = pk(1);
    expect(() => petPda(owner, new Uint8Array(16))).toThrow();
  });

  it("launch PDA is a function of pet", () => {
    const pet = pk(99);
    const a = launchPda(pet);
    const b = launchPda(pet);
    expect(a.address.toBase58()).toBe(b.address.toBase58());
  });

  it("king PDA is a function of pet", () => {
    const pet = pk(99);
    const k = kingOfHillPda(pet);
    expect(k.bump).toBeGreaterThanOrEqual(0);
    expect(k.bump).toBeLessThan(256);
  });

  it("nftEscrowVault PDA is a function of king", () => {
    const pet = pk(99);
    const { address: king } = kingOfHillPda(pet);
    const vault = nftEscrowVaultPda(king);
    expect(vault.address).toBeInstanceOf(PublicKey);
  });

  it("distribution PDA depends on epoch", () => {
    const a = distributionPda(0n);
    const b = distributionPda(1n);
    expect(a.address.toBase58()).not.toBe(b.address.toBase58());
  });

  it("holder claim PDA depends on holder and epoch", () => {
    const holder = pk(5);
    const a = holderClaimPda(holder, 0n);
    const b = holderClaimPda(holder, 1n);
    const c = holderClaimPda(pk(6), 0n);
    expect(a.address.toBase58()).not.toBe(b.address.toBase58());
    expect(a.address.toBase58()).not.toBe(c.address.toBase58());
  });

  it("fee vault PDA is constant", () => {
    const a = feeVaultPda();
    const b = feeVaultPda();
    expect(a.address.toBase58()).toBe(b.address.toBase58());
  });

  it("all derivations honor a custom program id", () => {
    const custom = new PublicKey("11111111111111111111111111111111");
    const a = configPda(custom);
    const b = configPda(KOLZ_PROGRAM_ID);
    expect(a.address.toBase58()).not.toBe(b.address.toBase58());
  });
});
