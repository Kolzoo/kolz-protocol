//! Instruction submodules.
//!
//! Each file owns a single instruction's account struct + handler. lib.rs
//! exposes thin wrappers that simply call the handler so the dispatch logic
//! and account layout for each instruction live next to each other.

pub mod init_config;
pub mod bind_launch;
pub mod mint_kol_nft;
pub mod take_throne;
pub mod settle_throne;

pub use init_config::*;
pub use bind_launch::*;
pub use mint_kol_nft::*;
pub use take_throne::*;
pub use settle_throne::*;
