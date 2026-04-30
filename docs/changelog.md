# KOLZ Per-Component Changelog

This file mirrors the root `CHANGELOG.md` split by component. Each section lists changes affecting the corresponding subsystem only. Use this view when you want to know "what changed in the SDK between v0.2 and v0.3" without scanning the full project log.

The version scheme is semver across all components. A bump in any component bumps the umbrella version.

## On-chain program

### 0.1.0

- Initial release of the `kolz` Anchor program.
- Pinned `anchor = "0.30.1"`, `solana-program = "=1.18.26"`, `rust edition = "2021"`.
- Implemented 7 instructions: `init_config`, `oracle_bind_pumpfun_launch`, `mint_kol_nft`, `take_throne`, `settle_throne`, `commit_distribution_root`, `claim_holder_fees`.
- State accounts: `Config`, `Pet`, `Launch`, `KingOfHill`, `Distribution`, `HolderClaim`.
- Error enum with 17 variants covering all failure paths.
- 7-day settlement window measured in slots (1_512_000 at 0.4s/slot).
- keccak256 merkle proof verifier using sorted-pair hashing.

## TypeScript SDK

### 0.1.0

- Initial release of `@kolz/sdk`.
- Compiled with `target: ES2020`, `module: commonjs`, `strict: true`.
- `KolzClient` class wrapping all 7 instructions.
- PDA derivation helpers: `findConfigPda`, `findPetPda`, `findLaunchPda`, `findKingPda`, `findDistributionPda`, `findHolderClaimPda`, `findFeeVaultPda`.
- Merkle helpers: `buildMerkleTree`, `getMerkleProof`, `computeLeaf`.
- `encodeKolName` for `[u8; 32]` padding.
- Typed error wrapper `KolzError` with `KolzErrorCode` enum.
- Account fetchers with `null` on miss.

## CLI

### 0.1.0

- Initial release of the `kolz` Rust CLI.
- Subcommands: `config init|show`, `launch bind|show`, `nft mint`, `throne take|settle|show`, `distribution commit|show`, `claim build|submit`, `vault show|fund`.
- Global flags: `--rpc-url`, `--keypair`, `--program-id`, `--commitment`, `--json`.
- Reads `~/.config/solana/cli/config.yml` for defaults.
- JSON output mode on every subcommand with stable schema per major version.

## Oracle service

### 0.1.0

- Initial release of the off-chain oracle.
- Watches pump.fun program logs and Geyser account stream for bound launches.
- Computes per-epoch holder allocations and publishes merkle roots via `commit_distribution_root`.
- Hot single-key signer by design. Rotation handled by admin via `init_config`.

## Documentation

### 0.1.0

- Initial release of the documentation set under `docs/`.
- Architecture diagram, instruction reference, SDK guide, CLI guide, deployment guide, security analysis, throne deep dive, distributions deep dive, pump.fun integration notes, glossary, FAQ, and this changelog.
- Three Mermaid diagrams: system architecture (architecture.md), throne lifecycle (throne.md), distribution epoch sequence (distributions.md).

## See also

- Root project changelog at `CHANGELOG.md` in the repository root.
- Release tags at `https://github.com/Kolzoo/kolz-protocol/releases`.
