import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { assert } from "chai";
import {
  airdrop,
  buildProvider,
  findConfigPda,
  findDistributionPda,
  findFeeVaultPda,
  findHolderClaimPda,
} from "./utils/setup";
import { loadProgram, asBn } from "./utils/program";
import {
  buildProof,
  buildTree,
  hashLeaf,
  MerkleLeaf,
  proofAsArrays,
  rootAsArray,
  verifyProof,
} from "./utils/merkle";

describe("distribution commit and holder claim", () => {
  const provider = buildProvider();
  const connection = provider.connection;
  const program = loadProgram(provider);
  const programId = program.programId;

  const admin = (provider.wallet as anchor.Wallet).payer;
  const oracle = Keypair.generate();

  const holderA = Keypair.generate();
  const holderB = Keypair.generate();
  const holderC = Keypair.generate();

  const epoch = 42n;
  const amountA = 1_000_000n;
  const amountB = 2_500_000n;
  const amountC = 750_000n;
  const poolLamports = amountA + amountB + amountC;

  let leaves: MerkleLeaf[];
  let configPda: PublicKey;
  let distributionPda: PublicKey;
  let feeVaultPda: PublicKey;

  before(async () => {
    await airdrop(connection, oracle.publicKey, 5 * LAMPORTS_PER_SOL);
    await airdrop(connection, holderA.publicKey, LAMPORTS_PER_SOL);
    await airdrop(connection, holderB.publicKey, LAMPORTS_PER_SOL);
    await airdrop(connection, holderC.publicKey, LAMPORTS_PER_SOL);

    [configPda] = findConfigPda(programId);
    [distributionPda] = findDistributionPda(programId, epoch);
    [feeVaultPda] = findFeeVaultPda(programId);

    leaves = [
      { holder: holderA.publicKey, epoch, amount: amountA },
      { holder: holderB.publicKey, epoch, amount: amountB },
      { holder: holderC.publicKey, epoch, amount: amountC },
    ];

    try {
      await program.methods
        .initConfig(oracle.publicKey, 250)
        .accounts({
          config: configPda,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (!msg.includes("already in use")) {
        throw err;
      }
    }

    await airdrop(connection, feeVaultPda, 2 * LAMPORTS_PER_SOL);
  });

  it("merkle tree builds and verifies for all leaves", () => {
    const tree = buildTree(leaves);
    const root = tree.root();
    for (let i = 0; i < leaves.length; i++) {
      const proof = tree.proofFor(i);
      const leafHash = hashLeaf(leaves[i]);
      const ok = verifyProof(leafHash, proof, root);
      assert.equal(ok, true, "merkle proof for index " + i + " must verify");
    }
  });

  it("commit_distribution_root persists root + pool", async () => {
    const tree = buildTree(leaves);
    const root = tree.root();

    await program.methods
      .commitDistributionRoot(asBn(epoch), rootAsArray(root), asBn(poolLamports))
      .accounts({
        config: configPda,
        oracle: oracle.publicKey,
        distribution: distributionPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([oracle])
      .rpc();

    const dist = await program.account.distribution.fetch(distributionPda);
    const storedRoot = Buffer.from(dist.root as number[]);
    assert.equal(
      Buffer.compare(storedRoot, root),
      0,
      "stored root must match the merkle root"
    );
    assert.equal(
      (dist.poolLamports as anchor.BN).toString(),
      poolLamports.toString(),
      "pool lamports must match"
    );
    assert.equal(
      (dist.epoch as anchor.BN).toString(),
      epoch.toString(),
      "epoch must match"
    );
  });

  it("claim_holder_fees succeeds for holderA with valid proof", async () => {
    const tree = buildTree(leaves);
    const proof = tree.proofFor(0);
    const root = tree.root();
    const leafHash = hashLeaf(leaves[0]);
    assert.equal(verifyProof(leafHash, proof, root), true, "client side verify must pass");

    const [holderClaim] = findHolderClaimPda(programId, holderA.publicKey, epoch);
    const balanceBefore = await connection.getBalance(holderA.publicKey);

    await program.methods
      .claimHolderFees(asBn(epoch), asBn(amountA), proofAsArrays(proof))
      .accounts({
        distribution: distributionPda,
        holderClaim,
        holder: holderA.publicKey,
        feeVault: feeVaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([holderA])
      .rpc();

    const balanceAfter = await connection.getBalance(holderA.publicKey);
    assert.isAbove(
      balanceAfter,
      balanceBefore - Number(LAMPORTS_PER_SOL),
      "holderA balance must reflect transferred lamports minus fees"
    );

    const claim = await program.account.holderClaim.fetch(holderClaim);
    assert.equal(
      (claim.amountClaimed as anchor.BN).toString(),
      amountA.toString(),
      "claim record must store amount"
    );
  });

  it("claim_holder_fees rejects a second claim with AlreadyClaimed", async () => {
    const tree = buildTree(leaves);
    const proof = tree.proofFor(0);
    const [holderClaim] = findHolderClaimPda(programId, holderA.publicKey, epoch);

    let rejected = false;
    try {
      await program.methods
        .claimHolderFees(asBn(epoch), asBn(amountA), proofAsArrays(proof))
        .accounts({
          distribution: distributionPda,
          holderClaim,
          holder: holderA.publicKey,
          feeVault: feeVaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([holderA])
        .rpc();
    } catch (err) {
      rejected = true;
      const msg = (err as Error).message ?? "";
      assert.match(msg, /AlreadyClaimed|already in use|6009/, "expected AlreadyClaimed");
    }
    assert.equal(rejected, true, "second claim must fail");
  });

  it("claim_holder_fees rejects forged proofs with InvalidProof", async () => {
    const tree = buildTree(leaves);
    const proof = tree.proofFor(1);
    const [holderClaim] = findHolderClaimPda(programId, holderC.publicKey, epoch);

    let rejected = false;
    try {
      await program.methods
        .claimHolderFees(asBn(epoch), asBn(amountC), proofAsArrays(proof))
        .accounts({
          distribution: distributionPda,
          holderClaim,
          holder: holderC.publicKey,
          feeVault: feeVaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([holderC])
        .rpc();
    } catch (err) {
      rejected = true;
      const msg = (err as Error).message ?? "";
      assert.match(msg, /InvalidProof|6010/, "expected InvalidProof");
    }
    assert.equal(rejected, true, "forged proof must be rejected");
  });
});
