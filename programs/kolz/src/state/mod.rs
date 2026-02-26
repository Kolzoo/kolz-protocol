//! State account definitions for the KOLZ program.
//!
//! Each submodule wraps a single `#[account]` struct plus its size and
//! initializer. Re-export everything flat so callers can write
//! `use crate::state::Pet;` without naming intermediate modules.

pub mod config;
pub mod pet;

pub use config::Config;
pub use pet::Pet;
