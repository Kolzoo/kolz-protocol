# Contributing to COLS

Thanks for taking the time to contribute. This document explains how to file issues, propose changes, and get a pull request merged.

## Ground rules

1. Open an issue before starting a large change so the design can be discussed.
2. Keep pull requests focused. One logical change per PR.
3. Every PR must include tests for the behavior it changes.
4. CI must pass. If a check is flaky, mention it in the PR description.
5. Be respectful. The [Code of Conduct](./CODE_OF_CONDUCT.md) applies to all interactions.

## Development setup

Prerequisites:

- Rust 1.78 via `rustup`
- Solana CLI 1.18.26
- Anchor CLI 0.30.1 (`avm install 0.30.1 && avm use 0.30.1`)
- Node.js 20 and Yarn

Clone and build:

```bash
git clone https://github.com/Kolzoo/cols-protocol.git
cd cols-protocol
anchor build
cargo build --release -p cols-cli
cd sdk && yarn install --frozen-lockfile && yarn build
```

Run the test suite:

```bash
cargo test --workspace
cd sdk && yarn test
anchor test
```

## Branching and commits

Branches are cut from `main`. Use a short, descriptive branch name in the form `area/short-summary`, for example `program/fix-throne-takeover` or `sdk/expose-merkle-helpers`.

Commit messages follow Conventional Commits:

```
type(scope): short summary

Optional body explaining why the change is needed.
```

Accepted types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, `ci`.

## Pull request flow

1. Fork the repo and create a feature branch.
2. Make the change with tests.
3. Run `cargo fmt --all` and `cargo clippy --workspace --all-targets`.
4. Push the branch and open a pull request against `main`.
5. Fill in the PR template. Link the related issue if there is one.
6. A reviewer will leave comments. Address them with new commits, do not force-push during review unless asked.
7. Once approved and CI is green, a maintainer will squash and merge.

## Testing requirements

Changes to the on-chain program must include both a Rust unit test in the same crate and a TypeScript integration test under `tests/`. Changes to the SDK must include a Jest test in `sdk/test/`. Changes to the CLI must include an integration test under `cli/src/` or `tests/`.

## Security

If you find a security issue, do not open a public issue. Read [SECURITY.md](./SECURITY.md) and follow the disclosure process there.

## License

By contributing you agree that your contributions will be licensed under the MIT License of this repository.
