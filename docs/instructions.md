# KOLZ Instruction Reference

This document specifies every instruction in the `kolz` Anchor program: required accounts, arguments, errors, and runtime behavior. The program is pinned to `anchor = "0.30.1"` and `solana-program = "=1.18.26"`.

## Conventions

- Account roles use Anchor terminology: `mut` (writable), `signer`, `init` (allocated and rent paid in this instruction), `init_if_needed` (allocated only when missing).
- PDA seeds are shown as Rust byte slice literals.
- All errors come from a single `#[error_code]` enum. See the table at the end.

## 1. init_config

Initialize the protocol configuration. Called once per deployment by the admin.

### Arguments

| Name                | Type   | Notes                                |
| ------------------- | ------ | ------------------------------------ |
| `oracle_authority`  | Pubkey | Off chain oracle signer              |
| `fee_basis_points`  | u32    | Protocol fee in basis points (1/100) |

### Accounts

| Name              | Role                                  | Seeds         |
| ----------------- | ------------------------------------- | ------------- |
| `config`          | `init`, `mut`, payer = admin          | `["config"]`  |
| `admin`           | `signer`, `mut`                       |               |
| `system_program`  | program                               |               |

### Behavior

```rust
pub fn init_config(
    ctx: Context<InitConfig>,
    oracle_authority: Pubkey,
    fee_basis_points: u32,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.oracle = oracle_authority;
    config.fee_basis_points = fee_basis_points;
    config.bump = ctx.bumps.config;
    Ok(())
}
```

### Errors

None at execution time. Anchor enforces seed and rent constraints.

## 2. oracle_bind_pumpfun_launch

Bind a KOL identity to a pump.fun mint. Creates the `Pet` and `Launch` PDAs if missing.

### Arguments

| Name        | Type     | Notes                                       |
| ----------- | -------- | ------------------------------------------- |
| `kol_name`  | [u8; 32] | UTF-8 padded right with zero bytes          |

### Accounts

| Name           | Role                                | Seeds                                |
| -------------- | ----------------------------------- | ------------------------------------ |
| `config`       | read                                | `["config"]`                         |
| `oracle`       | `signer`                            |                                      |
| `kol_owner`    | read                                |                                      |
| `pump_mint`    | read                                |                                      |
| `pet`          | `init_if_needed`, `mut`             | `["pet", kol_owner, kol_name]`       |
| `launch`       | `init_if_needed`, `mut`             | `["launch", pet]`                    |
| `payer`        | `signer`, `mut`                     |                                      |
| `system_program` | program                           |                                      |

### Behavior

The instruction verifies `oracle.key() == config.oracle`, then writes:

```rust
pet.owner = ctx.accounts.kol_owner.key();
pet.kol_name = kol_name;
pet.bonded_at = Clock::get()?.slot;
pet.bump = ctx.bumps.pet;

launch.pet = pet.key();
launch.pump_mint = ctx.accounts.pump_mint.key();
launch.bonded_slot = Clock::get()?.slot;
launch.real_sol_reserve = 0;
launch.real_token_reserve = 0;
launch.creator_fees_lamports = 0;
launch.total_volume_lamports = 0;
launch.graduated = false;
launch.bump = ctx.bumps.launch;
```

### Errors

- `OracleMismatch` if the signer is not the configured oracle.
- `NameTooLong` if the trimmed `kol_name` exceeds 32 bytes (cannot happen due to fixed-size argument, kept for defensive validation upstream).

## 3. mint_kol_nft

Mint the 1/1 KOL NFT and create the `KingOfHill` PDA.

### Arguments

| Name     | Type   | Constraint           |
| -------- | ------ | -------------------- |
| `name`   | String | max 32 chars         |
| `symbol` | String | max 10 chars         |
| `uri`    | String | max 200 chars        |

### Accounts

| Name                       | Role                            | Seeds                                  |
| -------------------------- | ------------------------------- | -------------------------------------- |
| `config`                   | read                            | `["config"]`                           |
| `oracle`                   | `signer`                        |                                        |
| `pet`                      | read                            | `["pet", kol_owner, kol_name]`         |
| `king`                     | `init`, `mut`                   | `["king", pet]`                        |
| `nft_mint`                 | `init`, `mut`, mint authority   |                                        |
| `nft_escrow_vault`         | `init`, ATA(king, nft_mint)     |                                        |
| `metadata`                 | `mut`                           | Metaplex Token Metadata PDA            |
| `token_metadata_program`   | program                         |                                        |
| `payer`                    | `signer`, `mut`                 |                                        |
| `token_program`            | program                         |                                        |
| `associated_token_program` | program                         |                                        |
| `system_program`           | program                         |                                        |
| `rent`                     | sysvar                          |                                        |

### Behavior

```rust
require_keys_eq!(ctx.accounts.oracle.key(), ctx.accounts.config.oracle, KolzError::OracleMismatch);
require!(name.len() <= 32, KolzError::NameTooLong);
require!(symbol.len() <= 10, KolzError::SymbolTooLong);
require!(uri.len() <= 200, KolzError::UriTooLong);

let king = &mut ctx.accounts.king;
king.pet = ctx.accounts.pet.key();
king.nft_mint = ctx.accounts.nft_mint.key();
king.nft_escrow_vault = ctx.accounts.nft_escrow_vault.key();
king.current_champion = solana_program::system_program::ID;
king.champion_balance = 0;
king.last_captured_slot = 0;
king.take_overs = 0;
king.settles_at_slot = 0;
king.settled = false;
king.bump = ctx.bumps.king;
king.nft_escrow_vault_bump = ctx.bumps.nft_escrow_vault;

// Mint 1 token to escrow vault.
mint_to(/* king PDA as authority */, 1)?;

// Attach Metaplex metadata V3 with name/symbol/uri.
create_metadata_accounts_v3(/* ... */)?;
```

### Errors

`OracleMismatch`, `NameTooLong`, `SymbolTooLong`, `UriTooLong`, `MissingMetadataProgram`.

## 4. take_throne

Capture the throne by holding strictly more of the pump.fun mint than the current champion.

### Arguments

None.

### Accounts

| Name                   | Role                       | Seeds                          |
| ---------------------- | -------------------------- | ------------------------------ |
| `config`               | read                       | `["config"]`                   |
| `launch`               | read                       | `["launch", pet]`              |
| `king`                 | `mut`                      | `["king", pet]`                |
| `pet`                  | read                       | `["pet", kol_owner, kol_name]` |
| `nft_mint`             | read                       |                                |
| `pump_mint`            | read                       | must equal `launch.pump_mint`  |
| `nft_escrow_vault`     | `mut`, ATA(king, nft_mint) |                                |
| `challenger`           | `signer`, `mut`            |                                |
| `challenger_nft_ata`   | `mut`, ATA(challenger, nft_mint) |                          |
| `challenger_pump_ata`  | read, ATA(challenger, pump_mint) |                          |
| `prev_champion_nft_ata`| optional `mut`             |                                |
| `token_program`        | program                    |                                |
| `associated_token_program` | program                |                                |
| `system_program`       | program                    |                                |

### Behavior

```rust
require!(!king.settled, KolzError::SettlementPeriodEnded);

let balance = ctx.accounts.challenger_pump_ata.amount;
require!(balance > king.champion_balance, KolzError::NotTopHolder);

let slot = Clock::get()?.slot;

if king.take_overs == 0 {
    // First capture: move NFT from escrow vault to challenger.
    transfer_checked(/* from escrow_vault, authority king PDA */, 1, 0)?;
    king.settles_at_slot = slot.saturating_add(1_512_000);
} else {
    // Subsequent capture: move from prev champion ATA to challenger via king delegate.
    let prev = ctx.accounts.prev_champion_nft_ata
        .as_ref()
        .ok_or(KolzError::MissingPrevChampionAta)?;
    transfer_checked(/* from prev, authority king PDA */, 1, 0)?;
}

// Re-approve king PDA as delegate over challenger NFT ATA.
approve(/* delegate = king PDA, amount = 1 */)?;

king.current_champion = ctx.accounts.challenger.key();
king.champion_balance = balance;
king.last_captured_slot = slot;
king.take_overs = king.take_overs.saturating_add(1);
```

### Errors

`NotTopHolder`, `SettlementPeriodEnded`, `MissingPrevChampionAta`.

## 5. settle_throne

Lock in the final champion after the settlement window passes.

### Arguments

None.

### Accounts

| Name                  | Role            | Seeds         |
| --------------------- | --------------- | ------------- |
| `config`              | read            | `["config"]`  |
| `oracle`              | `signer`        |               |
| `king`                | `mut`           | `["king", pet]` |
| `champion_nft_ata`    | `mut`           |               |
| `token_program`       | program         |               |

### Behavior

```rust
require_keys_eq!(ctx.accounts.oracle.key(), ctx.accounts.config.oracle, KolzError::OracleMismatch);
require!(!king.settled, KolzError::AlreadySettled);
let slot = Clock::get()?.slot;
require!(slot >= king.settles_at_slot, KolzError::SettlementNotReady);

// Revoke king PDA delegate from current champion ATA.
revoke(/* authority = king PDA */)?;

king.settled = true;
```

### Errors

`OracleMismatch`, `AlreadySettled`, `SettlementNotReady`.

## 6. commit_distribution_root

Publish a merkle root that authorizes holder claims for an epoch.

### Arguments

| Name              | Type     | Notes                              |
| ----------------- | -------- | ---------------------------------- |
| `epoch`           | u64      | monotonic epoch counter            |
| `root`            | [u8; 32] | keccak256 merkle root              |
| `pool_lamports`   | u64      | total lamports allocated for epoch |

### Accounts

| Name             | Role                          | Seeds                              |
| ---------------- | ----------------------------- | ---------------------------------- |
| `config`         | read                          | `["config"]`                       |
| `oracle`         | `signer`                      |                                    |
| `distribution`   | `init`, `mut`                 | `["distribution", epoch.to_le_bytes()]` |
| `payer`          | `signer`, `mut`               |                                    |
| `system_program` | program                       |                                    |

### Behavior

```rust
require_keys_eq!(ctx.accounts.oracle.key(), ctx.accounts.config.oracle, KolzError::OracleMismatch);

let d = &mut ctx.accounts.distribution;
d.epoch = epoch;
d.root = root;
d.pool_lamports = pool_lamports;
d.committed_at = Clock::get()?.slot;
d.bump = ctx.bumps.distribution;
```

### Errors

`OracleMismatch`.

## 7. claim_holder_fees

Claim lamports allocated to a holder for an epoch.

### Arguments

| Name      | Type            | Notes                          |
| --------- | --------------- | ------------------------------ |
| `epoch`   | u64             | distribution epoch             |
| `amount`  | u64             | claim amount in lamports       |
| `proof`   | Vec<[u8; 32]>   | merkle proof, leaf to root     |

### Accounts

| Name             | Role                                  | Seeds                                       |
| ---------------- | ------------------------------------- | ------------------------------------------- |
| `distribution`   | read                                  | `["distribution", epoch.to_le_bytes()]`     |
| `holder_claim`   | `init`, `mut`                         | `["holder_claim", holder, epoch.to_le_bytes()]` |
| `fee_vault`      | `mut`                                 | `["fee_vault"]`                             |
| `holder`         | `signer`, `mut`                       |                                             |
| `system_program` | program                               |                                             |

### Behavior

```rust
let leaf = keccak256(holder.key().as_ref(), &epoch.to_le_bytes(), &amount.to_le_bytes());
require!(verify_merkle_proof(&proof, distribution.root, leaf), KolzError::InvalidProof);
require!(amount > 0, KolzError::InvalidAmount);
require!(fee_vault.lamports() >= amount, KolzError::InsufficientVault);

// Transfer lamports from fee_vault PDA to holder.
**fee_vault.to_account_info().try_borrow_mut_lamports()? -= amount;
**holder.to_account_info().try_borrow_mut_lamports()? += amount;

holder_claim.holder = ctx.accounts.holder.key();
holder_claim.epoch = epoch;
holder_claim.amount_claimed = amount;
holder_claim.claimed_at_slot = Clock::get()?.slot;
holder_claim.bump = ctx.bumps.holder_claim;
```

The `holder_claim` PDA being created via `init` is what enforces single-claim semantics: a second call collides with an existing account and Anchor returns `AlreadyClaimed`-equivalent rent allocation failure. The program explicitly maps that path to `KolzError::AlreadyClaimed`.

### Errors

`AlreadyClaimed`, `InvalidProof`, `EpochNotCommitted`, `InsufficientVault`, `InvalidAmount`.

## Error code table

| Variant                       | Meaning                                                |
| ----------------------------- | ------------------------------------------------------ |
| `Unauthorized`                | Signer is not authorized for this path                 |
| `OracleMismatch`              | Signer is not the configured oracle                    |
| `AdminMismatch`               | Signer is not the configured admin                     |
| `NotTopHolder`                | Challenger balance not strictly above champion balance |
| `SettlementPeriodEnded`       | Throne is already settled                              |
| `AlreadySettled`              | Settlement was already finalized                       |
| `SettlementNotReady`          | Current slot has not reached settles_at_slot           |
| `MissingPrevChampionAta`      | Required prev champion ATA was not provided            |
| `MissingMetadataProgram`      | Token metadata program not supplied                    |
| `AlreadyClaimed`              | Holder already claimed this epoch                      |
| `InvalidProof`                | Merkle proof failed verification                       |
| `EpochNotCommitted`           | Distribution PDA for epoch does not exist              |
| `InsufficientVault`           | fee_vault PDA does not hold enough lamports            |
| `InvalidAmount`               | amount must be greater than zero                       |
| `NameTooLong`                 | Name exceeds 32 bytes                                  |
| `UriTooLong`                  | URI exceeds 200 bytes                                  |
| `SymbolTooLong`               | Symbol exceeds 10 bytes                                |
| `BondingCurveNotInitialized`  | Launch row missing or zeroed                           |

## See also

- [architecture.md](./architecture.md) for how these instructions compose.
- [throne.md](./throne.md) for the take-throne and settle deep dive.
- [distributions.md](./distributions.md) for the merkle proof format.
- [security.md](./security.md) for trust boundaries.
