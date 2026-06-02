import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { assert } from "chai";
import {
  airdrop,
  buildProvider,
  createTestMint,
  createAtaAndMint,
  findConfigPda,
  findKingPda,
  findLaunchPda,
  findPetPda,
  METADATA_PROGRAM_ID,
  padKolName,
} from "./utils/setup";
import { loadProgram } from "./utils/program";

describe("throne flipping and rejection", () => {
  const provider = buildProvider();
  const connection = provider.connection;
  const program = loadProgram(provider);
  const programId = program.programId;

  const admin = (provider.wallet as anchor.Wallet).payer;
  const oracle = Keypair.generate();
  const kolOwner = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const carol = Keypair.generate();

  const kolNameBuf = padKolName("throne_kol");

  let pumpMint: PublicKey;
  let configPda: PublicKey;
  let petPda: PublicKey;
  let launchPda: PublicKey;
  let kingPda: PublicKey;
  let nftMintKp: Keypair;
  let nftEscrowVault: PublicKey;
  let aliceKolAta: PublicKey;
  let bobKolAta: PublicKey;
  let carolKolAta: PublicKey;
  let aliceNftAta: PublicKey;
  let bobNftAta: PublicKey;
  let carolNftAta: PublicKey;

  before(async () => {
    await airdrop(connection, oracle.publicKey, 5 * LAMPORTS_PER_SOL);
    await airdrop(connection, kolOwner.publicKey, LAMPORTS_PER_SOL);
    await airdrop(connection, alice.publicKey, 5 * LAMPORTS_PER_SOL);
    await airdrop(connection, bob.publicKey, 5 * LAMPORTS_PER_SOL);
    await airdrop(connection, carol.publicKey, 5 * LAMPORTS_PER_SOL);

    pumpMint = await createTestMint(connection, admin, admin.publicKey, 6);

    [configPda] = findConfigPda(programId);
    [petPda] = findPetPda(programId, kolOwner.publicKey, kolNameBuf);
    [launchPda] = findLaunchPda(programId, petPda);
    [kingPda] = findKingPda(programId, petPda);

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

    await program.methods
      .oracleBindPumpfunLaunch(Array.from(kolNameBuf))
      .accounts({
        config: configPda,
        oracle: oracle.publicKey,
        kolOwner: kolOwner.publicKey,
        pumpMint,
        pet: petPda,
        launch: launchPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([oracle])
      .rpc();

    nftMintKp = Keypair.generate();
    nftEscrowVault = await getAssociatedTokenAddress(
      nftMintKp.publicKey,
      kingPda,
      true
    );

    const [metadata] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METADATA_PROGRAM_ID.toBuffer(),
        nftMintKp.publicKey.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    );

    await program.methods
      .mintKolNft("COLS Crown", "COLS", "https://cols-api.fly.dev/nft/metadata.json")
      .accounts({
        config: configPda,
        oracle: oracle.publicKey,
        pet: petPda,
        king: kingPda,
        nftMint: nftMintKp.publicKey,
        nftEscrowVault,
        metadata,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        metadataProgram: METADATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([oracle, nftMintKp])
      .rpc();

    aliceKolAta = await createAtaAndMint(
      connection,
      admin,
      pumpMint,
      alice.publicKey,
      admin,
      1_000_000
    );
    bobKolAta = await createAtaAndMint(
      connection,
      admin,
      pumpMint,
      bob.publicKey,
      admin,
      5_000_000
    );
    carolKolAta = await createAtaAndMint(
      connection,
      admin,
      pumpMint,
      carol.publicKey,
      admin,
      100_000
    );

    aliceNftAta = await getAssociatedTokenAddress(nftMintKp.publicKey, alice.publicKey);
    bobNftAta = await getAssociatedTokenAddress(nftMintKp.publicKey, bob.publicKey);
    carolNftAta = await getAssociatedTokenAddress(nftMintKp.publicKey, carol.publicKey);
  });

  it("alice captures the throne first", async () => {
    await program.methods
      .takeThrone()
      .accounts({
        king: kingPda,
        pet: petPda,
        challenger: alice.publicKey,
        challengerKolAta: aliceKolAta,
        challengerNftAta: aliceNftAta,
        prevChampionNftAta: nftEscrowVault,
        nftMint: nftMintKp.publicKey,
        nftEscrowVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc();

    const king = await program.account.kingOfHill.fetch(kingPda);
    assert.equal(
      (king.currentChampion as PublicKey).toBase58(),
      alice.publicKey.toBase58(),
      "alice should hold the throne"
    );
  });

  it("bob flips the throne with a larger position", async () => {
    await program.methods
      .takeThrone()
      .accounts({
        king: kingPda,
        pet: petPda,
        challenger: bob.publicKey,
        challengerKolAta: bobKolAta,
        challengerNftAta: bobNftAta,
        prevChampionNftAta: aliceNftAta,
        nftMint: nftMintKp.publicKey,
        nftEscrowVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([bob])
      .rpc();

    const king = await program.account.kingOfHill.fetch(kingPda);
    assert.equal(
      (king.currentChampion as PublicKey).toBase58(),
      bob.publicKey.toBase58(),
      "bob should hold the throne after the flip"
    );
    assert.isAtLeast(Number((king.takeOvers as number) ?? 0), 2, "take_overs counter should advance");
  });

  it("carol is rejected with NotTopHolder", async () => {
    let rejected = false;
    try {
      await program.methods
        .takeThrone()
        .accounts({
          king: kingPda,
          pet: petPda,
          challenger: carol.publicKey,
          challengerKolAta: carolKolAta,
          challengerNftAta: carolNftAta,
          prevChampionNftAta: bobNftAta,
          nftMint: nftMintKp.publicKey,
          nftEscrowVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([carol])
        .rpc();
    } catch (err) {
      rejected = true;
      const msg = (err as Error).message ?? "";
      assert.match(
        msg,
        /NotTopHolder|6003/,
        "expected NotTopHolder error code"
      );
    }
    assert.equal(rejected, true, "carol must be rejected from the throne");

    const king = await program.account.kingOfHill.fetch(kingPda);
    assert.equal(
      (king.currentChampion as PublicKey).toBase58(),
      bob.publicKey.toBase58(),
      "bob should still hold the throne"
    );
  });
});
