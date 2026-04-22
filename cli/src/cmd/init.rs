use borsh::BorshSerialize;
use clap::Args;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signer::Signer;
use solana_sdk::system_program;

use crate::discriminator;
use crate::error::{CliError, CliResult};
use crate::output::{render, OutputFormat};
use crate::pdas;
use crate::rpc::{parse_pubkey, Cli};

#[derive(Args, Debug)]
pub struct InitArgs {
    /// Oracle authority allowed to bind launches and submit distributions.
    #[arg(long)]
    pub oracle: String,

    /// Protocol fee in basis points (1 bps = 0.01 percent). Max 10000.
    #[arg(long = "fee-bps")]
    pub fee_basis_points: u32,
}

#[derive(BorshSerialize)]
struct InitConfigPayload {
    discriminator: [u8; 8],
    oracle: Pubkey,
    fee_basis_points: u32,
}

#[derive(serde::Serialize)]
struct InitOutput {
    signature: String,
    config_pda: String,
    admin: String,
    oracle: String,
    fee_basis_points: u32,
}

pub fn run(cli: &Cli, args: InitArgs, format: OutputFormat) -> CliResult<()> {
    if args.fee_basis_points > 10_000 {
        return Err(CliError::InvalidArg {
            field: "fee-bps".into(),
            reason: format!(
                "value {} exceeds 10000 basis points (100 percent) cap",
                args.fee_basis_points
            ),
        });
    }

    let oracle = parse_pubkey(&args.oracle)?;
    let (config_pda, _) = pdas::config(&cli.program_id);
    let admin = cli.payer.pubkey();

    let payload = InitConfigPayload {
        discriminator: discriminator::instruction("init_config"),
        oracle,
        fee_basis_points: args.fee_basis_points,
    };
    let data = payload
        .try_to_vec()
        .map_err(|e| CliError::Internal(format!("init_config encode: {}", e)))?;

    let ix = Instruction {
        program_id: cli.program_id,
        accounts: vec![
            AccountMeta::new(config_pda, false),
            AccountMeta::new(admin, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data,
    };

    let sig = cli.send(vec![ix])?;

    let out = InitOutput {
        signature: sig.to_string(),
        config_pda: config_pda.to_string(),
        admin: admin.to_string(),
        oracle: oracle.to_string(),
        fee_basis_points: args.fee_basis_points,
    };

    render(
        format,
        "kolz init",
        &[
            ("signature", out.signature.clone()),
            ("config_pda", out.config_pda.clone()),
            ("admin", out.admin.clone()),
            ("oracle", out.oracle.clone()),
            ("fee_bps", out.fee_basis_points.to_string()),
        ],
        &out,
    );

    Ok(())
}
