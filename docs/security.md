# KOLZ Security Model

This document describes the trust assumptions, signer constraints, and known attack surfaces of the KOLZ protocol. It is meant as a reference for auditors, integrators, and operators.

## Roles and authorities

The protocol has three distinct authorities.

| Role        | Key             | Powers                                                                |
| ----------- | --------------- | --------------------------------------------------------------------- |
| Admin       | `config.admin`  | Initialize the protocol, rotate the oracle key                        |
| Oracle      | `config.oracle` | Bind launches, mint NFTs, settle thrones, commit distribution roots   |
| Holder      | any wallet      | Take the throne, claim distributions                                  |

The Admin and Oracle keys SHOULD be distinct in production. The Admin SHOULD be a multisig. The Oracle is a single hot key by design so it can react to pump.fun events without human latency.

## Signer constraints

Every privileged instruction performs an explicit `require_keys_eq!` check against the `Config` PDA. The constraint is repeated below for clarity.

| Instruction                    | Required signer        | Check                                                |
| ------------------------------ | ---------------------- | ---------------------------------------------------- |
| `init_config`                  | admin                  | Anchor `signer` constraint                           |
| `oracle_bind_pumpfun_launch`   | oracle                 | `oracle.key() == config.oracle`                      |
| `mint_kol_nft`                 | oracle                 | `oracle.key() == config.oracle`                      |
| `take_throne`                  | challenger             | Anchor `signer` constraint, no role check            |
| `settle_throne`                | oracle                 | `oracle.key() == config.oracle`                      |
| `commit_distribution_root`     | oracle                 | `oracle.key() == config.oracle`                      |
| `claim_holder_fees`            | holder                 | Anchor `signer` constraint, proof gates payout       |

`Unauthorized` is reserved for paths where the role check fails outside the dedicated `OracleMismatch` and `AdminMismatch` codes (for example, signer not matching any known role on a composite instruction).

## Threat model

### T1: Malicious oracle

The oracle can:

- Bind a fake launch row pointing at a mint it controls.
- Skip emitting a merkle root for an epoch, withholding distributions.
- Front-run `settle_throne` to lock the throne early (but only after `settles_at_slot`, which the oracle does not control).
- Commit a root that excludes specific holders.

The oracle CANNOT:

- Steal lamports from `fee_vault` for itself. The vault only pays out via `claim_holder_fees` to a signer whose pubkey is in the merkle leaf.
- Move the NFT after settlement (delegate is revoked).
- Modify a `HolderClaim` PDA after it is created.

Mitigation: oracle rotation is admin-controlled. The admin SHOULD be a multisig with separate signers from the oracle operator.

### T2: Malicious admin

The admin can rotate the oracle key arbitrarily. A malicious admin can swap the oracle to a colluding key and replay any of the oracle-only attacks. Mitigation: multisig admin, public on-chain monitoring of `init_config` reissuance.

### T3: Merkle root manipulation

Distributions are gated by a keccak256 merkle tree. The proof verifier hashes `keccak(holder || epoch_le || amount_le)` as the leaf and walks up using sorted pair hashing. A malicious oracle could:

- Allocate disproportionate amounts to colluding holders. There is no on-chain check that the sum of leaves equals `pool_lamports`.

Mitigation: off-chain validators SHOULD recompute the tree from the public claim list and compare against the on-chain root before users claim. The `pool_lamports` field is an upper bound the on-chain code uses for sanity, not a sum check.

### T4: NFT escape

After `settle_throne`, the king PDA delegate is revoked. The current champion holds the NFT in a standard SPL ATA they own. They can transfer it freely. This is intentional: the NFT becomes a permanent badge.

Before settlement, the NFT cannot leave the chain of champions because the king PDA's delegate authority is re-approved on every `take_throne` capture. A champion cannot transfer the NFT out because they only hold custody, not delegate authority over their own ATA after capture (the program approves the king PDA as delegate on every capture). A champion could revoke the delegate with their own `Revoke` ix; the next `take_throne` would fail with `MissingPrevChampionAta` semantics if the prev champion ATA cannot be debited.

Mitigation: front-end SHOULD warn users that revoking delegate breaks the throne game for the current pet. The protocol does not auto-recover from this state. A force-reclaim path is out of scope for v1.

### T5: Double-claim

`HolderClaim` is created with Anchor `init` keyed by `(holder, epoch)`. A second call fails at rent allocation, mapped to `AlreadyClaimed`. There is no path to delete and re-create the PDA without admin authority, and admin authority does not have an explicit path either.

### T6: Replay across forks

Instructions read `Clock::get()?.slot`. On rare cluster restart events, slot numbers do not roll back but can pause. The `settles_at_slot` deadline uses absolute slot numbers and is unaffected by pause length. There is no time-of-check, time-of-use gap because all reads of `Clock` are inside the instruction.

### T7: Underfunded vault

`claim_holder_fees` checks `fee_vault.lamports() >= amount` and returns `InsufficientVault`. The vault is permissionless to fund (`vault fund`). If the vault is empty, the first holder to claim drains whatever is there as long as the proof is valid for an amount up to vault balance.

Mitigation: the oracle SHOULD only publish a root after `pool_lamports` has been deposited. The CLI's `distribution commit` does not enforce this; production oracles SHOULD precheck.

## Integrity of pump.fun observations

The program does not verify that the `pump_mint` argument actually corresponds to a pump.fun bonding curve. The oracle is trusted to pass a real mint. A wrong mint would still create a valid `Launch` PDA but with no meaningful balance to compete over.

A hardening pass that includes a CPI to the pump.fun program for direct curve reads is out of scope for v1. See [pumpfun.md](./pumpfun.md).

## Audit checklist

For auditors reviewing the source tree:

- Confirm `require_keys_eq!` on every oracle-only path.
- Confirm `init` constraints on every PDA listed in [instructions.md](./instructions.md).
- Confirm bump fields are stored and used consistently on derive.
- Confirm `take_throne` does not allow `balance == champion_balance` (strict `>`).
- Confirm `settle_throne` uses `>=` for `settles_at_slot`.
- Confirm merkle verifier sorts pairs before hashing to match the off-chain implementation.

## See also

- [architecture.md](./architecture.md) for component layout.
- [throne.md](./throne.md) for take-throne mechanics.
- [distributions.md](./distributions.md) for merkle integrity.
