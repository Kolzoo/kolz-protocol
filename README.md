# KOLZ

Solana protocol that binds KOL identities to pump.fun launches, mints 1/1
king-of-the-hill NFTs, runs a fixed 7-day throne, and distributes trade fees to
token holders against an on-chain merkle root.

This repository hosts:

- `programs/kolz`: the Anchor on-chain program.
- `sdk`: TypeScript SDK wrapping every instruction.
- `cli`: Rust CLI built on top of the SDK semantics.
- `examples`: end-to-end TypeScript scripts.
- `docs`: architecture, instruction reference, deployment guide.

## Status

Pre-release. Pinned to `anchor = "0.30.1"` and `solana-program = "=1.18.26"`.

## License

MIT. See `LICENSE`.
