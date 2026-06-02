<p align="center">
  <img src="https://img.shields.io/badge/COLS-examples-00ff41?style=flat-square" alt="COLS examples" />
  <img src="https://img.shields.io/badge/solana-1.18.26-9945FF?style=flat-square" alt="solana 1.18.26" />
  <img src="https://img.shields.io/badge/anchor-0.30.1-blue?style=flat-square" alt="anchor 0.30.1" />
  <img src="https://img.shields.io/badge/typescript-ES2020-3178c6?style=flat-square" alt="typescript ES2020" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square" alt="MIT" />
</p>

# COLS Examples

Runnable, single-file TypeScript scripts that exercise every instruction in the COLS on-chain program end to end. Each example is a standalone entry point that you can run with `ts-node` against a real Solana cluster (devnet by default). Every script imports the SDK from `../sdk/src` so the examples stay in lockstep with the source as it evolves.

COLS is an Anchor program that bonds a KOL identity to a pump.fun launch, mints a 1/1 King of the Hill NFT, lets the largest memecoin holder seize the throne, and distributes pooled fees to holders via keccak256 merkle proofs. The on-chain spec, account layouts, and error codes are documented inline in each example.

Protocol home: https://github.com/Colszoo/cols-protocol
Oracle and snapshot API: https://cols-api.fly.dev

## Layout

```
examples/
  README.md
  01_init_config.ts           creates the global Config PDA
  02_bind_kol.ts              binds a kol_name + pump_mint to Pet and Launch PDAs
  03_mint_nft.ts              mints the 1/1 crown NFT into the escrow vault
  04_take_throne.ts           Alice captures, then Bob seizes
  05_settle_throne.ts         oracle settles after the slot deadline
  06_commit_distribution.ts   builds a 5-holder merkle tree, commits the root
  07_claim_fees.ts            holder claims using a written proof bundle
  lib/
    env.ts                    shared connection, wallet, and program loader
  data/
    holder_snapshot.sample.json   input snapshot used by example 06
    distribution.sample.json      proof bundle produced by 06, consumed by 07
```

## Prerequisites

1. Node.js 18 or newer.
2. A built copy of the COLS TypeScript SDK at `sdk/src/`. Examples import from that path directly, so no install step is needed.
3. A Solana keypair JSON file (the standard 64-byte array format produced by `solana-keygen new -o wallet.json`).
4. An RPC endpoint. Devnet is fine for the full walk-through.

## Configuration

Examples read configuration from environment variables. A colocated `.env` file at the project root is loaded automatically when present. The variables used across all scripts:

| Variable | Required | Description |
| --- | --- | --- |
| COLS_RPC_URL | no | JSON RPC URL. Defaults to https://api.devnet.solana.com. |
| COLS_WS_URL | no | Optional websocket endpoint. |
| COLS_WALLET_PATH | yes | Path to the signer keypair JSON. |
| COLS_ORACLE_PATH | no | Path to the oracle authority keypair. Falls back to COLS_WALLET_PATH. |
| COLS_PROGRAM_ID | no | Deployed program id. Defaults to the SDK constant. |
| COLS_COMMITMENT | no | `processed`, `confirmed`, or `finalized`. Default `confirmed`. |
| COLS_API_BASE | no | Off-chain oracle service base URL. |
| COLS_KOL_NAME | no | Identifier passed into the Pet PDA seed. |
| COLS_KOL_OWNER | no | Base58 pubkey of the KOL owner. |
| COLS_PUMP_MINT | no | Base58 pubkey of the pump.fun mint to bond. |
| COLS_FEE_BPS | no | Protocol fee basis points used during init. |

## Running

Each script is invoked the same way:

```
ts-node examples/01_init_config.ts
ts-node examples/02_bind_kol.ts
ts-node examples/03_mint_nft.ts
ts-node examples/04_take_throne.ts
ts-node examples/05_settle_throne.ts
ts-node examples/06_commit_distribution.ts
ts-node examples/07_claim_fees.ts
```

Scripts are idempotent where it makes sense: if the target PDA already exists, the script reads its state, prints a recap, and exits successfully. This makes the sequence safe to rerun while iterating.

## Walk-through

### 01_init_config

Creates the Config PDA at seeds `["config"]`. The transaction signer becomes the protocol admin. The oracle pubkey written into the Config is the only key authorized to submit oracle-gated instructions (`oracle_bind_pumpfun_launch`, `mint_kol_nft`, `settle_throne`, `commit_distribution_root`). Fee basis points are captured here and surface in fee accounting downstream.

### 02_bind_kol

The oracle bonds a KOL identity to a pump.fun launch. Two PDAs are created:

- `Pet` at seeds `["pet", kol_owner, kol_name]`
- `Launch` at seeds `["launch", pet]`

`kol_name` is encoded as a fixed 32-byte buffer (right-padded with zero bytes). The on-chain `Launch` state tracks the bonded slot, the pump.fun real reserves, accumulated creator fees, and a `graduated` flag.

### 03_mint_nft

The oracle mints the 1/1 King of the Hill NFT into an escrow ATA owned by the KingOfHill PDA at seeds `["king", pet]`. A Metaplex Token Metadata V3 account is attached with the supplied name, symbol, and URI. The state account stores the mint, the escrow vault, the current champion (initialized to the System Program), and the takeover counter.

### 04_take_throne

Walks the capture protocol with two challengers, Alice and Bob.

1. Alice signs the first capture. The escrow vault transfers the NFT into Alice's ATA. Alice delegates her ATA to the king PDA so a future challenger can pull it out. `settles_at_slot` is set to `current_slot + 1_512_000` (roughly seven days at 0.4 seconds per slot).
2. Bob holds more of the memecoin than Alice. Bob signs his own `take_throne` and passes Alice's ATA as `previous_champion_ata`. The king PDA uses its delegated authority to pull the NFT from Alice's ATA into Bob's ATA. Bob then delegates his own ATA to the king PDA so the cycle continues.

The example reverts with `NotTopHolder` if a challenger's balance is not strictly greater than the recorded `champion_balance`, and with `SettlementPeriodEnded` if the throne has already been settled.

### 05_settle_throne

After the deadline slot has been reached, the oracle calls `settle_throne` to revoke the king PDA delegate from the current champion's ATA and to flip `settled = true`. Subsequent `take_throne` calls revert with `SettlementPeriodEnded`. The script refuses to send the instruction if the current slot is still behind the deadline, surfacing `SettlementNotReady` with a human-readable countdown.

### 06_commit_distribution

Reads `data/holder_snapshot.sample.json`, builds a keccak256 merkle tree, and commits the root and pool size on chain at seeds `["distribution", epoch_u64_le]`. Leaf layout matches the on-chain verifier:

```
leaf = keccak256( holder_pubkey_32 || epoch_u64_le || amount_u64_le )
```

Internal nodes use the sorted-pair scheme:

```
parent = keccak256( min(left, right) || max(left, right) )
```

After the transaction confirms, the script writes a proof bundle to `data/distribution.sample.json` containing per-leaf proofs, ready for consumption by example 07.

### 07_claim_fees

A holder presents a merkle proof against the committed root and receives their share of the fee vault PDA at seeds `["fee_vault"]`. The script:

1. Reconstructs the leaf hash locally.
2. Verifies the proof against the on-chain root before broadcasting.
3. Refuses to send if the vault balance is below the requested amount.
4. Refuses to send if the holder embedded in the leaf is not the loaded wallet.

Errors surfaced by the program:

| Error | Meaning |
| --- | --- |
| AlreadyClaimed | HolderClaim PDA already initialized for this epoch. |
| InvalidProof | merkle verification failed against the committed root. |
| EpochNotCommitted | Distribution PDA for this epoch does not exist. |
| InsufficientVault | fee_vault balance is less than the requested amount. |
| InvalidAmount | amount overflows or is zero. |

## State accounts

| Account | Seeds | Approx size |
| --- | --- | --- |
| Config | `["config"]` | 80 B |
| Pet | `["pet", kol_owner, kol_name]` | 80 B |
| Launch | `["launch", pet]` | 120 B |
| KingOfHill | `["king", pet]` | 160 B |
| Distribution | `["distribution", epoch_u64_le]` | 80 B |
| HolderClaim | `["holder_claim", holder, epoch_u64_le]` | 80 B |
| fee_vault | `["fee_vault"]` | system-owned lamports vault |

## Notes

- All examples assume devnet by default. Set `COLS_RPC_URL` to point elsewhere.
- The sample JSON files in `data/` use the System Program (`11111111111111111111111111111111`) and standard sysvar addresses so that they remain valid base58 strings without referencing third-party wallets.
- The `take_throne` example generates fresh keypairs for Alice and Bob when explicit secrets are not provided. For repeatable runs, set `COLS_ALICE_SECRET` and `COLS_BOB_SECRET` to JSON byte arrays.
