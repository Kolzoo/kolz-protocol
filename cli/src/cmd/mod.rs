//! CLI subcommand modules.
//!
//! Each file maps to one `kolz <subcommand>` group. The dispatcher in
//! `main.rs` matches the parsed clap variant to the corresponding `run`
//! function defined here.

pub mod init;
pub mod bind;
pub mod mint_nft;
pub mod take_throne;
pub mod settle;
pub mod commit_root;
