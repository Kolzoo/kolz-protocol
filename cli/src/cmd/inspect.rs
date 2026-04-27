use clap::{Args, Subcommand};

use crate::borsh_codec;
use crate::error::{CliError, CliResult};
use crate::output::{fmt_hex32, fmt_lamports, fmt_slot, render, OutputFormat};
use crate::pdas;
use crate::rpc::{parse_pubkey, Cli};

#[derive(Args, Debug)]
pub struct InspectArgs {
    #[command(subcommand)]
    pub target: InspectTarget,
}

#[derive(Subcommand, Debug)]
pub enum InspectTarget {
    /// Inspect the global Config PDA.
    Config,
    /// Inspect a Pet PDA derived from (kol-owner, kol-name).
    Pet {
        #[arg(long = "kol-owner")]
        kol_owner: String,
        #[arg(long = "kol-name")]
        kol_name: String,
    },
    /// Inspect a Launch PDA. The pet pubkey is required.
    Launch {
        #[arg(long)]
        pet: String,
    },
    /// Inspect a KingOfHill PDA. The pet pubkey is required.
    King {
        #[arg(long)]
        pet: String,
    },
    /// Inspect a Distribution PDA for the given epoch.
    Distribution {
        #[arg(long)]
        epoch: u64,
    },
    /// Inspect a HolderClaim PDA for the given (holder, epoch) pair.
    HolderClaim {
        #[arg(long)]
        holder: String,
        #[arg(long)]
        epoch: u64,
    },
}

pub fn run(cli: &Cli, args: InspectArgs, format: OutputFormat) -> CliResult<()> {
    match args.target {
        InspectTarget::Config => inspect_config(cli, format),
        InspectTarget::Pet {
            kol_owner,
            kol_name,
        } => inspect_pet(cli, format, &kol_owner, &kol_name),
        InspectTarget::Launch { pet } => inspect_launch(cli, format, &pet),
        InspectTarget::King { pet } => inspect_king(cli, format, &pet),
        InspectTarget::Distribution { epoch } => inspect_distribution(cli, format, epoch),
        InspectTarget::HolderClaim { holder, epoch } => {
            inspect_holder_claim(cli, format, &holder, epoch)
        }
    }
}

fn inspect_config(cli: &Cli, format: OutputFormat) -> CliResult<()> {
    let (pda, _) = pdas::config(&cli.program_id);
    let raw = cli.get_program_account(&pda)?;
    let cfg = borsh_codec::decode_config(&pda.to_string(), &raw)?;

    render(
        format,
        "Config",
        &[
            ("pda", pda.to_string()),
            ("admin", cfg.admin.to_string()),
            ("oracle", cfg.oracle.to_string()),
            ("fee_basis_points", cfg.fee_basis_points.to_string()),
            ("bump", cfg.bump.to_string()),
        ],
        &cfg,
    );
    Ok(())
}

fn inspect_pet(
    cli: &Cli,
    format: OutputFormat,
    kol_owner: &str,
    kol_name: &str,
) -> CliResult<()> {
    let owner = parse_pubkey(kol_owner)?;
    let name_bytes = pdas::encode_kol_name(kol_name).map_err(|reason| CliError::InvalidArg {
        field: "kol-name".into(),
        reason,
    })?;
    let (pda, _) = pdas::pet(&cli.program_id, &owner, &name_bytes);
    let raw = cli.get_program_account(&pda)?;
    let pet = borsh_codec::decode_pet(&pda.to_string(), &raw)?;
    let decoded_name = borsh_codec::kol_name_to_string(&pet.kol_name);

    render(
        format,
        "Pet",
        &[
            ("pda", pda.to_string()),
            ("owner", pet.owner.to_string()),
            ("kol_name", decoded_name),
            ("bonded_at_slot", fmt_slot(pet.bonded_at)),
            ("bump", pet.bump.to_string()),
        ],
        &pet,
    );
    Ok(())
}

fn inspect_launch(cli: &Cli, format: OutputFormat, pet: &str) -> CliResult<()> {
    let pet_pubkey = parse_pubkey(pet)?;
    let (pda, _) = pdas::launch(&cli.program_id, &pet_pubkey);
    let raw = cli.get_program_account(&pda)?;
    let launch = borsh_codec::decode_launch(&pda.to_string(), &raw)?;

    render(
        format,
        "Launch",
        &[
            ("pda", pda.to_string()),
            ("pet", launch.pet.to_string()),
            ("pump_mint", launch.pump_mint.to_string()),
            ("bonded_slot", fmt_slot(launch.bonded_slot)),
            (
                "real_sol_reserve",
                fmt_lamports(launch.real_sol_reserve),
            ),
            (
                "real_token_reserve",
                launch.real_token_reserve.to_string(),
            ),
            (
                "creator_fees_lamports",
                fmt_lamports(launch.creator_fees_lamports),
            ),
            (
                "total_volume_lamports",
                fmt_lamports(launch.total_volume_lamports),
            ),
            ("graduated", launch.graduated.to_string()),
            ("bump", launch.bump.to_string()),
        ],
        &launch,
    );
    Ok(())
}

fn inspect_king(cli: &Cli, format: OutputFormat, pet: &str) -> CliResult<()> {
    let pet_pubkey = parse_pubkey(pet)?;
    let (pda, _) = pdas::king(&cli.program_id, &pet_pubkey);
    let raw = cli.get_program_account(&pda)?;
    let king = borsh_codec::decode_king(&pda.to_string(), &raw)?;

    render(
        format,
        "KingOfHill",
        &[
            ("pda", pda.to_string()),
            ("pet", king.pet.to_string()),
            ("nft_mint", king.nft_mint.to_string()),
            ("nft_escrow_vault", king.nft_escrow_vault.to_string()),
            ("current_champion", king.current_champion.to_string()),
            (
                "champion_balance",
                king.champion_balance.to_string(),
            ),
            (
                "last_captured_slot",
                fmt_slot(king.last_captured_slot),
            ),
            ("take_overs", king.take_overs.to_string()),
            ("settles_at_slot", fmt_slot(king.settles_at_slot)),
            ("settled", king.settled.to_string()),
            ("bump", king.bump.to_string()),
            (
                "nft_escrow_vault_bump",
                king.nft_escrow_vault_bump.to_string(),
            ),
        ],
        &king,
    );
    Ok(())
}

fn inspect_distribution(cli: &Cli, format: OutputFormat, epoch: u64) -> CliResult<()> {
    let (pda, _) = pdas::distribution(&cli.program_id, epoch);
    let raw = cli.get_program_account(&pda)?;
    let dist = borsh_codec::decode_distribution(&pda.to_string(), &raw)?;

    render(
        format,
        "Distribution",
        &[
            ("pda", pda.to_string()),
            ("epoch", dist.epoch.to_string()),
            ("root", fmt_hex32(&dist.root)),
            ("pool_lamports", fmt_lamports(dist.pool_lamports)),
            ("committed_at_slot", fmt_slot(dist.committed_at)),
            ("bump", dist.bump.to_string()),
        ],
        &dist,
    );
    Ok(())
}

fn inspect_holder_claim(
    cli: &Cli,
    format: OutputFormat,
    holder: &str,
    epoch: u64,
) -> CliResult<()> {
    let holder_key = parse_pubkey(holder)?;
    let (pda, _) = pdas::holder_claim(&cli.program_id, &holder_key, epoch);
    let raw = cli.get_program_account(&pda)?;
    let claim = borsh_codec::decode_holder_claim(&pda.to_string(), &raw)?;

    render(
        format,
        "HolderClaim",
        &[
            ("pda", pda.to_string()),
            ("holder", claim.holder.to_string()),
            ("epoch", claim.epoch.to_string()),
            (
                "amount_claimed",
                fmt_lamports(claim.amount_claimed),
            ),
            (
                "claimed_at_slot",
                fmt_slot(claim.claimed_at_slot),
            ),
            ("bump", claim.bump.to_string()),
        ],
        &claim,
    );
    Ok(())
}
