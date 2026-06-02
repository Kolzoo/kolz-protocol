use std::str::FromStr;

use borsh::BorshSerialize;
use clap::Args;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signer::Signer;
use solana_sdk::system_program;

use crate::borsh_codec;
use crate::discriminator;
use crate::error::{CliError, CliResult};
use crate::output::{render, OutputFormat};
use crate::pdas;
use crate::rpc::{parse_pubkey, Cli};

/// SPL Token program id (re-declared so this file is self contained).
const SPL_TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/// SPL Associated Token Account program id.
const SPL_ATA_PROGRAM_ID: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

#[derive(Args, Debug)]
pub struct TakeThroneArgs {
    /// KOL owner pubkey used to derive the pet PDA.
    #[arg(long = "kol-owner")]
    pub kol_owner: String,

    /// Human readable KOL name used to derive the pet PDA.
    #[arg(long = "kol-name")]
    pub kol_name: String,

    /// Optional explicit memecoin mint. If omitted the value is read from
    /// the launch PDA via RPC so the caller does not need to know it.
    #[arg(long = "memecoin-mint")]
    pub memecoin_mint: Option<String>,
}

#[derive(BorshSerialize)]
struct TakePayload {
    discriminator: [u8; 8],
}

#[derive(serde::Serialize)]
struct TakeOutput {
    signature: String,
    challenger: String,
    pet_pda: String,
    king_pda: String,
    memecoin_mint: String,
    challenger_ata: String,
}

/// Compute the canonical associated token account address.
fn associated_token_address(
    owner: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
    ata_program: &Pubkey,
) -> Pubkey {
    Pubkey::find_program_address(
        &[owner.as_ref(), token_program.as_ref(), mint.as_ref()],
        ata_program,
    )
    .0
}

pub fn run(cli: &Cli, args: TakeThroneArgs, format: OutputFormat) -> CliResult<()> {
    let kol_owner = parse_pubkey(&args.kol_owner)?;
    let name_bytes = pdas::encode_kol_name(&args.kol_name).map_err(|reason| {
        CliError::InvalidArg {
            field: "kol-name".into(),
            reason,
        }
    })?;

    let (config_pda, _) = pdas::config(&cli.program_id);
    let (pet_pda, _) = pdas::pet(&cli.program_id, &kol_owner, &name_bytes);
    let (launch_pda, _) = pdas::launch(&cli.program_id, &pet_pda);
    let (king_pda, _) = pdas::king(&cli.program_id, &pet_pda);
    let (vault_pda, _) = pdas::nft_vault(&cli.program_id, &king_pda);

    let token_program = Pubkey::from_str(SPL_TOKEN_PROGRAM_ID).map_err(CliError::pubkey)?;
    let ata_program = Pubkey::from_str(SPL_ATA_PROGRAM_ID).map_err(CliError::pubkey)?;

    let memecoin_mint = match args.memecoin_mint.as_deref() {
        Some(value) => parse_pubkey(value)?,
        None => {
            let raw = cli.get_program_account(&launch_pda)?;
            let launch = borsh_codec::decode_launch(&launch_pda.to_string(), &raw)?;
            launch.pump_mint
        }
    };

    let king_raw = cli.get_program_account(&king_pda)?;
    let king = borsh_codec::decode_king(&king_pda.to_string(), &king_raw)?;

    let challenger = cli.payer.pubkey();
    let challenger_ata = associated_token_address(
        &challenger,
        &memecoin_mint,
        &token_program,
        &ata_program,
    );

    let previous_champion_ata = if king.take_overs == 0 {
        // First capture: source NFT is the escrow vault.
        vault_pda
    } else {
        associated_token_address(
            &king.current_champion,
            &king.nft_mint,
            &token_program,
            &ata_program,
        )
    };

    let challenger_nft_ata =
        associated_token_address(&challenger, &king.nft_mint, &token_program, &ata_program);

    let payload = TakePayload {
        discriminator: discriminator::instruction("take_throne"),
    };
    let data = payload
        .try_to_vec()
        .map_err(|e| CliError::Internal(format!("take_throne encode: {}", e)))?;

    let ix = Instruction {
        program_id: cli.program_id,
        accounts: vec![
            AccountMeta::new(challenger, true),
            AccountMeta::new_readonly(config_pda, false),
            AccountMeta::new_readonly(pet_pda, false),
            AccountMeta::new(king_pda, false),
            AccountMeta::new_readonly(king.nft_mint, false),
            AccountMeta::new(vault_pda, false),
            AccountMeta::new(previous_champion_ata, false),
            AccountMeta::new(challenger_nft_ata, false),
            AccountMeta::new_readonly(memecoin_mint, false),
            AccountMeta::new_readonly(challenger_ata, false),
            AccountMeta::new_readonly(token_program, false),
            AccountMeta::new_readonly(ata_program, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data,
    };

    let sig = cli.send(vec![ix])?;

    let out = TakeOutput {
        signature: sig.to_string(),
        challenger: challenger.to_string(),
        pet_pda: pet_pda.to_string(),
        king_pda: king_pda.to_string(),
        memecoin_mint: memecoin_mint.to_string(),
        challenger_ata: challenger_ata.to_string(),
    };

    render(
        format,
        "cols take-throne",
        &[
            ("signature", out.signature.clone()),
            ("challenger", out.challenger.clone()),
            ("pet_pda", out.pet_pda.clone()),
            ("king_pda", out.king_pda.clone()),
            ("memecoin_mint", out.memecoin_mint.clone()),
            ("challenger_ata", out.challenger_ata.clone()),
        ],
        &out,
    );

    Ok(())
}
