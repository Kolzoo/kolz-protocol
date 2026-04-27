# KOLZ CLI

<p>
  <img src="https://img.shields.io/badge/rust-2021-orange" alt="rust edition" />
  <img src="https://img.shields.io/badge/anchor-0.30.1-blue" alt="anchor version" />
  <img src="https://img.shields.io/badge/solana-1.18.26-purple" alt="solana version" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license" />
</p>

`kolz` is the official command line client for the KOLZ on-chain program. It
wraps every instruction defined in the Anchor IDL and provides helpers for
local state inspection, vanity mint grinding, and oracle automation.

The binary targets Solana mainnet, devnet, and any local validator that
exposes a standard JSON RPC endpoint. The on-chain program is the `kolz`
Anchor crate published at
[github.com/Kolzoo/kolz-protocol](https://github.com/Kolzoo/kolz-protocol).
Oracle services are operated through the public API at
[kolz-api.fly.dev](https://kolz-api.fly.dev).

## Install

```
cargo install --path .
```

This places a single binary named `kolz` on your `PATH`.

## Configuration

Every subcommand accepts the following global flags:

| Flag | Description |
| ---- | ----------- |
| `--rpc <URL>` | Solana JSON RPC endpoint. Defaults to `https://api.mainnet-beta.solana.com`. |
| `--keypair <PATH>` | Path to a JSON keypair file used as the fee payer and primary signer. Defaults to `~/.config/solana/id.json`. |
| `--program-id <PUBKEY>` | Override the on-chain program id. Defaults to the published mainnet id. |
| `--commitment <LEVEL>` | One of `processed`, `confirmed`, `finalized`. Defaults to `confirmed`. |
| `--json` | Emit machine readable JSON instead of the human friendly table. |

## Subcommands

### init

Initialize the global `Config` PDA. Must be signed by the future admin.

```
kolz init --oracle <PUBKEY> --fee-bps 100
```

### bind

Bind a pump.fun launch to a KOL pet. The signer must be the oracle authority
declared during `init`.

```
kolz bind --kol-owner <PUBKEY> --pump-mint <PUBKEY> --kol-name "satoshi"
```

### mint-nft

Mint the 1 of 1 King of the Hill NFT for a bound pet. Signed by the oracle.

```
kolz mint-nft \
  --kol-owner <PUBKEY> \
  --kol-name "satoshi" \
  --name "Satoshi Throne" \
  --symbol "KOH" \
  --uri "https://example.org/metadata.json"
```

### take-throne

Attempt to capture the throne. The signer must currently hold more of the
bound memecoin than the previous champion.

```
kolz take-throne --kol-owner <PUBKEY> --kol-name "satoshi"
```

### settle

Close the throne after the seven day settlement window. Signed by the oracle.

```
kolz settle --kol-owner <PUBKEY> --kol-name "satoshi"
```

### commit-root

Publish the holder distribution merkle root for an epoch.

```
kolz commit-root --epoch 42 --root <HEX> --pool-lamports 1000000000
```

### claim

Claim holder fees against a committed distribution.

```
kolz claim --epoch 42 --amount 1000000 --proof <COMMA_SEPARATED_HEX>
```

### inspect

Read and decode state accounts.

```
kolz inspect pet --kol-owner <PUBKEY> --kol-name "satoshi"
kolz inspect launch --pet <PUBKEY>
kolz inspect king --pet <PUBKEY>
kolz inspect distribution --epoch 42
```

### grind

Grind a vanity mint keypair whose public key ends with the suffix `pump`,
matching the pump.fun convention. The result is written to disk as a Solana
keypair JSON file.

```
kolz grind --output ./pump-mint.json --threads 8
```

## Architecture

```
src/
  main.rs            entry point, clap derived dispatch
  rpc.rs             RPC client construction, keypair loading
  pdas.rs            program derived address helpers
  discriminator.rs   anchor instruction discriminator helpers
  borsh_codec.rs     hand rolled decoders for on-chain state
  output.rs          table and JSON output formatters
  error.rs           CliError type
  cmd/               one module per subcommand
```

Each subcommand builds an unsigned transaction through `solana-sdk`, signs
it with the loaded keypair, broadcasts it through `solana-client`, and waits
for the requested commitment level before printing the resulting signature
or decoded account state.

## Versioning

This CLI is pinned to `anchor-lang = 0.30.1` and `solana-sdk = 1.18.26` to
match the on-chain program. Bumping either crate in isolation will likely
break instruction discriminators or account layouts.

## License

MIT. See the LICENSE file at the repository root.
