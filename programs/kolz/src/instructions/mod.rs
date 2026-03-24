//! Instruction submodules.
//!
//! Each file owns a single instruction's account struct + handler. lib.rs
//! exposes thin wrappers that simply call the handler so the dispatch logic
//! and account layout for each instruction live next to each other.

pub mod bind_launch;
pub mod claim_holder_fees;
pub mod commit_distribution_root;
pub mod init_config;
pub mod mint_kol_nft;
pub mod settle_throne;
pub mod take_throne;

pub use bind_launch::*;
pub use claim_holder_fees::*;
pub use commit_distribution_root::*;
pub use init_config::*;
pub use mint_kol_nft::*;
pub use settle_throne::*;
pub use take_throne::*;
