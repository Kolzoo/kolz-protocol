# KOLZ

<img src="https://img.shields.io/badge/anchor-0.30.1-blue" alt="anchor version">
<img src="https://img.shields.io/badge/solana-1.18.26-purple" alt="solana version">
<img src="https://img.shields.io/badge/license-MIT-green" alt="license">
<img src="https://img.shields.io/badge/ts-ES2020-3178c6" alt="ts target">

Solana protocol that binds KOL identities to pump.fun launches, mints 1/1
king-of-the-hill NFTs, runs a fixed 7-day throne, and distributes trade fees to
token holders against an on-chain merkle root.

## Components

| Path | What it is |
| --- | --- |
| `programs/kolz` | Anchor on-chain program. |
| `sdk` | TypeScript SDK wrapping every instruction. |
| `cli` | Rust CLI built on top of the SDK semantics. |
| `examples` | End-to-end TypeScript scripts. |
| `docs` | Architecture, instruction reference, deployment guide. |
| `tests` | Anchor + ts-mocha end to end tests. |
| `tests-rust` | Rust integration tests using the on-chain program. |

## Quick links

- Architecture: `docs/architecture.md`
- Instruction reference: `docs/instructions.md`
- SDK guide: `docs/client.md`
- CLI guide: `docs/cli.md`
- Deployment: `docs/deployment.md`
- FAQ: `docs/faq.md`
- Security notes: `docs/security.md`
- Throne deep dive: `docs/throne.md`
- Distributions deep dive: `docs/distributions.md`

## Build

```
make build
make test
```

## Pinned versions

- `anchor = "0.30.1"`
- `solana-program = "=1.18.26"`
- Rust edition: `2021`
- TypeScript target: `ES2020`, module `commonjs`, `strict: true`

## Repository

`https://github.com/Kolzoo/kolz-protocol`

## License

MIT. See `LICENSE`.
