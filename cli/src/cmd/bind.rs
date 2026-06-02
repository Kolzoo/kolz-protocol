use borsh::BorshSerialize;
use clap::Args;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::signer::Signer;
use solana_sdk::system_program;

use crate::discriminator;
use crate::error::{CliError, CliResult};
use crate::output::{render, OutputFormat};
use crate::pdas;
use crate::rpc::{parse_pubkey, Cli};

#[derive(Args, Debug)]
pub struct BindArgs {
    /// KOL owner pubkey, used as the first seed of the Pet PDA.
    #[arg(long = "kol-owner")]
    pub kol_owner: String,

    /// pump.fun mint address being bonded into the protocol.
    #[arg(long = "pump-mint")]
    pub pump_mint: String,

    /// Human readable KOL name. Max 32 bytes.
    #[arg(long = "kol-name")]
    pub kol_name: String,
}

#[derive(BorshSerialize)]
struct BindPayload {
    discriminator: [u8; 8],
    kol_name: [u8; 32],
}

#[derive(serde::Serialize)]
struct BindOutput {
    signature: String,
    pet_pda: String,
    launch_pda: String,
    kol_name: String,
    kol_owner: String,
    pump_mint: String,
}

pub fn run(cli: &Cli, args: BindArgs, format: OutputFormat) -> CliResult<()> {
    let kol_owner = parse_pubkey(&args.kol_owner)?;
    let pump_mint = parse_pubkey(&args.pump_mint)?;

    let name_bytes = pdas::encode_kol_name(&args.kol_name).map_err(|reason| {
        CliError::InvalidArg {
            field: "kol-name".into(),
            reason,
        }
    })?;

    let (config_pda, _) = pdas::config(&cli.program_id);
    let (pet_pda, _) = pdas::pet(&cli.program_id, &kol_owner, &name_bytes);
    let (launch_pda, _) = pdas::launch(&cli.program_id, &pet_pda);

    let payload = BindPayload {
        discriminator: discriminator::instruction("oracle_bind_pumpfun_launch"),
        kol_name: name_bytes,
    };
    let data = payload
        .try_to_vec()
        .map_err(|e| CliError::Internal(format!("bind encode: {}", e)))?;

    let oracle = cli.payer.pubkey();
    let ix = Instruction {
        program_id: cli.program_id,
        accounts: vec![
            AccountMeta::new(oracle, true),
            AccountMeta::new_readonly(config_pda, false),
            AccountMeta::new_readonly(kol_owner, false),
            AccountMeta::new_readonly(pump_mint, false),
            AccountMeta::new(pet_pda, false),
            AccountMeta::new(launch_pda, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data,
    };

    let sig = cli.send(vec![ix])?;

    let out = BindOutput {
        signature: sig.to_string(),
        pet_pda: pet_pda.to_string(),
        launch_pda: launch_pda.to_string(),
        kol_name: args.kol_name,
        kol_owner: kol_owner.to_string(),
        pump_mint: pump_mint.to_string(),
    };

    render(
        format,
        "cols bind",
        &[
            ("signature", out.signature.clone()),
            ("pet_pda", out.pet_pda.clone()),
            ("launch_pda", out.launch_pda.clone()),
            ("kol_name", out.kol_name.clone()),
            ("kol_owner", out.kol_owner.clone()),
            ("pump_mint", out.pump_mint.clone()),
        ],
        &out,
    );

    Ok(())
}
