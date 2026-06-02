use borsh::BorshSerialize;
use clap::Args;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::signer::Signer;
use solana_sdk::system_program;

use crate::discriminator;
use crate::error::{CliError, CliResult};
use crate::output::{render, OutputFormat};
use crate::pdas;
use crate::rpc::Cli;

#[derive(Args, Debug)]
pub struct CommitRootArgs {
    /// Epoch number this distribution applies to.
    #[arg(long)]
    pub epoch: u64,

    /// 32 byte hex encoded keccak merkle root with no `0x` prefix.
    #[arg(long)]
    pub root: String,

    /// Total lamports the distribution accounts for in this epoch.
    #[arg(long = "pool-lamports")]
    pub pool_lamports: u64,
}

#[derive(BorshSerialize)]
struct CommitPayload {
    discriminator: [u8; 8],
    epoch: u64,
    root: [u8; 32],
    pool_lamports: u64,
}

#[derive(serde::Serialize)]
struct CommitOutput {
    signature: String,
    distribution_pda: String,
    epoch: u64,
    root: String,
    pool_lamports: u64,
}

/// Decode a 64 character hex string into a 32 byte buffer.
fn decode_hex32(field: &str, value: &str) -> CliResult<[u8; 32]> {
    let trimmed = value.trim_start_matches("0x");
    if trimmed.len() != 64 {
        return Err(CliError::InvalidHex {
            field: field.to_string(),
            reason: format!("expected 64 hex chars, got {}", trimmed.len()),
        });
    }
    let mut out = [0u8; 32];
    for i in 0..32 {
        let byte_str = &trimmed[i * 2..i * 2 + 2];
        out[i] = u8::from_str_radix(byte_str, 16).map_err(|e| CliError::InvalidHex {
            field: field.to_string(),
            reason: format!("byte {}: {}", i, e),
        })?;
    }
    Ok(out)
}

pub fn run(cli: &Cli, args: CommitRootArgs, format: OutputFormat) -> CliResult<()> {
    if args.pool_lamports == 0 {
        return Err(CliError::InvalidArg {
            field: "pool-lamports".into(),
            reason: "pool must be greater than zero".into(),
        });
    }
    let root = decode_hex32("root", &args.root)?;

    let (config_pda, _) = pdas::config(&cli.program_id);
    let (distribution_pda, _) = pdas::distribution(&cli.program_id, args.epoch);
    let (fee_vault_pda, _) = pdas::fee_vault(&cli.program_id);

    let payload = CommitPayload {
        discriminator: discriminator::instruction("commit_distribution_root"),
        epoch: args.epoch,
        root,
        pool_lamports: args.pool_lamports,
    };
    let data = payload
        .try_to_vec()
        .map_err(|e| CliError::Internal(format!("commit_root encode: {}", e)))?;

    let oracle = cli.payer.pubkey();
    let ix = Instruction {
        program_id: cli.program_id,
        accounts: vec![
            AccountMeta::new(oracle, true),
            AccountMeta::new_readonly(config_pda, false),
            AccountMeta::new(distribution_pda, false),
            AccountMeta::new(fee_vault_pda, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data,
    };

    let sig = cli.send(vec![ix])?;

    let out = CommitOutput {
        signature: sig.to_string(),
        distribution_pda: distribution_pda.to_string(),
        epoch: args.epoch,
        root: args.root,
        pool_lamports: args.pool_lamports,
    };

    render(
        format,
        "cols commit-root",
        &[
            ("signature", out.signature.clone()),
            ("distribution_pda", out.distribution_pda.clone()),
            ("epoch", out.epoch.to_string()),
            ("root", out.root.clone()),
            ("pool_lamports", out.pool_lamports.to_string()),
        ],
        &out,
    );

    Ok(())
}
