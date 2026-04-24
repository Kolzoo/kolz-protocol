use std::str::FromStr;

use borsh::BorshSerialize;
use clap::Args;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signer::Signer;

use crate::borsh_codec;
use crate::discriminator;
use crate::error::{CliError, CliResult};
use crate::output::{render, OutputFormat};
use crate::pdas;
use crate::rpc::{parse_pubkey, Cli};

const SPL_TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SPL_ATA_PROGRAM_ID: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

#[derive(Args, Debug)]
pub struct SettleArgs {
    /// KOL owner pubkey used to derive the pet PDA.
    #[arg(long = "kol-owner")]
    pub kol_owner: String,

    /// Human readable KOL name used to derive the pet PDA.
    #[arg(long = "kol-name")]
    pub kol_name: String,
}

#[derive(BorshSerialize)]
struct SettlePayload {
    discriminator: [u8; 8],
}

#[derive(serde::Serialize)]
struct SettleOutput {
    signature: String,
    pet_pda: String,
    king_pda: String,
    final_champion: String,
    settles_at_slot: u64,
}

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

pub fn run(cli: &Cli, args: SettleArgs, format: OutputFormat) -> CliResult<()> {
    let kol_owner = parse_pubkey(&args.kol_owner)?;
    let name_bytes = pdas::encode_kol_name(&args.kol_name).map_err(|reason| {
        CliError::InvalidArg {
            field: "kol-name".into(),
            reason,
        }
    })?;

    let (config_pda, _) = pdas::config(&cli.program_id);
    let (pet_pda, _) = pdas::pet(&cli.program_id, &kol_owner, &name_bytes);
    let (king_pda, _) = pdas::king(&cli.program_id, &pet_pda);

    let king_raw = cli.get_program_account(&king_pda)?;
    let king = borsh_codec::decode_king(&king_pda.to_string(), &king_raw)?;

    let token_program = Pubkey::from_str(SPL_TOKEN_PROGRAM_ID).map_err(CliError::pubkey)?;
    let ata_program = Pubkey::from_str(SPL_ATA_PROGRAM_ID).map_err(CliError::pubkey)?;

    let champion_ata = associated_token_address(
        &king.current_champion,
        &king.nft_mint,
        &token_program,
        &ata_program,
    );

    let payload = SettlePayload {
        discriminator: discriminator::instruction("settle_throne"),
    };
    let data = payload
        .try_to_vec()
        .map_err(|e| CliError::Internal(format!("settle encode: {}", e)))?;

    let oracle = cli.payer.pubkey();
    let ix = Instruction {
        program_id: cli.program_id,
        accounts: vec![
            AccountMeta::new(oracle, true),
            AccountMeta::new_readonly(config_pda, false),
            AccountMeta::new_readonly(pet_pda, false),
            AccountMeta::new(king_pda, false),
            AccountMeta::new(champion_ata, false),
            AccountMeta::new_readonly(king.current_champion, false),
            AccountMeta::new_readonly(king.nft_mint, false),
            AccountMeta::new_readonly(token_program, false),
        ],
        data,
    };

    let sig = cli.send(vec![ix])?;

    let out = SettleOutput {
        signature: sig.to_string(),
        pet_pda: pet_pda.to_string(),
        king_pda: king_pda.to_string(),
        final_champion: king.current_champion.to_string(),
        settles_at_slot: king.settles_at_slot,
    };

    render(
        format,
        "kolz settle",
        &[
            ("signature", out.signature.clone()),
            ("pet_pda", out.pet_pda.clone()),
            ("king_pda", out.king_pda.clone()),
            ("final_champion", out.final_champion.clone()),
            ("settles_at_slot", out.settles_at_slot.to_string()),
        ],
        &out,
    );

    Ok(())
}
