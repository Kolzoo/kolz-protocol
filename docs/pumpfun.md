# pump.fun Integration

COLS does not launch tokens itself. It binds an existing pump.fun bonding curve to a KOL identity and uses the resulting mint as the input for the throne game. This document explains where the boundary lives between the pump.fun program and the `cols` program, what the oracle is responsible for observing, and how creator fees flow into the holder distribution path.

## Boundary

pump.fun owns:

- The bonding curve account per mint.
- SOL <> token swap logic.
- The graduation to a Raydium liquidity pool when the curve fills.
- The creator fee accrual when graduation completes.

COLS owns:

- The `Launch` PDA that mirrors a snapshot of curve state.
- The `KingOfHill` game over the mint.
- The merkle-rooted holder distributions.

There is no CPI between the two programs in v1. The oracle bridges them.

## What the oracle observes

The oracle subscribes to pump.fun program logs and the Geyser account stream. For each new mint of interest, it reads:

| Field                  | Source                         | Mirrored to             |
| ---------------------- | ------------------------------ | ----------------------- |
| `real_sol_reserve`     | bonding curve account          | `Launch.real_sol_reserve` |
| `real_token_reserve`   | bonding curve account          | `Launch.real_token_reserve` |
| `creator_fees`         | creator fee escrow account     | `Launch.creator_fees_lamports` |
| `total_volume`         | derived from swap event totals | `Launch.total_volume_lamports` |
| `graduated`            | bonding curve completion flag  | `Launch.graduated`      |

`oracle_bind_pumpfun_launch` is NOT used for refresh. v1 binds once. Refresh of mirrored fields is the responsibility of a separate `oracle_update_launch_state` instruction scoped out of v1. Front ends SHOULD treat the launch row as best-effort snapshot, not real-time mirror.

## Why no CPI in v1

A direct CPI to pump.fun would tightly couple `cols` to pump.fun's program id and account layout. pump.fun has historically iterated on its bonding curve implementation. Coupling forces a `cols` redeploy every time pump.fun ships a breaking change.

Trade-off: the oracle becomes a trust point for launch state accuracy. See [security.md](./security.md) section T1.

## Creator fee handoff

When a pump.fun curve graduates, accumulated creator fees are released to the launch creator's wallet. The COLS oracle:

1. Watches for the graduation event for any bound launch.
2. Computes the holder snapshot at the graduation slot.
3. Computes per-holder allocations using `Config.fee_basis_points` to split between the creator and the holder pool.
4. Deposits the holder pool into `fee_vault`.
5. Calls `commit_distribution_root` with the resulting merkle root.

The KOL retains the non-pool share. The split formula is:

```text
holder_pool   = total_fees * fee_basis_points / 10_000
creator_share = total_fees - holder_pool
```

`fee_basis_points` is configured at `init_config` time. A value of `250` means 2.5 percent of creator fees flow to holders; the remaining 97.5 percent goes to the KOL.

## Mint observation

The `take_throne` instruction reads the challenger's pump mint balance directly from the SPL token account passed as `challenger_pump_ata`. This is the live on-chain balance, not the oracle-mirrored snapshot. The throne game does not depend on `Launch.real_token_reserve` being current.

## What can go wrong

| Failure                                 | Effect                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Wrong mint bound at `oracle_bind_pumpfun_launch` | Throne game runs over a non-existent or unrelated token. `take_throne` would still validate signatures and PDAs, but no holders would have meaningful balances. |
| Oracle misses graduation event          | No distribution committed. Holders receive nothing until the oracle catches up. |
| pump.fun program upgrade breaks layout  | Oracle reads return junk for `real_sol_reserve` etc. The mirrored fields go stale; the throne game is unaffected since it does not depend on them. |
| Creator skips pump.fun and launches direct on Raydium | Out of scope for v1. COLS only supports pump.fun launches. |

## Front-end implications

The launch detail UI SHOULD display:

- Bound state (`Launch.pump_mint`)
- Last observed reserves (with a "snapshot age" indicator computed from `bonded_slot`)
- Current top holder (computed off chain by scanning token accounts)
- `KingOfHill.current_champion`

The difference between "current top holder" (off chain scan) and `current_champion` (on chain row) is the gap that motivates calling `take_throne`. The UI SHOULD highlight when a wallet holds more than `champion_balance` but has not yet captured.

## See also

- [architecture.md](./architecture.md) for component layout.
- [throne.md](./throne.md) for the on-chain capture flow.
- [security.md](./security.md) for oracle trust analysis.
