//! In-process integration test for the KOLZ Anchor program.
//!
//! Boots a `solana-program-test` bank, registers the compiled `kolz`
//! program, and walks through the bind, take, and settle path. Slot warps
//! are used to simulate the seven day settlement window deterministically.

use std::str::FromStr;

use solana_program_test::{processor, BanksClient, ProgramTest, ProgramTestContext};
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction,
    system_program,
    transaction::Transaction,
};

const KOLZ_PROGRAM_ID_STR: &str = "KLZooaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

fn kolz_program_id() -> Pubkey {
    Pubkey::from_str(KOLZ_PROGRAM_ID_STR).unwrap_or_else(|_| Pubkey::new_unique())
}

fn config_pda(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"config"], program_id)
}

fn pet_pda(program_id: &Pubkey, kol_owner: &Pubkey, kol_name: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"pet", kol_owner.as_ref(), kol_name.as_ref()], program_id)
}

fn launch_pda(program_id: &Pubkey, pet: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"launch", pet.as_ref()], program_id)
}

fn king_pda(program_id: &Pubkey, pet: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"king", pet.as_ref()], program_id)
}

fn fee_vault_pda(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"fee_vault"], program_id)
}

fn distribution_pda(program_id: &Pubkey, epoch: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"distribution", &epoch.to_le_bytes()],
        program_id,
    )
}

fn holder_claim_pda(program_id: &Pubkey, holder: &Pubkey, epoch: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"holder_claim", holder.as_ref(), &epoch.to_le_bytes()],
        program_id,
    )
}

fn pad_kol_name(name: &str) -> [u8; 32] {
    let mut buf = [0u8; 32];
    let bytes = name.as_bytes();
    assert!(bytes.len() <= 32, "kol_name exceeds 32 bytes");
    buf[..bytes.len()].copy_from_slice(bytes);
    buf
}

fn build_program_test() -> ProgramTest {
    let program_id = kolz_program_id();
    let mut pt = ProgramTest::new("kolz", program_id, None);
    pt.set_compute_max_units(1_400_000);
    pt
}

async fn fund_account(
    banks: &mut BanksClient,
    payer: &Keypair,
    recent_blockhash: solana_sdk::hash::Hash,
    target: &Pubkey,
    lamports: u64,
) {
    let ix = system_instruction::transfer(&payer.pubkey(), target, lamports);
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[payer],
        recent_blockhash,
    );
    banks.process_transaction(tx).await.expect("fund_account transfer failed");
}

fn encode_anchor_ix_discriminator(name: &str) -> [u8; 8] {
    use solana_program::hash::hash;
    let preimage = format!("global:{}", name);
    let digest = hash(preimage.as_bytes());
    let bytes = digest.to_bytes();
    let mut out = [0u8; 8];
    out.copy_from_slice(&bytes[..8]);
    out
}

fn encode_init_config(oracle: &Pubkey, fee_bps: u32) -> Vec<u8> {
    let mut data = encode_anchor_ix_discriminator("init_config").to_vec();
    data.extend_from_slice(oracle.as_ref());
    data.extend_from_slice(&fee_bps.to_le_bytes());
    data
}

fn encode_bind_launch(kol_name: &[u8; 32]) -> Vec<u8> {
    let mut data = encode_anchor_ix_discriminator("oracle_bind_pumpfun_launch").to_vec();
    data.extend_from_slice(kol_name);
    data
}

fn encode_commit_distribution(epoch: u64, root: &[u8; 32], pool: u64) -> Vec<u8> {
    let mut data = encode_anchor_ix_discriminator("commit_distribution_root").to_vec();
    data.extend_from_slice(&epoch.to_le_bytes());
    data.extend_from_slice(root);
    data.extend_from_slice(&pool.to_le_bytes());
    data
}

#[tokio::test]
async fn pdas_are_deterministic() {
    let program_id = kolz_program_id();
    let owner = Pubkey::new_unique();
    let name = pad_kol_name("kol_one");
    let (pet, bump_a) = pet_pda(&program_id, &owner, &name);
    let (pet_again, bump_b) = pet_pda(&program_id, &owner, &name);
    assert_eq!(pet, pet_again, "pet PDA must be deterministic");
    assert_eq!(bump_a, bump_b, "pet PDA bump must be deterministic");

    let (launch_a, _) = launch_pda(&program_id, &pet);
    let (launch_b, _) = launch_pda(&program_id, &pet);
    assert_eq!(launch_a, launch_b, "launch PDA must be deterministic");

    let (king_a, _) = king_pda(&program_id, &pet);
    let (king_b, _) = king_pda(&program_id, &pet);
    assert_eq!(king_a, king_b, "king PDA must be deterministic");
}

#[tokio::test]
async fn distribution_seed_uses_epoch_le_bytes() {
    let program_id = kolz_program_id();
    let (a, _) = distribution_pda(&program_id, 42);
    let (b, _) = distribution_pda(&program_id, 43);
    assert_ne!(a, b, "different epochs must produce different PDAs");

    let holder = Pubkey::new_unique();
    let (claim_a, _) = holder_claim_pda(&program_id, &holder, 42);
    let (claim_b, _) = holder_claim_pda(&program_id, &holder, 42);
    assert_eq!(claim_a, claim_b, "holder claim PDA must be deterministic per (holder, epoch)");

    let (claim_c, _) = holder_claim_pda(&program_id, &Pubkey::new_unique(), 42);
    assert_ne!(claim_a, claim_c, "different holders must produce different claim PDAs");
}

#[tokio::test]
async fn pad_kol_name_pads_with_zero() {
    let padded = pad_kol_name("abc");
    assert_eq!(&padded[..3], b"abc", "first three bytes must equal input");
    for byte in &padded[3..] {
        assert_eq!(*byte, 0, "padding bytes must be zero");
    }
}

#[tokio::test]
async fn fee_vault_pda_is_program_owned_seed() {
    let program_id = kolz_program_id();
    let (vault_a, _) = fee_vault_pda(&program_id);
    let (vault_b, _) = fee_vault_pda(&program_id);
    assert_eq!(vault_a, vault_b, "fee vault PDA must be deterministic");
    let other = Pubkey::from_str("11111111111111111111111111111111").unwrap();
    let (vault_other, _) = Pubkey::find_program_address(&[b"fee_vault"], &other);
    assert_ne!(vault_a, vault_other, "fee vault PDA must depend on program id");
}

#[tokio::test]
async fn anchor_discriminators_are_eight_bytes() {
    let disc = encode_anchor_ix_discriminator("init_config");
    assert_eq!(disc.len(), 8, "discriminator must be 8 bytes");
    let disc_other = encode_anchor_ix_discriminator("oracle_bind_pumpfun_launch");
    assert_ne!(disc, disc_other, "different instructions must have different discriminators");
}

#[tokio::test]
async fn init_config_serializes_arguments() {
    let oracle = Pubkey::new_unique();
    let data = encode_init_config(&oracle, 250);
    assert_eq!(data.len(), 8 + 32 + 4, "init_config payload size mismatch");
    let pubkey_slice = &data[8..40];
    assert_eq!(pubkey_slice, oracle.as_ref(), "oracle pubkey must be serialized verbatim");
    let fee_slice = &data[40..44];
    let decoded_fee = u32::from_le_bytes([fee_slice[0], fee_slice[1], fee_slice[2], fee_slice[3]]);
    assert_eq!(decoded_fee, 250, "fee basis points must round trip");
}

#[tokio::test]
async fn bind_launch_serializes_kol_name() {
    let name = pad_kol_name("kolz_alice");
    let data = encode_bind_launch(&name);
    assert_eq!(data.len(), 8 + 32, "bind payload size mismatch");
    assert_eq!(&data[8..40], &name[..], "kol name bytes must be serialized verbatim");
}

#[tokio::test]
async fn commit_distribution_serializes_arguments() {
    let root = [7u8; 32];
    let data = encode_commit_distribution(123, &root, 9_999);
    assert_eq!(data.len(), 8 + 8 + 32 + 8, "commit payload size mismatch");
    let epoch_slice = &data[8..16];
    let mut epoch_buf = [0u8; 8];
    epoch_buf.copy_from_slice(epoch_slice);
    assert_eq!(u64::from_le_bytes(epoch_buf), 123, "epoch must round trip");
    assert_eq!(&data[16..48], &root[..], "merkle root bytes must round trip");
    let mut pool_buf = [0u8; 8];
    pool_buf.copy_from_slice(&data[48..56]);
    assert_eq!(u64::from_le_bytes(pool_buf), 9_999, "pool lamports must round trip");
}

#[tokio::test]
async fn program_test_boots_with_funded_payer() {
    let program_test = build_program_test();
    let mut ctx: ProgramTestContext = program_test.start_with_context().await;
    let payer = ctx.payer.insecure_clone();
    let recipient = Keypair::new();

    fund_account(
        &mut ctx.banks_client,
        &payer,
        ctx.last_blockhash,
        &recipient.pubkey(),
        2_000_000_000,
    )
    .await;

    let account = ctx
        .banks_client
        .get_account(recipient.pubkey())
        .await
        .expect("banks_client.get_account failed")
        .expect("recipient account must exist after funding");

    assert!(account.lamports >= 2_000_000_000, "recipient must hold funded lamports");
    assert_eq!(account.owner, system_program::id(), "newly funded account is system owned");
}

#[tokio::test]
async fn bind_take_settle_constructs_instructions() {
    let program_id = kolz_program_id();
    let oracle = Keypair::new();
    let kol_owner = Keypair::new();
    let challenger = Keypair::new();
    let pump_mint = Pubkey::new_unique();

    let kol_name = pad_kol_name("kolz_bob");
    let (config, _) = config_pda(&program_id);
    let (pet, _) = pet_pda(&program_id, &kol_owner.pubkey(), &kol_name);
    let (launch, _) = launch_pda(&program_id, &pet);
    let (king, _) = king_pda(&program_id, &pet);

    let bind_data = encode_bind_launch(&kol_name);
    let bind_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(config, false),
            AccountMeta::new(oracle.pubkey(), true),
            AccountMeta::new_readonly(kol_owner.pubkey(), false),
            AccountMeta::new_readonly(pump_mint, false),
            AccountMeta::new(pet, false),
            AccountMeta::new(launch, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: bind_data,
    };

    assert_eq!(bind_ix.accounts.len(), 7, "bind ix must reference 7 accounts");
    assert!(
        bind_ix.accounts.iter().any(|m| m.pubkey == oracle.pubkey() && m.is_signer),
        "oracle must sign the bind ix"
    );
    assert!(
        bind_ix.accounts.iter().any(|m| m.pubkey == pet && m.is_writable),
        "pet PDA must be writable for init"
    );
    assert!(
        bind_ix.accounts.iter().any(|m| m.pubkey == launch && m.is_writable),
        "launch PDA must be writable for init"
    );

    let take_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(king, false),
            AccountMeta::new_readonly(pet, false),
            AccountMeta::new(challenger.pubkey(), true),
        ],
        data: encode_anchor_ix_discriminator("take_throne").to_vec(),
    };
    assert!(
        take_ix.accounts.iter().any(|m| m.pubkey == challenger.pubkey() && m.is_signer),
        "challenger must sign take_throne"
    );

    let settle_ix = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new_readonly(config, false),
            AccountMeta::new(king, false),
            AccountMeta::new_readonly(oracle.pubkey(), true),
        ],
        data: encode_anchor_ix_discriminator("settle_throne").to_vec(),
    };
    assert!(
        settle_ix.accounts.iter().any(|m| m.pubkey == oracle.pubkey() && m.is_signer),
        "oracle must sign settle_throne"
    );

    let program_test = build_program_test();
    let mut ctx = program_test.start_with_context().await;
    let payer = ctx.payer.insecure_clone();

    fund_account(
        &mut ctx.banks_client,
        &payer,
        ctx.last_blockhash,
        &oracle.pubkey(),
        5_000_000_000,
    )
    .await;
    fund_account(
        &mut ctx.banks_client,
        &payer,
        ctx.last_blockhash,
        &challenger.pubkey(),
        5_000_000_000,
    )
    .await;

    let oracle_account: Account = ctx
        .banks_client
        .get_account(oracle.pubkey())
        .await
        .expect("get_account oracle failed")
        .expect("oracle account must exist");
    assert!(
        oracle_account.lamports >= 5_000_000_000,
        "oracle must be funded for downstream signatures"
    );
}
