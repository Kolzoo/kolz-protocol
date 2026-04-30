# KOLZ FAQ

Common questions about the KOLZ protocol, organized by audience.

## For holders

### How do I capture the throne?

Buy enough of the KOL's pump.fun memecoin to hold strictly more than the current `champion_balance` shown on the launch page, then call `take_throne`. The TypeScript SDK exposes `client.takeThrone(...)`; the Rust CLI exposes `kolz throne take`. See [throne.md](./throne.md).

### What happens if I sell after capturing?

Nothing immediate. The NFT stays in your wallet. Your historical `champion_balance` remains the bar for any subsequent challenger. If the throne settles while you still hold the NFT, you keep it forever.

### How long does the throne game last?

About 7 days from the first capture. The exact deadline is `first_capture_slot + 1_512_000` and is stored on chain as `KingOfHill.settles_at_slot`.

### How do I claim my fee distribution?

The oracle publishes per-epoch allocations at `https://kolz-api.fly.dev`. Fetch your proof, then call `claim_holder_fees`. The SDK exposes `client.claimHolderFees(...)`; the CLI exposes `kolz claim build` and `kolz claim submit`. See [distributions.md](./distributions.md).

### Can I claim more than once per epoch?

No. The `HolderClaim` PDA is keyed by `(holder, epoch)` and `init` blocks duplicate creation. The on-chain error is `AlreadyClaimed`.

### What if the fee_vault is empty?

`claim_holder_fees` fails with `InsufficientVault`. Retry after the vault is funded. Vault funding is permissionless via `kolz vault fund`, so a KOL or community member can top it up.

## For KOLs

### How do I get a launch bound?

Launches are bound by the oracle, not by the KOL directly. The KOL or an integrator submits the mint to the KOLZ public API. The oracle verifies the launch is real and calls `oracle_bind_pumpfun_launch`.

### Do I have to give up creator fees?

Only the holder share, configured at protocol level via `Config.fee_basis_points`. The remainder goes to the KOL. See the formula in [pumpfun.md](./pumpfun.md).

### Can I block the throne game on my launch?

No. Once `oracle_bind_pumpfun_launch` runs, the `Launch` PDA exists and `take_throne` can be called by anyone holding the memecoin.

## For operators

### What does the oracle key need permission to do?

Call `oracle_bind_pumpfun_launch`, `mint_kol_nft`, `settle_throne`, and `commit_distribution_root`. It does NOT have authority to drain the fee vault, mint additional NFTs, or modify holder claims.

### How do I rotate the oracle key?

Reissue `init_config` with the new oracle pubkey, signed by the admin key. The `Config` PDA is updated in place.

### What if the oracle goes offline?

Throne captures still work because `take_throne` is permissionless. Settlement and new distributions pause until the oracle comes back. Existing distributions remain claimable.

### How do I monitor the protocol?

Subscribe to Solana program logs for the program id. The Rust CLI emits structured JSON via `--json` for piping into observability stacks.

## For integrators

### Is there a public RPC?

No. KOLZ runs on the standard Solana RPC. Use any production-grade Solana RPC provider with `KOLZ_RPC_URL`.

### Where is the IDL?

Generated at `target/idl/kolz.json` after `anchor build`. The same IDL is bundled in `@kolz/sdk`.

### Can I use a custom merkle library?

Yes, as long as it matches the on-chain verifier byte for byte:

- `keccak256`, not `sha256`.
- Leaf encoding: `holder_bytes (32) || epoch_u64_le (8) || amount_u64_le (8)`.
- Sorted-pair concatenation at each level.

See [distributions.md](./distributions.md) for the reference implementation.

### Does KOLZ support non-pump.fun launches?

Not in v1. The bonding curve observation logic is pump.fun specific.

## For security researchers

### Is there a bug bounty?

Coordination details are in the repository at `https://github.com/Kolzoo/kolz-protocol`. See SECURITY.md in the repo root for disclosure process.

### What is in scope?

The on-chain program, the SDK, and the CLI. The oracle service operational keys are out of scope for protocol-level disclosure but in scope for operational disclosure.

### How is the merkle verifier hardened?

Sorted-pair hashing prevents the "second preimage via swap" attack. The leaf format includes the epoch, so a proof from epoch N cannot be replayed at epoch M.

## See also

- [architecture.md](./architecture.md)
- [security.md](./security.md)
- [glossary.md](./glossary.md)
