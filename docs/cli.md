# KOLZ CLI

`kolz` is the Rust command line tool for operating a KOLZ deployment. The binary wraps the same RPC surface as the TypeScript SDK and is intended for oracle operators, admins, and on-call engineers. The crate name is `kolz`, the binary name is `kolz`, and it builds with `rust edition = "2021"`.

## Install

```bash
cargo install --path crates/cli
```

The CLI reads `~/.config/solana/cli/config.yml` for the default RPC URL and keypair, mirroring `solana` CLI conventions.

## Global flags

```text
--rpc-url <URL>          Override RPC endpoint
--keypair <PATH>         Override signer keypair path
--program-id <PUBKEY>    KOLZ program id, defaults to env KOLZ_PROGRAM_ID
--commitment <LEVEL>     processed | confirmed | finalized, default confirmed
--json                   Emit machine readable JSON output
```

## Subcommands

### config init

Initialize the protocol Config PDA.

```bash
kolz config init \
  --oracle-authority 11111111111111111111111111111111 \
  --fee-basis-points 250
```

Output:

```text
Config initialized
  pda:    <config_pda>
  admin:  <admin_pubkey>
  oracle: <oracle_pubkey>
  fee:    250 bps
  tx:     <signature>
```

### config show

Read the current Config PDA.

```bash
kolz config show
```

### launch bind

Run `oracle_bind_pumpfun_launch`. Must be invoked with the oracle keypair.

```bash
kolz launch bind \
  --kol-owner <kol_pubkey> \
  --pump-mint <mint_pubkey> \
  --kol-name "vitalik"
```

### nft mint

Run `mint_kol_nft`.

```bash
kolz nft mint \
  --pet <pet_pda> \
  --name "KOLZ Vitalik" \
  --symbol "VITA" \
  --uri "https://kolz-api.fly.dev/metadata/vitalik.json"
```

### throne take

Call `take_throne` as the current signer.

```bash
kolz throne take \
  --pet <pet_pda> \
  --pump-mint <mint_pubkey>
```

The CLI fetches the current `KingOfHill` row, computes the previous champion ATA if needed, and includes it automatically. Use `--prev-champion-ata` to override.

### throne settle

Call `settle_throne`. Oracle-only.

```bash
kolz throne settle --pet <pet_pda>
```

### throne show

Read the current `KingOfHill` PDA.

```bash
kolz throne show --pet <pet_pda>
```

Output includes `current_champion`, `champion_balance`, `take_overs`, `settles_at_slot`, `settled`, and the computed time remaining at the configured slot duration.

### distribution commit

Publish a merkle root for an epoch.

```bash
kolz distribution commit \
  --epoch 42 \
  --root-file ./epoch_42_root.bin \
  --pool-lamports 1000000000
```

`--root-file` is a 32-byte binary file. Use `--root-hex` for a hex string instead.

### distribution show

```bash
kolz distribution show --epoch 42
```

### claim build

Build a holder claim proof from a saved tree.

```bash
kolz claim build \
  --tree-file ./epoch_42_tree.json \
  --holder <holder_pubkey>
```

Output is a JSON object with `epoch`, `amount`, and `proof` (array of hex strings) suitable for `kolz claim submit`.

### claim submit

Submit a built claim.

```bash
kolz claim submit \
  --epoch 42 \
  --amount 12500000 \
  --proof-file ./holder_proof.json
```

### vault show

Inspect the `fee_vault` PDA balance.

```bash
kolz vault show
```

### vault fund

Top up the `fee_vault` PDA from the signer's wallet.

```bash
kolz vault fund --lamports 1000000000
```

This is a plain `system_program::transfer` to the `["fee_vault"]` PDA. It does not require admin or oracle authority.

## Examples

Bind a launch and mint the NFT in one shell session:

```bash
export KOLZ_PROGRAM_ID=11111111111111111111111111111111

kolz launch bind \
  --kol-owner $(solana-keygen pubkey kol.json) \
  --pump-mint $(cat ./pump_mint.txt) \
  --kol-name "vitalik"

PET=$(kolz launch show --kol-owner $(solana-keygen pubkey kol.json) --kol-name "vitalik" --json | jq -r .pet)

kolz nft mint \
  --pet $PET \
  --name "KOLZ Vitalik" \
  --symbol "VITA" \
  --uri "https://kolz-api.fly.dev/metadata/vitalik.json"
```

## JSON mode

Every subcommand supports `--json`. Output schema is stable per major version. Example:

```bash
kolz throne show --pet <pet_pda> --json
```

```json
{
  "pet": "<pet_pda>",
  "nft_mint": "<mint>",
  "current_champion": "<pubkey>",
  "champion_balance": "1234567890",
  "take_overs": 7,
  "last_captured_slot": "248123456",
  "settles_at_slot": "249635456",
  "settled": false
}
```

## Cross references

- SDK that this CLI wraps: [client.md](./client.md)
- Deployment flow: [deployment.md](./deployment.md)
- Throne mechanics: [throne.md](./throne.md)
