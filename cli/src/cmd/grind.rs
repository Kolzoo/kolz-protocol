use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use clap::Args;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;

use crate::error::{CliError, CliResult};
use crate::output::{render, OutputFormat};

/// Required vanity suffix per the pump.fun convention.
pub const PUMP_SUFFIX: &str = "pump";

#[derive(Args, Debug)]
pub struct GrindArgs {
    /// Output path for the resulting keypair JSON file.
    #[arg(long, default_value = "./pump-mint.json")]
    pub output: String,

    /// Number of grinder threads to run in parallel.
    #[arg(long, default_value_t = num_default_threads())]
    pub threads: usize,

    /// Optional alternative case insensitive suffix to grind for.
    #[arg(long, default_value = PUMP_SUFFIX)]
    pub suffix: String,
}

#[derive(serde::Serialize)]
struct GrindOutput {
    pubkey: String,
    suffix: String,
    threads: usize,
    attempts: u64,
    elapsed_seconds: f64,
    output_path: String,
}

fn num_default_threads() -> usize {
    let n = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    n.max(1)
}

/// Validate that the requested suffix consists only of base58 characters.
fn validate_suffix(value: &str) -> CliResult<()> {
    if value.is_empty() {
        return Err(CliError::InvalidArg {
            field: "suffix".into(),
            reason: "suffix must not be empty".into(),
        });
    }
    if value.len() > 8 {
        return Err(CliError::InvalidArg {
            field: "suffix".into(),
            reason: "suffix longer than 8 chars is infeasible to grind".into(),
        });
    }
    const ALPHABET: &str = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    for c in value.chars() {
        if !ALPHABET.contains(c) {
            return Err(CliError::InvalidArg {
                field: "suffix".into(),
                reason: format!("character '{}' is not in the base58 alphabet", c),
            });
        }
    }
    Ok(())
}

pub fn run(args: GrindArgs, format: OutputFormat) -> CliResult<()> {
    validate_suffix(&args.suffix)?;
    if args.threads == 0 {
        return Err(CliError::InvalidArg {
            field: "threads".into(),
            reason: "threads must be at least 1".into(),
        });
    }

    let suffix = args.suffix.clone();
    let suffix_lower = suffix.to_lowercase();
    let found = Arc::new(AtomicBool::new(false));
    let counter = Arc::new(AtomicU64::new(0));
    let winner: Arc<Mutex<Option<Keypair>>> = Arc::new(Mutex::new(None));

    let start = Instant::now();
    let mut handles = Vec::with_capacity(args.threads);
    for _ in 0..args.threads {
        let found = Arc::clone(&found);
        let counter = Arc::clone(&counter);
        let winner = Arc::clone(&winner);
        let needle = suffix_lower.clone();
        let handle = thread::spawn(move || {
            while !found.load(Ordering::Relaxed) {
                let kp = Keypair::new();
                let s = kp.pubkey().to_string();
                counter.fetch_add(1, Ordering::Relaxed);
                if s.to_lowercase().ends_with(&needle) {
                    let mut slot = match winner.lock() {
                        Ok(g) => g,
                        Err(p) => p.into_inner(),
                    };
                    if slot.is_none() {
                        *slot = Some(kp);
                        found.store(true, Ordering::Relaxed);
                    }
                    break;
                }
            }
        });
        handles.push(handle);
    }

    for h in handles {
        if let Err(e) = h.join() {
            return Err(CliError::Internal(format!("grinder thread panicked: {:?}", e)));
        }
    }

    let elapsed = start.elapsed().as_secs_f64();
    let attempts = counter.load(Ordering::Relaxed);

    let kp = {
        let mut slot = winner
            .lock()
            .map_err(|p| CliError::Internal(format!("winner mutex poisoned: {:?}", p)))?;
        slot.take()
            .ok_or_else(|| CliError::Internal("grinder exited without a result".into()))?
    };

    let bytes = kp.to_bytes().to_vec();
    let json = serde_json::to_string(&bytes)?;
    std::fs::write(&args.output, json)?;

    let out = GrindOutput {
        pubkey: kp.pubkey().to_string(),
        suffix,
        threads: args.threads,
        attempts,
        elapsed_seconds: elapsed,
        output_path: args.output.clone(),
    };

    render(
        format,
        "cols grind",
        &[
            ("pubkey", out.pubkey.clone()),
            ("suffix", out.suffix.clone()),
            ("threads", out.threads.to_string()),
            ("attempts", out.attempts.to_string()),
            (
                "elapsed_seconds",
                format!("{:.2}", out.elapsed_seconds),
            ),
            ("output_path", out.output_path.clone()),
        ],
        &out,
    );

    Ok(())
}
