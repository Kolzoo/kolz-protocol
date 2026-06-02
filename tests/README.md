# COLS Test Suite

<img src="https://img.shields.io/badge/anchor-0.30.1-blue" alt="anchor 0.30.1">
<img src="https://img.shields.io/badge/solana-1.18.26-purple" alt="solana 1.18.26">
<img src="https://img.shields.io/badge/rust-edition_2021-orange" alt="rust 2021">

End-to-end coverage for the COLS on-chain program. The suite has two halves:

1. TypeScript tests under `tests/` driven by `ts-mocha` and `@coral-xyz/anchor`.
2. Rust in-process tests under `tests-rust/` driven by `solana-program-test`.

Together they exercise the seven program instructions, the merkle distribution path, and the throne lifecycle from mint through settlement.

## Layout

```
tests/
  cols.ts             end-to-end happy path: init, bind, mint, take, settle
  throne.ts           take_throne flip alice -> bob and NotTopHolder rejection for carol
  distribution.ts     commit_distribution_root + claim_holder_fees with 3-leaf merkle tree
  utils/
    setup.ts          provider, airdrop, mint, PDA helpers
    merkle.ts         keccak256 merkle tree mirror of the SDK
    program.ts        IDL loader + program builder
  fixtures/
    devnet.json       devnet RPC, program id, oracle pubkey, fee bps
tests-rust/
  integration_test.rs in-process bank test for bind, take, settle
```

## Running the TypeScript tests

```
anchor test
```

`anchor test` boots a local validator, builds the program at `programs/cols`, copies the IDL into `programs/cols/idl/cols.json`, and runs every `tests/*.ts` file through `ts-mocha`. The provider is taken from the `Anchor.toml` config, so no manual env vars are required.

If you prefer to drive an already-running validator, point `ANCHOR_PROVIDER_URL` and `ANCHOR_WALLET` at it and call `ts-mocha -p ./tsconfig.json -t 60000 tests/**/*.ts` directly.

## Running the Rust integration test

```
cd tests-rust
cargo test --release
```

The Rust test compiles the `cols` program with `solana-program-test` and exercises bind, take, and settle inside a process-local bank with deterministic slot warps.

## Devnet fixture

`fixtures/devnet.json` carries the public devnet config. The oracle pubkey there is the System Program as a placeholder; replace it with the real oracle authority before running the suite against a live devnet deployment.

## Conventions

- All PDA seed patterns are mirrored in `utils/setup.ts` so the tests never duplicate raw byte literals.
- Merkle proofs in `utils/merkle.ts` use keccak256 with sorted pair hashing, matching the on-chain verifier and the SDK helper.
- Error checks match by name and by anchor numeric code, so a single suite covers both compiled and source builds of the IDL.
