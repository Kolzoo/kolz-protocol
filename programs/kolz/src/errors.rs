//! Domain-specific error codes returned by KOLZ instructions.
//!
//! These map one-to-one with the matrix called out in the protocol spec. Each
//! variant carries a human-readable message that surfaces in the Anchor client
//! when a transaction simulation fails so operators can diagnose without having
//! to look up numeric error codes.

use anchor_lang::prelude::*;

#[error_code]
pub enum KolzError {
    #[msg("signer does not match the expected authority")]
    Unauthorized = 6000,

    #[msg("provided oracle does not match the configured oracle")]
    OracleMismatch = 6001,

    #[msg("provided admin does not match the configured admin")]
    AdminMismatch = 6002,

    #[msg("challenger does not hold a strictly larger balance than the current champion")]
    NotTopHolder = 6003,

    #[msg("the settlement window has elapsed for this throne")]
    SettlementPeriodEnded = 6004,

    #[msg("this throne has already been settled")]
    AlreadySettled = 6005,

    #[msg("settlement window has not yet elapsed")]
    SettlementNotReady = 6006,

    #[msg("previous champion token account was not supplied")]
    MissingPrevChampionAta = 6007,

    #[msg("metaplex token metadata program account was not supplied")]
    MissingMetadataProgram = 6008,

    #[msg("this holder has already claimed for this epoch")]
    AlreadyClaimed = 6009,

    #[msg("merkle proof did not validate against the committed root")]
    InvalidProof = 6010,

    #[msg("no distribution root has been committed for this epoch")]
    EpochNotCommitted = 6011,

    #[msg("fee vault balance is below the requested amount")]
    InsufficientVault = 6012,

    #[msg("amount must be greater than zero")]
    InvalidAmount = 6013,

    #[msg("kol name exceeds the 32 byte budget")]
    NameTooLong = 6014,

    #[msg("metadata uri exceeds the 200 byte budget")]
    UriTooLong = 6015,

    #[msg("metadata symbol exceeds the 10 byte budget")]
    SymbolTooLong = 6016,

    #[msg("bonding curve state was not initialized for this pet")]
    BondingCurveNotInitialized = 6017,

    #[msg("fee basis points must be within 0..=10000")]
    FeeBpsOutOfRange = 6018,

    #[msg("supplied pet account does not match the launch state")]
    PetMismatch = 6019,

    #[msg("supplied launch account does not match the king state")]
    LaunchMismatch = 6020,

    #[msg("supplied mint does not match the king nft mint")]
    MintMismatch = 6021,

    #[msg("escrow vault does not hold the expected NFT supply")]
    EscrowSupplyMismatch = 6022,

    #[msg("challenger ATA owner does not match the signing challenger")]
    AtaOwnerMismatch = 6023,
}
