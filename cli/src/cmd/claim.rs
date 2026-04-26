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
pub struct ClaimArgs {
    /// Epoch the claim is being filed against.
    #[arg(long)]
    pub epoch: u64,

    /// Lamport amount being claimed for this holder.
    #[arg(long)]
    pub amount: u64,

    /// Comma separated list of 64 character hex merkle proof nodes,
    /// ordered from leaf to root.
    #[arg(long, value_delimiter = ',')]
    pub proof: Vec<String>,
}

#[derive(BorshSerialize)]
struct ClaimPayload {
    discriminator: [u8; 8],
    epoch: u64,
    amount: u64,
    proof: Vec<[u8; 32]>,
}

#[derive(serde::Serialize)]
struct ClaimOutput {
    signature: String,
    holder: String,
    holder_claim_pda: String,
    distribution_pda: String,
    fee_vault_pda: String,
    epoch: u64,
    amount: u64,
    proof_nodes: usize,
}

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

pub fn run(cli: &Cli, args: ClaimArgs, format: OutputFormat) -> CliResult<()> {
    if args.amount == 0 {
        return Err(CliError::InvalidArg {
            field: "amount".into(),
            reason: "amount must be greater than zero".into(),
        });
    }
    if args.proof.is_empty() {
        return Err(CliError::InvalidArg {
            field: "proof".into(),
            reason: "proof must contain at least one merkle node".into(),
        });
    }

    let mut proof_nodes: Vec<[u8; 32]> = Vec::with_capacity(args.proof.len());
    for (idx, hex) in args.proof.iter().enumerate() {
        let label = format!("proof[{}]", idx);
        proof_nodes.push(decode_hex32(&label, hex)?);
    }

    let holder = cli.payer.pubkey();
    let (distribution_pda, _) = pdas::distribution(&cli.program_id, args.epoch);
    let (fee_vault_pda, _) = pdas::fee_vault(&cli.program_id);
    let (holder_claim_pda, _) = pdas::holder_claim(&cli.program_id, &holder, args.epoch);

    let payload = ClaimPayload {
        discriminator: discriminator::instruction("claim_holder_fees"),
        epoch: args.epoch,
        amount: args.amount,
        proof: proof_nodes.clone(),
    };
    let data = payload
        .try_to_vec()
        .map_err(|e| CliError::Internal(format!("claim encode: {}", e)))?;

    let ix = Instruction {
        program_id: cli.program_id,
        accounts: vec![
            AccountMeta::new(holder, true),
            AccountMeta::new_readonly(distribution_pda, false),
            AccountMeta::new(holder_claim_pda, false),
            AccountMeta::new(fee_vault_pda, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data,
    };

    let sig = cli.send(vec![ix])?;

    let out = ClaimOutput {
        signature: sig.to_string(),
        holder: holder.to_string(),
        holder_claim_pda: holder_claim_pda.to_string(),
        distribution_pda: distribution_pda.to_string(),
        fee_vault_pda: fee_vault_pda.to_string(),
        epoch: args.epoch,
        amount: args.amount,
        proof_nodes: proof_nodes.len(),
    };

    render(
        format,
        "kolz claim",
        &[
            ("signature", out.signature.clone()),
            ("holder", out.holder.clone()),
            ("holder_claim_pda", out.holder_claim_pda.clone()),
            ("distribution_pda", out.distribution_pda.clone()),
            ("fee_vault_pda", out.fee_vault_pda.clone()),
            ("epoch", out.epoch.to_string()),
            ("amount", out.amount.to_string()),
            ("proof_nodes", out.proof_nodes.to_string()),
        ],
        &out,
    );

    Ok(())
}
