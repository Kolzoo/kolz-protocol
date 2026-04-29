# KOLZ Glossary

Short definitions of every term used across the KOLZ documentation. Sorted alphabetically.

## Admin

The signer that initialized the protocol via `init_config`. Stored as `Config.admin`. Has authority to rotate the oracle key. SHOULD be a multisig in production.

## Bonded slot

The Solana slot number at which a `Launch` PDA was created via `oracle_bind_pumpfun_launch`. Stored as `Launch.bonded_slot`. Used as a freshness signal for mirrored bonding curve state.

## Bonding curve

The constant-product market maker that pump.fun runs per memecoin until it accumulates enough SOL to graduate to a Raydium pool. KOLZ does not own the curve, it observes it.

## Champion

The current holder of the KOL NFT and the wallet with the highest recorded memecoin balance for that launch. Stored as `KingOfHill.current_champion`. Defaults to the System Program address before any capture.

## Champion balance

The memecoin balance the current champion held at the moment of their capture. Stored as `KingOfHill.champion_balance`. A new challenger must hold strictly more than this value.

## Config PDA

The protocol singleton at seeds `["config"]`. Holds the admin pubkey, oracle pubkey, fee basis points, and bump.

## Distribution

A record of a single fee distribution epoch. PDA seeds are `["distribution", epoch_le_bytes]`. Holds the merkle root, pool size, and commit slot.

## Epoch

A monotonic `u64` counter assigned by the oracle to each distribution batch. There is no enforced cadence on chain.

## Escrow vault

The SPL associated token account that holds the KOL NFT before the first capture. Authority is the `KingOfHill` PDA. After the first `take_throne`, this account is empty and stays empty.

## Fee basis points

Protocol fee in 1/100 of a percent. A value of `250` means 2.5 percent. Stored as `Config.fee_basis_points`. Used by the off-chain oracle to split creator fees between the KOL and the holder pool.

## fee_vault PDA

The lamport reservoir for holder claims, at seeds `["fee_vault"]`. Anyone can deposit, only `claim_holder_fees` can withdraw, and only to a signer named in a verified merkle leaf.

## Holder

Any wallet that holds a positive balance of the pump.fun memecoin. Eligibility for an epoch is computed off chain at snapshot time.

## HolderClaim PDA

The receipt of a successful holder claim. PDA seeds are `["holder_claim", holder, epoch_le_bytes]`. Its existence is what prevents double-claims.

## KingOfHill PDA

The throne game state per launch. PDA seeds are `["king", pet]`. Tracks the current champion, the settlement deadline, and the NFT escrow vault.

## KOL

Key opinion leader. The human or brand whose pump.fun launch is bound to a Pet PDA. The KOL receives the creator-share of fees after a graduation.

## KOL name

A 32-byte identifier for a KOL, padded right with zero bytes. Used as a seed for the Pet PDA.

## Launch PDA

A mirror of pump.fun bonding curve state, scoped to a single Pet. PDA seeds are `["launch", pet]`. Stores the pump mint pubkey and snapshot fields.

## Leaf

A 32-byte keccak256 hash of `holder || epoch_le || amount_le`. The unit of merkle tree input. See [distributions.md](./distributions.md).

## Merkle root

The 32-byte keccak256 root of the per-epoch holder allocation tree. Stored as `Distribution.root`.

## NFT

The 1/1 SPL token minted by `mint_kol_nft`, with Metaplex Token Metadata V3. Represents the throne. Moves between champion wallets during the game, becomes permanently owned at settlement.

## Oracle

The off-chain signer authorized to call `oracle_bind_pumpfun_launch`, `mint_kol_nft`, `settle_throne`, and `commit_distribution_root`. Configured at `init_config` time. Trusted by the protocol to observe pump.fun and report accurately.

## Pet PDA

The KOL identity inside KOLZ. PDA seeds are `["pet", kol_owner, kol_name]`. Owns no funds. Acts as the namespace anchor for `Launch` and `KingOfHill` PDAs.

## Pool lamports

The lamport amount allocated to a single epoch's distribution. Stored as `Distribution.pool_lamports`. Informational on chain; enforced off chain by the oracle's funding step.

## Proof

A list of 32-byte sibling hashes that, combined with a leaf via the on-chain verifier, must reproduce the stored merkle root. Submitted to `claim_holder_fees`.

## pump_mint

The SPL mint of the memecoin launched on pump.fun. Stored as `Launch.pump_mint`. Used by `take_throne` to read challenger balances.

## Settle

The act of permanently locking in the current champion as the final NFT owner. Triggered by the oracle calling `settle_throne` after `settles_at_slot`.

## settles_at_slot

The absolute slot number at which the throne can be settled. Set to `current_slot + 1_512_000` (approximately 7 days at 0.4 second slots) on first capture. Stored as `KingOfHill.settles_at_slot`.

## Take over

A successful `take_throne` call. Counter is stored as `KingOfHill.take_overs`. Starts at 0 (no champion), increments to 1 on first capture, then once per subsequent capture.

## Throne

The conceptual position held by the current NFT holder. Materially: the NFT itself plus the `KingOfHill` PDA state.

## See also

- [architecture.md](./architecture.md) for how these objects fit together.
- [instructions.md](./instructions.md) for the per-instruction account schema.
