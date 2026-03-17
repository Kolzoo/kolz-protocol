//! Instruction submodules.
//!
//! Each file owns a single instruction's account struct + handler. lib.rs
//! exposes thin wrappers that simply call the handler so the dispatch logic
//! and account layout for each instruction live next to each other.

pub mod init_config;
pub mod bind_launch;

pub use init_config::*;
pub use bind_launch::*;
