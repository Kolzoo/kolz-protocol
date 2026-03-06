//! State account definitions for the KOLZ program.
//!
//! Each submodule wraps a single `#[account]` struct plus its size and
//! initializer. Re-export everything flat so callers can write
//! `use crate::state::Pet;` without naming intermediate modules.

pub mod config;
pub mod distribution;
pub mod holder_claim;
pub mod king;
pub mod launch;
pub mod pet;

pub use config::Config;
pub use distribution::Distribution;
pub use holder_claim::HolderClaim;
pub use king::KingOfHill;
pub use launch::Launch;
pub use pet::Pet;
