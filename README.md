# KOLZ

<img src="https://img.shields.io/badge/anchor-0.30.1-blue" alt="anchor version">
<img src="https://img.shields.io/badge/solana-1.18.26-purple" alt="solana version">
<img src="https://img.shields.io/badge/license-MIT-green" alt="license">

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

## Quick links

- Architecture: `docs/architecture.md`
- Instruction reference: `docs/instructions.md`
- SDK guide: `docs/client.md`
- CLI guide: `docs/cli.md`
- Deployment: `docs/deployment.md`

## Pinned versions

- `anchor = "0.30.1"`
- `solana-program = "=1.18.26"`
- Rust edition: `2021`
- TypeScript target: `ES2020`, module `commonjs`, `strict: true`

## License

MIT. See `LICENSE`.
