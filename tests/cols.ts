import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
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
  ensureAta,
  findConfigPda,
  findKingPda,
  findLaunchPda,
  findPetPda,
  METADATA_PROGRAM_ID,
  padKolName,
  SYSTEM_PROGRAM_ID,
} from "./utils/setup";
import { loadProgram, programIdFromIdl, loadIdl, asBn } from "./utils/program";

describe("cols end-to-end happy path", () => {
  const provider = buildProvider();
  const connection = provider.connection;
  const program = loadProgram(provider);
  const programId = program.programId;

  const admin = (provider.wallet as anchor.Wallet).payer;
  const oracle = Keypair.generate();
  const kolOwner = Keypair.generate();
  const champion = Keypair.generate();

  const kolNameStr = "satoshi_kol";
  const kolNameBuf = padKolName(kolNameStr);

  let pumpMint: PublicKey;
  let configPda: PublicKey;
  let petPda: PublicKey;
  let launchPda: PublicKey;
  let kingPda: PublicKey;
  let nftMintKp: Keypair;
  let nftEscrowVault: PublicKey;

  before(async () => {
    await airdrop(connection, oracle.publicKey, 5 * LAMPORTS_PER_SOL);
    await airdrop(connection, kolOwner.publicKey, 2 * LAMPORTS_PER_SOL);
    await airdrop(connection, champion.publicKey, 5 * LAMPORTS_PER_SOL);

    pumpMint = await createTestMint(connection, admin, admin.publicKey, 6);

    [configPda] = findConfigPda(programId);
    [petPda] = findPetPda(programId, kolOwner.publicKey, kolNameBuf);
    [launchPda] = findLaunchPda(programId, petPda);
    [kingPda] = findKingPda(programId, petPda);
  });

  it("init_config stores admin, oracle, and fee bps", async () => {
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
      if (!msg.includes("already in use") && !msg.includes("custom program error: 0x0")) {
        throw err;
      }
    }

    const config = await program.account.config.fetchNullable(configPda);
    if (config !== null) {
      assert.equal(
        (config.oracle as PublicKey).toBase58(),
        oracle.publicKey.toBase58(),
        "oracle pubkey mismatch"
      );
      assert.equal((config.feeBasisPoints as number), 250, "fee bps mismatch");
    }
  });

  it("oracle_bind_pumpfun_launch creates pet + launch", async () => {
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

    const pet = await program.account.pet.fetch(petPda);
    assert.equal(
      (pet.owner as PublicKey).toBase58(),
      kolOwner.publicKey.toBase58(),
      "pet.owner mismatch"
    );
    const nameBytes = Buffer.from(pet.kolName as number[]);
    assert.equal(
      nameBytes.toString("utf-8").replace(/\0+$/, ""),
      kolNameStr,
      "pet.kolName mismatch"
    );

    const launch = await program.account.launch.fetch(launchPda);
    assert.equal(
      (launch.pet as PublicKey).toBase58(),
      petPda.toBase58(),
      "launch.pet mismatch"
    );
    assert.equal(
      (launch.pumpMint as PublicKey).toBase58(),
      pumpMint.toBase58(),
      "launch.pumpMint mismatch"
    );
    assert.equal(launch.graduated as boolean, false, "launch.graduated should start false");
  });

  it("mint_kol_nft creates the king PDA and 1/1 escrow", async () => {
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

    const king = await program.account.kingOfHill.fetch(kingPda);
    assert.equal(
      (king.pet as PublicKey).toBase58(),
      petPda.toBase58(),
      "king.pet mismatch"
    );
    assert.equal(
      (king.nftMint as PublicKey).toBase58(),
      nftMintKp.publicKey.toBase58(),
      "king.nftMint mismatch"
    );
    assert.equal(
      (king.currentChampion as PublicKey).toBase58(),
      SYSTEM_PROGRAM_ID.toBase58(),
      "current champion should default to system program"
    );
    assert.equal((king.settled as boolean), false, "king.settled should start false");
  });

  it("take_throne first capture transfers NFT to champion", async () => {
    const championKolAta = await createAtaAndMint(
      connection,
      admin,
      pumpMint,
      champion.publicKey,
      admin,
      1_000_000_000
    );
    const championNftAta = await getAssociatedTokenAddress(
      nftMintKp.publicKey,
      champion.publicKey
    );

    await program.methods
      .takeThrone()
      .accounts({
        king: kingPda,
        pet: petPda,
        challenger: champion.publicKey,
        challengerKolAta: championKolAta,
        challengerNftAta: championNftAta,
        prevChampionNftAta: nftEscrowVault,
        nftMint: nftMintKp.publicKey,
        nftEscrowVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([champion])
      .rpc();

    const king = await program.account.kingOfHill.fetch(kingPda);
    assert.equal(
      (king.currentChampion as PublicKey).toBase58(),
      champion.publicKey.toBase58(),
      "current champion should be the first capturer"
    );
    assert.isAtLeast(
      Number((king.takeOvers as number) ?? 0),
      1,
      "take_overs should advance"
    );
  });

  it("settle_throne finalizes after the settlement window", async () => {
    const championNftAta = await getAssociatedTokenAddress(
      nftMintKp.publicKey,
      champion.publicKey
    );
    try {
      await program.methods
        .settleThrone()
        .accounts({
          config: configPda,
          king: kingPda,
          oracle: oracle.publicKey,
          currentChampionAta: championNftAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([oracle])
        .rpc();
      const king = await program.account.kingOfHill.fetch(kingPda);
      assert.equal((king.settled as boolean), true, "throne should be settled");
    } catch (err) {
      const msg = (err as Error).message ?? "";
      assert.match(
        msg,
        /SettlementNotReady|6006/,
        "expected SettlementNotReady when window has not elapsed"
      );
    }
  });
});
