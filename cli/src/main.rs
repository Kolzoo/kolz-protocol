//! kolz: command line client for the KOLZ on-chain program.
//!
//! Every subcommand is implemented in `src/cmd/*.rs` and dispatched from the
//! `run` function below. Global flags such as the RPC endpoint, keypair
//! path, and program id are parsed once and passed to each subcommand
//! through the `rpc::Cli` context.

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};

mod borsh_codec;
mod cmd;
mod discriminator;
mod error;
mod output;
mod pdas;
mod rpc;

use crate::error::CliResult;
use crate::output::OutputFormat;
use crate::rpc::{commitment_level_from_str, Cli};

#[derive(Parser, Debug)]
#[command(
    name = "kolz",
    about = "Command line client for the KOLZ on-chain program",
    version,
    long_about = None
)]
struct Root {
    /// Solana JSON RPC endpoint.
    #[arg(long, global = true, default_value = rpc::DEFAULT_RPC_URL)]
    rpc: String,

    /// Path to the Solana keypair JSON file used as fee payer and signer.
    #[arg(long, global = true, default_value_os_t = default_keypair_path())]
    keypair: PathBuf,

    /// kolz program id. Defaults to the published mainnet id.
    #[arg(long = "program-id", global = true, default_value = rpc::DEFAULT_PROGRAM_ID)]
    program_id: String,

    /// Commitment level: processed, confirmed, or finalized.
    #[arg(long, global = true, default_value = "confirmed")]
    commitment: String,

    /// Emit machine readable JSON instead of the human friendly table.
    #[arg(long, global = true, default_value_t = false)]
    json: bool,

    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Initialize the global Config PDA.
    Init(cmd::init::InitArgs),
    /// Bind a pump.fun launch to a KOL pet.
    Bind(cmd::bind::BindArgs),
    /// Mint the 1 of 1 King of the Hill NFT for a bound pet.
    MintNft(cmd::mint_nft::MintNftArgs),
    /// Capture the throne by holding the most of the bound memecoin.
    TakeThrone(cmd::take_throne::TakeThroneArgs),
    /// Settle the throne after the seven day window.
    Settle(cmd::settle::SettleArgs),
    /// Commit a distribution merkle root for an epoch.
    CommitRoot(cmd::commit_root::CommitRootArgs),
    /// Claim holder fees against a committed distribution.
    Claim(cmd::claim::ClaimArgs),
    /// Read and decode on-chain state accounts.
    Inspect(cmd::inspect::InspectArgs),
    /// Grind a vanity mint keypair whose pubkey ends with a target suffix.
    Grind(cmd::grind::GrindArgs),
}

fn default_keypair_path() -> PathBuf {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join(".config").join("solana").join("id.json")
}

fn main() -> ExitCode {
    let root = Root::parse();
    let format = OutputFormat::from_flag(root.json);

    let result = dispatch(root, format);
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            if format == OutputFormat::Json {
                let payload = serde_json::json!({
                    "ok": false,
                    "error": err.to_string(),
                });
                println!("{}", payload);
            } else {
                eprintln!("error: {}", err);
            }
            ExitCode::from(1)
        }
    }
}

fn dispatch(root: Root, format: OutputFormat) -> CliResult<()> {
    let Root {
        rpc: rpc_url,
        keypair,
        program_id,
        commitment,
        json: _,
        cmd: subcommand,
    } = root;

    match subcommand {
        Command::Grind(args) => cmd::grind::run(args, format),
        Command::Init(args) => {
            let cli = build_cli(&rpc_url, &keypair, &program_id, &commitment)?;
            cmd::init::run(&cli, args, format)
        }
        Command::Bind(args) => {
            let cli = build_cli(&rpc_url, &keypair, &program_id, &commitment)?;
            cmd::bind::run(&cli, args, format)
        }
        Command::MintNft(args) => {
            let cli = build_cli(&rpc_url, &keypair, &program_id, &commitment)?;
            cmd::mint_nft::run(&cli, args, format)
        }
        Command::TakeThrone(args) => {
            let cli = build_cli(&rpc_url, &keypair, &program_id, &commitment)?;
            cmd::take_throne::run(&cli, args, format)
        }
        Command::Settle(args) => {
            let cli = build_cli(&rpc_url, &keypair, &program_id, &commitment)?;
            cmd::settle::run(&cli, args, format)
        }
        Command::CommitRoot(args) => {
            let cli = build_cli(&rpc_url, &keypair, &program_id, &commitment)?;
            cmd::commit_root::run(&cli, args, format)
        }
        Command::Claim(args) => {
            let cli = build_cli(&rpc_url, &keypair, &program_id, &commitment)?;
            cmd::claim::run(&cli, args, format)
        }
        Command::Inspect(args) => {
            let cli = build_cli(&rpc_url, &keypair, &program_id, &commitment)?;
            cmd::inspect::run(&cli, args, format)
        }
    }
}

fn build_cli(
    rpc_url: &str,
    keypair: &PathBuf,
    program_id: &str,
    commitment: &str,
) -> CliResult<Cli> {
    let level = commitment_level_from_str(commitment)?;
    Cli::new(rpc_url, keypair, program_id, level)
}
