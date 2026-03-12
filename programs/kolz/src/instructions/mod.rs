//! Instruction submodules.
//!
//! Each file owns a single instruction's account struct + handler. lib.rs
//! exposes thin wrappers that simply call the handler so the dispatch logic
//! and account layout for each instruction live next to each other.


