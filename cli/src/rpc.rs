use std::path::Path;
use std::str::FromStr;
use std::time::Duration;

use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::{CommitmentConfig, CommitmentLevel};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{read_keypair_file, Keypair, Signature};
use solana_sdk::signer::Signer;
use solana_sdk::transaction::Transaction;

use crate::error::{CliError, CliResult};

/// Default mainnet endpoint used when the user does not pass `--rpc`.
pub const DEFAULT_RPC_URL: &str = "https://api.mainnet-beta.solana.com";

/// Default published program id for the cols Anchor program. Using the
/// System Program as a placeholder keeps the binary functional for local
/// validators where the user passes `--program-id` explicitly.
pub const DEFAULT_PROGRAM_ID: &str = "11111111111111111111111111111111";

/// Wrapper around `RpcClient` plus the signer used by the CLI.
pub struct Cli {
    pub rpc: RpcClient,
    pub payer: Keypair,
    pub program_id: Pubkey,
    pub commitment: CommitmentConfig,
}

impl Cli {
    /// Build a CLI context from the parsed global flags.
    pub fn new(
        rpc_url: &str,
        keypair_path: &Path,
        program_id: &str,
        commitment_level: CommitmentLevel,
    ) -> CliResult<Self> {
        let commitment = CommitmentConfig {
            commitment: commitment_level,
        };
        let rpc = RpcClient::new_with_timeout_and_commitment(
            rpc_url.to_string(),
            Duration::from_secs(60),
            commitment,
        );

        let payer = load_keypair(keypair_path)?;
        let program_id =
            Pubkey::from_str(program_id).map_err(|e| CliError::pubkey(e))?;

        Ok(Cli {
            rpc,
            payer,
            program_id,
            commitment,
        })
    }

    /// Build, sign, broadcast, and confirm a transaction.
    pub fn send(&self, instructions: Vec<solana_sdk::instruction::Instruction>) -> CliResult<Signature> {
        self.send_with_signers(instructions, &[])
    }

    /// Same as `send` but allows attaching additional signers such as newly
    /// generated mint keypairs.
    pub fn send_with_signers(
        &self,
        instructions: Vec<solana_sdk::instruction::Instruction>,
        extra_signers: &[&Keypair],
    ) -> CliResult<Signature> {
        let blockhash = self
            .rpc
            .get_latest_blockhash()
            .map_err(CliError::rpc)?;

        let mut signers: Vec<&Keypair> = Vec::with_capacity(1 + extra_signers.len());
        signers.push(&self.payer);
        for s in extra_signers {
            signers.push(*s);
        }

        let tx = Transaction::new_signed_with_payer(
            &instructions,
            Some(&self.payer.pubkey()),
            &signers,
            blockhash,
        );

        let sig = self
            .rpc
            .send_and_confirm_transaction_with_spinner_and_commitment(&tx, self.commitment)
            .map_err(CliError::rpc)?;
        Ok(sig)
    }

    /// Fetch raw account data and verify the owner matches the program id.
    pub fn get_program_account(&self, address: &Pubkey) -> CliResult<Vec<u8>> {
        let account = self
            .rpc
            .get_account(address)
            .map_err(|_| CliError::AccountNotFound {
                address: address.to_string(),
            })?;
        if account.owner != self.program_id {
            return Err(CliError::AccountOwnerMismatch {
                address: address.to_string(),
                expected: self.program_id.to_string(),
                actual: account.owner.to_string(),
            });
        }
        Ok(account.data)
    }

    /// Fetch raw account data without owner verification.
    pub fn get_account_data(&self, address: &Pubkey) -> CliResult<Vec<u8>> {
        let account = self
            .rpc
            .get_account(address)
            .map_err(|_| CliError::AccountNotFound {
                address: address.to_string(),
            })?;
        Ok(account.data)
    }
}

/// Load a Solana keypair from the canonical JSON byte array format.
pub fn load_keypair(path: &Path) -> CliResult<Keypair> {
    read_keypair_file(path).map_err(|e| CliError::Keypair {
        path: path.display().to_string(),
        reason: e.to_string(),
    })
}

/// Parse a base58 public key argument into a `Pubkey`.
pub fn parse_pubkey(value: &str) -> CliResult<Pubkey> {
    Pubkey::from_str(value).map_err(CliError::pubkey)
}

/// Convert a `CommitmentLevel` parsed from `clap` into the SDK type.
pub fn commitment_level_from_str(value: &str) -> CliResult<CommitmentLevel> {
    match value.to_ascii_lowercase().as_str() {
        "processed" => Ok(CommitmentLevel::Processed),
        "confirmed" => Ok(CommitmentLevel::Confirmed),
        "finalized" => Ok(CommitmentLevel::Finalized),
        other => Err(CliError::InvalidArg {
            field: "commitment".into(),
            reason: format!("unknown level '{}', expected processed|confirmed|finalized", other),
        }),
    }
}
