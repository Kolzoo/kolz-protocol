//! KOLZ on-chain program.
//!
//! Top-level dispatch module. Every instruction handler lives in its own
//! file under `instructions/`. Each wrapper here simply forwards to the
//! handler so the `#[program]` module stays focused on dispatch.

#![allow(clippy::too_many_arguments)]
#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;

use crate::instructions::*;

declare_id!("Kolz1111111111111111111111111111111111111111");

#[program]
pub mod kolz {
    use super::*;
}
