use thiserror::Error;

/// All error variants returned by the cols CLI.
///
/// Every public command in this crate returns `Result<T, CliError>` so the
/// top level `main` function has a single error surface to report on.
#[derive(Debug, Error)]
pub enum CliError {
    #[error("rpc transport error: {0}")]
    Rpc(String),

    #[error("invalid keypair file at {path}: {reason}")]
    Keypair { path: String, reason: String },

    #[error("invalid pubkey input: {0}")]
    InvalidPubkey(String),

    #[error("invalid hex input for {field}: {reason}")]
    InvalidHex { field: String, reason: String },

    #[error("invalid argument {field}: {reason}")]
    InvalidArg { field: String, reason: String },

    #[error("account {address} not found on chain")]
    AccountNotFound { address: String },

    #[error("account {address} is owned by {actual} but the CLI expected {expected}")]
    AccountOwnerMismatch {
        address: String,
        expected: String,
        actual: String,
    },

    #[error("account {address} data length {actual} is below the expected minimum {expected}")]
    AccountTooSmall {
        address: String,
        expected: usize,
        actual: usize,
    },

    #[error("account {address} carries discriminator {found} which does not match expected {expected}")]
    DiscriminatorMismatch {
        address: String,
        expected: String,
        found: String,
    },

    #[error("borsh decoding failed for {target}: {reason}")]
    Decode { target: String, reason: String },

    #[error("transaction simulation failed: {0}")]
    Simulation(String),

    #[error("transaction did not confirm within the configured timeout")]
    ConfirmationTimeout,

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("unexpected internal error: {0}")]
    Internal(String),
}

impl CliError {
    /// Build a generic transport error from any displayable source.
    pub fn rpc<E: std::fmt::Display>(err: E) -> Self {
        CliError::Rpc(err.to_string())
    }

    /// Build an invalid pubkey error from any displayable source.
    pub fn pubkey<E: std::fmt::Display>(err: E) -> Self {
        CliError::InvalidPubkey(err.to_string())
    }
}

/// Convenience alias used throughout the crate.
pub type CliResult<T> = Result<T, CliError>;
