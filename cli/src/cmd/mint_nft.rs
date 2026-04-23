use std::str::FromStr;

use borsh::BorshSerialize;
use clap::Args;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use solana_sdk::system_program;
use solana_sdk::sysvar;

use crate::discriminator;
use crate::error::{CliError, CliResult};
use crate::output::{render, OutputFormat};
use crate::pdas;
use crate::rpc::{parse_pubkey, Cli};

/// SPL Token program id.
const SPL_TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/// SPL Associated Token Account program id.
const SPL_ATA_PROGRAM_ID: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
/// Metaplex Token Metadata program id.
const METAPLEX_METADATA_PROGRAM_ID: &str = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

#[derive(Args, Debug)]
pub struct MintNftArgs {
    /// KOL owner pubkey used to derive the pet PDA.
    #[arg(long = "kol-owner")]
    pub kol_owner: String,

    /// Human readable KOL name used to derive the pet PDA.
    #[arg(long = "kol-name")]
    pub kol_name: String,

    /// NFT display name. Max 32 bytes per the Metaplex spec.
    #[arg(long)]
    pub name: String,

    /// NFT symbol. Max 10 bytes per the Metaplex spec.
    #[arg(long)]
    pub symbol: String,

    /// Off-chain metadata URI. Max 200 bytes per the Metaplex spec.
    #[arg(long)]
    pub uri: String,

    /// Optional path to write the freshly generated NFT mint keypair to.
    #[arg(long = "mint-out")]
    pub mint_out: Option<String>,
}

#[derive(BorshSerialize)]
struct MintPayload {
    discriminator: [u8; 8],
    name: String,
    symbol: String,
    uri: String,
}

#[derive(serde::Serialize)]
struct MintOutput {
    signature: String,
    pet_pda: String,
    king_pda: String,
    nft_mint: String,
    nft_escrow_vault: String,
    name: String,
    symbol: String,
    uri: String,
}

pub fn run(cli: &Cli, args: MintNftArgs, format: OutputFormat) -> CliResult<()> {
    if args.name.as_bytes().len() > 32 {
        return Err(CliError::InvalidArg {
            field: "name".into(),
            reason: "name exceeds 32 byte Metaplex limit".into(),
        });
    }
    if args.symbol.as_bytes().len() > 10 {
        return Err(CliError::InvalidArg {
            field: "symbol".into(),
            reason: "symbol exceeds 10 byte Metaplex limit".into(),
        });
    }
    if args.uri.as_bytes().len() > 200 {
        return Err(CliError::InvalidArg {
            field: "uri".into(),
            reason: "uri exceeds 200 byte Metaplex limit".into(),
        });
    }

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
    let (vault_pda, _) = pdas::nft_vault(&cli.program_id, &king_pda);

    let nft_mint = Keypair::new();

    if let Some(path) = args.mint_out.as_ref() {
        let bytes = nft_mint.to_bytes();
        let json = serde_json::to_string(&bytes.to_vec())?;
        std::fs::write(path, json)?;
    }

    let token_program = Pubkey::from_str(SPL_TOKEN_PROGRAM_ID).map_err(CliError::pubkey)?;
    let ata_program = Pubkey::from_str(SPL_ATA_PROGRAM_ID).map_err(CliError::pubkey)?;
    let metadata_program =
        Pubkey::from_str(METAPLEX_METADATA_PROGRAM_ID).map_err(CliError::pubkey)?;

    let metadata_pda = Pubkey::find_program_address(
        &[
            b"metadata",
            metadata_program.as_ref(),
            nft_mint.pubkey().as_ref(),
        ],
        &metadata_program,
    )
    .0;

    let payload = MintPayload {
        discriminator: discriminator::instruction("mint_kol_nft"),
        name: args.name.clone(),
        symbol: args.symbol.clone(),
        uri: args.uri.clone(),
    };
    let data = payload
        .try_to_vec()
        .map_err(|e| CliError::Internal(format!("mint encode: {}", e)))?;

    let oracle = cli.payer.pubkey();
    let ix = Instruction {
        program_id: cli.program_id,
        accounts: vec![
            AccountMeta::new(oracle, true),
            AccountMeta::new_readonly(config_pda, false),
            AccountMeta::new_readonly(pet_pda, false),
            AccountMeta::new(king_pda, false),
            AccountMeta::new(nft_mint.pubkey(), true),
            AccountMeta::new(vault_pda, false),
            AccountMeta::new(metadata_pda, false),
            AccountMeta::new_readonly(metadata_program, false),
            AccountMeta::new_readonly(token_program, false),
            AccountMeta::new_readonly(ata_program, false),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(sysvar::rent::ID, false),
        ],
        data,
    };

    let sig = cli.send_with_signers(vec![ix], &[&nft_mint])?;

    let out = MintOutput {
        signature: sig.to_string(),
        pet_pda: pet_pda.to_string(),
        king_pda: king_pda.to_string(),
        nft_mint: nft_mint.pubkey().to_string(),
        nft_escrow_vault: vault_pda.to_string(),
        name: args.name,
        symbol: args.symbol,
        uri: args.uri,
    };

    render(
        format,
        "kolz mint-nft",
        &[
            ("signature", out.signature.clone()),
            ("pet_pda", out.pet_pda.clone()),
            ("king_pda", out.king_pda.clone()),
            ("nft_mint", out.nft_mint.clone()),
            ("nft_escrow_vault", out.nft_escrow_vault.clone()),
            ("name", out.name.clone()),
            ("symbol", out.symbol.clone()),
            ("uri", out.uri.clone()),
        ],
        &out,
    );

    Ok(())
}
