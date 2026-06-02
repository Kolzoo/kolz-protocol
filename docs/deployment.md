# COLS Deployment

This document covers building, deploying, and configuring the `cols` program across localnet, devnet, and mainnet. Versions are pinned to `anchor = "0.30.1"` and `solana-program = "=1.18.26"`.

## Prerequisites

| Tool          | Version                |
| ------------- | ---------------------- |
| Rust          | 1.79 or newer, edition 2021 |
| Solana CLI    | 1.18.26                |
| Anchor        | 0.30.1                 |
| Node.js       | 20.x                   |
| pnpm or npm   | latest                 |

On Windows, install Visual Studio Build Tools with the Desktop C++ workload and LLVM. Add the project `target/` directory to Windows Defender exclusions for faster compile times.

## Build

```bash
anchor build
```

The compiled program lives at `target/deploy/cols.so` and the program keypair at `target/deploy/cols-keypair.json`. Anchor writes the IDL to `target/idl/cols.json`.

## Localnet

Start a local validator and deploy.

```bash
solana-test-validator --reset \
  --bpf-program 11111111111111111111111111111111 target/deploy/cols.so \
  --quiet &

solana config set --url http://127.0.0.1:8899
anchor deploy
```

Run the integration suite.

```bash
anchor test --skip-local-validator
```

## Devnet

The program is live on devnet.

| Field | Value |
| --- | --- |
| Program ID | `9bjyD3Vs6YBUUX5P6Tg2S4JZorbCiC4ZJjpzyQUeDvgJ` |
| Cluster | `https://api.devnet.solana.com` |
| Loader | `BPFLoaderUpgradeab1e11111111111111111111111` |
| Explorer | [solana explorer (devnet)](https://explorer.solana.com/address/9bjyD3Vs6YBUUX5P6Tg2S4JZorbCiC4ZJjpzyQUeDvgJ?cluster=devnet) |
| Status | end-to-end test suite passing |

Set the program id in your shell profile or the deployment `.env`:

```bash
export COLS_PROGRAM_ID=9bjyD3Vs6YBUUX5P6Tg2S4JZorbCiC4ZJjpzyQUeDvgJ
```

To redeploy or update the buffer:

```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 5
anchor deploy --provider.cluster devnet --program-id 9bjyD3Vs6YBUUX5P6Tg2S4JZorbCiC4ZJjpzyQUeDvgJ
```

After deploy, initialize the protocol:

```bash
cols config init \
  --oracle-authority <oracle_pubkey> \
  --fee-basis-points 250
```

## Mainnet

Mainnet deploy uses a multisig-controlled buffer. The recommended flow:

1. Build with `anchor build`, verify SHA-256 of `target/deploy/cols.so` against the release artifact in `https://github.com/Colszoo/cols-protocol`.
2. Write the buffer:

   ```bash
   solana program write-buffer target/deploy/cols.so \
     --buffer-authority <multisig_pubkey>
   ```

3. Submit a multisig transaction to upgrade the program from the buffer.
4. Run `cols config init` from the admin multisig.

Production RPC selection matters. Use a paid RPC with `processed`/`confirmed` separation, not the public mainnet endpoint.

## Account rent math

Solana rent-exempt minimums are computed as `lamports = bytes * lamports_per_byte_year * 2 years`. With current rent constants, the rent-exempt floor is approximately `0.00000348 SOL per byte`. The COLS accounts size out to:

| Account       | Bytes | Rent SOL  |
| ------------- | ----- | --------- |
| Config        | 80    | 0.0002784 |
| Pet           | 80    | 0.0002784 |
| Launch        | 120   | 0.0004176 |
| KingOfHill    | 160   | 0.0005568 |
| Distribution  | 80    | 0.0002784 |
| HolderClaim   | 80    | 0.0002784 |
| fee_vault     | 8     | 0.0000279 |

Per launch onboarding (Pet + Launch + KingOfHill + escrow ATA + NFT mint + metadata) consumes roughly 0.012 SOL of rent. Per distribution epoch adds 0.0003 SOL. Per holder claim adds 0.0003 SOL paid by the holder.

The protocol fee in basis points is stored on `Config.fee_basis_points` and is used by the off-chain distribution builder to compute holder allocations. The on-chain claim path does not apply fees, only validates the proof and transfers the merkle-leaf amount.

## Environment variables

The CLI, SDK, and oracle service all respect the following:

| Variable          | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `COLS_PROGRAM_ID` | Deployed program id                            |
| `COLS_RPC_URL`    | Solana RPC endpoint                            |
| `COLS_ORACLE_KEY` | Path to oracle keypair                         |
| `COLS_ADMIN_KEY`  | Path to admin keypair                          |
| `COLS_API_URL`    | Public API root, defaults to `https://cols-api.fly.dev` |

## Upgrade and rotation

- Program upgrade: requires the upgrade authority. For mainnet, this is the multisig.
- Oracle key rotation: requires admin authority. Reissue `init_config` with the new oracle pubkey. The Config PDA is updated in place via Anchor's `mut` constraint when the admin is the signer.

An optional hardening step is to make the program immutable by closing the upgrade authority. That is a one-way operation. Do not perform it until the protocol has been audited and the merkle distribution path is observed live for at least one full epoch cycle.

## Verifying a deployment

```bash
solana program show <COLS_PROGRAM_ID>
cols config show
```

The `cols config show` output must list a non-zero `oracle` pubkey and a non-zero `fee_basis_points`. If either is zero, the protocol has not been initialized and instructions will fail with `OracleMismatch` or related errors.

## See also

- [architecture.md](./architecture.md) for component layout.
- [security.md](./security.md) for upgrade and rotation risks.
- [cli.md](./cli.md) for operator commands.
