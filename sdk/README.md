# @cols/sdk

<img src="https://img.shields.io/npm/v/@cols/sdk?style=flat-square" alt="npm version" />
<img src="https://img.shields.io/node/v/@cols/sdk?style=flat-square" alt="node version" />
<img src="https://img.shields.io/badge/solana-1.18.26-blue?style=flat-square" alt="solana" />
<img src="https://img.shields.io/badge/anchor-0.30.1-purple?style=flat-square" alt="anchor" />
<img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="license" />

Official TypeScript SDK for the COLS on-chain protocol. COLS is a Solana Anchor program that bonds KOL identities to pump.fun memecoin launches, runs a King of the Hill capture loop on a 1/1 NFT, and distributes pooled creator fees to holders via merkle drops.

This package gives you typed wrappers for every program instruction, on-chain account decoders, PDA derivations, and a keccak256 merkle tree implementation that matches the on-chain verifier byte-for-byte.

## Install

```bash
npm install @cols/sdk @solana/web3.js
```

Peer requirements:

- Node.js 18 or newer
- `@solana/web3.js` 1.95+
- `@solana/spl-token` 0.4+

## Quick start

```ts
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { ColsClient, encodeKolName } from "@cols/sdk";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const client = new ColsClient(connection);

const admin = Keypair.generate();
const oracle = Keypair.generate();

const ix = client.buildInitConfig({
  admin: admin.publicKey,
  oracleAuthority: oracle.publicKey,
  feeBasisPoints: 250
});

const tx = new Transaction().add(ix);
tx.feePayer = admin.publicKey;
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
tx.sign(admin);
await connection.sendRawTransaction(tx.serialize());
```

## What the SDK gives you

### Instruction builders

Every on-chain instruction has a typed builder. Builders return raw `TransactionInstruction` objects so you remain in control of signing, fee payment, and transaction composition.

| Builder | Anchor handler | Purpose |
| --- | --- | --- |
| `buildInitConfig` | `init_config` | Initialize global config PDA |
| `buildBindLaunch` | `oracle_bind_pumpfun_launch` | Bond a pump.fun mint to a KOL |
| `buildMintKolNft` | `mint_kol_nft` | Mint the 1/1 King of Hill NFT into escrow |
| `buildTakeThrone` | `take_throne` | Capture the throne with the top memecoin balance |
| `buildSettleThrone` | `settle_throne` | Finalize the 7-day window |
| `buildCommitDistributionRoot` | `commit_distribution_root` | Publish a merkle root for an epoch |
| `buildClaimHolderFees` | `claim_holder_fees` | Claim per-holder lamports against the merkle proof |

### Account decoders

Pass raw `getAccountInfo` data to the decoders or use the higher level `client.fetchX` helpers:

```ts
const config = await client.fetchConfig();
if (config) {
  console.log("admin:", config.account.data.admin.toBase58());
  console.log("oracle:", config.account.data.oracle.toBase58());
  console.log("feeBasisPoints:", config.account.data.feeBasisPoints);
}
```

### PDA helpers

```ts
import { configPda, petPda, kingOfHillPda, distributionPda } from "@cols/sdk";
import { encodeKolName } from "@cols/sdk";

const { address: pet } = petPda(kolOwner, encodeKolName("doge"));
const { address: king } = kingOfHillPda(pet);
const { address: dist } = distributionPda(epoch);
```

### Merkle distribution

The merkle tree hashes leaves as `keccak256(holder_pubkey || epoch_u64_le || amount_u64_le)` and combines internal nodes by lexicographically sorting siblings before hashing. The on-chain verifier follows the same rule, so the proofs you build off-chain plug directly into `claim_holder_fees`.

```ts
import { buildMerkleTree, makeLeaf } from "@cols/sdk";

const leaves = holders.map((h) => makeLeaf(h.address, epoch, h.amount));
const { root, proofs } = buildMerkleTree(leaves);

const commitIx = client.buildCommitDistributionRoot({
  oracle: oracle.publicKey,
  epoch,
  root,
  poolLamports
});

const claimIx = client.buildClaimHolderFees({
  holder: alice.publicKey,
  epoch,
  amount: aliceAmount,
  proof: proofs.get(alice.publicKey.toBase58()) ?? []
});
```

### Error mapping

Anchor program errors are mapped back to a typed `ColsProgramError` with the original enum name attached:

```ts
import { parseAnchorErrorLogs } from "@cols/sdk";

try {
  await connection.sendTransaction(tx, [signer]);
} catch (e: any) {
  const parsed = parseAnchorErrorLogs(e.logs ?? []);
  if (parsed) {
    console.log(parsed.codeName, parsed.message);
  }
}
```

## On-chain program reference

The Anchor program lives at [github.com/Kolzoo/cols-protocol](https://github.com/Kolzoo/cols-protocol). The HTTP indexer used for off-chain reads runs at `https://cols-api.fly.dev`.

Pinned toolchain versions:

- Anchor 0.30.1
- solana-program 1.18.26
- Rust 2021 edition

## License

MIT
