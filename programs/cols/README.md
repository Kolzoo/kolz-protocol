# `cols` program

Anchor 0.30.1 on-chain program for COLS. Compiled with solana-program 1.18.26.

## Instructions

| Instruction | Signer | Description |
| --- | --- | --- |
| `init_config(oracle_authority, fee_basis_points)` | admin | Creates the `Config` PDA at seeds `["config"]`. Sets the oracle pubkey and fee basis points used by every distribution. |
| `oracle_bind_pumpfun_launch(kol_name)` | oracle | Binds an external pump.fun mint to a `(kol_owner, kol_name)` tuple. Creates `Pet` and `Launch` PDAs if absent. |
| `mint_kol_nft(name, symbol, uri)` | oracle | Mints the 1/1 SPL token to an escrow ATA owned by the `KingOfHill` PDA and writes Metaplex Token Metadata V3. |
| `take_throne()` | challenger | Verifies the challenger holds the most of the memecoin, seizes the NFT from the previous champion's ATA into the challenger's ATA, and grants the king PDA delegate authority. Sets `settles_at_slot` on first capture. |
| `settle_throne()` | oracle | Once `current_slot >= settles_at_slot`, marks the throne `settled` and revokes the king PDA's delegate so the NFT is permanently held by the final champion. |
| `commit_distribution_root(epoch, root, pool_lamports)` | oracle | Creates a `Distribution` PDA at seeds `["distribution", epoch_le]`, storing the keccak merkle root and the lamport pool. |
| `claim_holder_fees(epoch, amount, proof)` | holder | Verifies a keccak-256 merkle proof against the committed root and transfers `amount` lamports from the `fee_vault` PDA to the holder. Creates a `HolderClaim` PDA so the same epoch cannot be double-claimed. |

## Accounts

| Account | Seeds | Bytes (excl. discriminator) | Notes |
| --- | --- | --- | --- |
| `Config` | `["config"]` | 96 | admin, oracle, fee_basis_points, bump |
| `Pet` | `["pet", kol_owner, kol_name]` | 80 | owner, kol_name[32], bonded_at, bump |
| `Launch` | `["launch", pet]` | 120 | pet, pump_mint, bonded_slot, reserves, creator_fees, total_volume, graduated, bump |
| `KingOfHill` | `["king", pet]` | 160 | pet, nft_mint, nft_escrow_vault, current_champion, champion_balance, last_captured_slot, take_overs, bump, nft_escrow_vault_bump, settles_at_slot, settled |
| `Distribution` | `["distribution", epoch_le]` | 80 | epoch, root[32], pool_lamports, committed_at, bump |
| `HolderClaim` | `["holder_claim", holder, epoch_le]` | 80 | holder, epoch, amount_claimed, claimed_at_slot, bump |
| `FeeVault` | `["fee_vault"]` | 0 | system-owned PDA holding lamports |

## Errors

`Unauthorized`, `OracleMismatch`, `AdminMismatch`, `NotTopHolder`,
`SettlementPeriodEnded`, `AlreadySettled`, `SettlementNotReady`,
`MissingPrevChampionAta`, `MissingMetadataProgram`, `AlreadyClaimed`,
`InvalidProof`, `EpochNotCommitted`, `InsufficientVault`, `InvalidAmount`,
`NameTooLong`, `UriTooLong`, `SymbolTooLong`, `BondingCurveNotInitialized`.

## Build

```bash
# from the repo root
anchor build
# or just check
cargo check -p cols
```

The hand-rolled IDL JSON lives at `programs/cols/idl/cols.json` and is committed
so consumers do not need to build the program to integrate.

## Pinned versions

`anchor-lang = "0.30.1"`, `solana-program = "=1.18.26"`, `mpl-token-metadata = "4.1"`.
