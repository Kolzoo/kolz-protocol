# Changelog

All notable changes to KOLZ are documented in this file.

## 0.4.1

- Refined CLI JSON output schema for `inspect` and `vault show`.
- Added Rust integration test exercising the full settle flow.
- Tightened deployment doc with verifier build commands.

## 0.3.0

- Added distribution merkle helpers to the SDK.
- Added `commit_distribution_root` and `claim_holder_fees` instructions.
- Added throne deep dive and distributions deep dive documents.

## 0.2.0

- Added `mint_kol_nft`, `take_throne`, and `settle_throne` instructions.
- Added Mermaid diagrams to `docs/architecture.md` and `docs/throne.md`.
- Hardened error enum with 17 variants.

## 0.1.0

- Initial Anchor program with `init_config` and `oracle_bind_pumpfun_launch`.
- TypeScript SDK skeleton with `KolzClient`.
- Rust CLI scaffold with `config init` and `launch bind`.
- Documentation skeleton under `docs/`.
