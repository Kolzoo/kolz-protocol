# KOLZ TypeScript SDK

`@kolz/sdk` is the official TypeScript client for the KOLZ Anchor program. It is compiled with `target: ES2020`, `module: commonjs`, `strict: true`, and re-exports the Anchor-generated IDL types. The SDK exposes one class, `KolzClient`, plus pure helpers for PDA derivation and merkle proof construction.

## Install

```bash
npm install @kolz/sdk @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

## Constructing the client

```ts
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { KolzClient } from "@kolz/sdk";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const wallet = new Wallet(Keypair.generate());
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

const programId = new PublicKey("11111111111111111111111111111111");
const client = new KolzClient(provider, programId);
```

The `programId` argument is the deployed `kolz` program id. Use the deployed value from [deployment.md](./deployment.md). The example above uses the System Program address as a stand-in for documentation purposes only.

## PDA helpers

All PDAs are exposed as pure functions so callers can derive addresses without instantiating the client.

```ts
import { findConfigPda, findPetPda, findLaunchPda, findKingPda,
         findDistributionPda, findHolderClaimPda, findFeeVaultPda } from "@kolz/sdk";

const [config]       = findConfigPda(programId);                           // ["config"]
const [pet]          = findPetPda(programId, kolOwner, kolNameBytes);      // ["pet", kol_owner, kol_name]
const [launch]       = findLaunchPda(programId, pet);                      // ["launch", pet]
const [king]         = findKingPda(programId, pet);                        // ["king", pet]
const [distribution] = findDistributionPda(programId, epoch);              // ["distribution", epoch_le]
const [holderClaim]  = findHolderClaimPda(programId, holder, epoch);       // ["holder_claim", holder, epoch_le]
const [feeVault]     = findFeeVaultPda(programId);                         // ["fee_vault"]
```

`kolNameBytes` must be a 32-byte `Uint8Array`. Use the `encodeKolName` helper to pad a string:

```ts
import { encodeKolName } from "@kolz/sdk";
const kolNameBytes = encodeKolName("vitalik");  // Uint8Array(32)
```

## Methods

### initConfig

```ts
// Returns: TransactionSignature
const sig = await client.initConfig({
  admin: adminKeypair,            // Signer
  oracleAuthority: oraclePubkey,  // PublicKey
  feeBasisPoints: 250,            // 2.5%
});
```

### oracleBindPumpfunLaunch

```ts
// Returns: { signature: TransactionSignature, pet: PublicKey, launch: PublicKey }
const result = await client.oracleBindPumpfunLaunch({
  oracle: oracleKeypair,          // Signer
  kolOwner: kolOwnerPubkey,
  pumpMint: pumpMintPubkey,
  kolName: "vitalik",             // string, encoded to [u8;32] internally
  payer: payerKeypair,            // Signer, defaults to oracle if omitted
});
```

### mintKolNft

```ts
// Returns: { signature: TransactionSignature, nftMint: PublicKey, king: PublicKey }
const minted = await client.mintKolNft({
  oracle: oracleKeypair,          // Signer
  pet: petPubkey,
  name: "KOLZ Vitalik",           // <= 32 chars
  symbol: "VITA",                 // <= 10 chars
  uri: "https://kolz-api.fly.dev/metadata/vitalik.json", // <= 200 chars
  payer: payerKeypair,
});
```

### takeThrone

```ts
// Returns: { signature: TransactionSignature, newChampion: PublicKey, newBalance: bigint }
const captured = await client.takeThrone({
  challenger: challengerKeypair,  // Signer
  pet: petPubkey,
  launch: launchPubkey,
  nftMint: nftMintPubkey,
  pumpMint: pumpMintPubkey,
  prevChampionNftAta: prevChampionAta, // optional, required after first capture
});
```

The SDK reads `KingOfHill` before submitting to decide whether `prevChampionNftAta` is required. Passing it when not needed is ignored.

### settleThrone

```ts
// Returns: TransactionSignature
const sig = await client.settleThrone({
  oracle: oracleKeypair,          // Signer
  pet: petPubkey,
  championNftAta: championAta,
});
```

### commitDistributionRoot

```ts
// Returns: { signature: TransactionSignature, distribution: PublicKey }
const committed = await client.commitDistributionRoot({
  oracle: oracleKeypair,          // Signer
  epoch: 42n,                     // bigint
  root: rootBytes,                // Uint8Array(32)
  poolLamports: 1_000_000_000n,   // 1 SOL
  payer: payerKeypair,
});
```

### claimHolderFees

```ts
// Returns: { signature: TransactionSignature, lamportsReceived: bigint }
const claim = await client.claimHolderFees({
  holder: holderKeypair,          // Signer
  epoch: 42n,
  amount: 12_500_000n,            // 0.0125 SOL
  proof: proofArray,              // Uint8Array(32)[]
});
```

## Merkle helpers

Constructing proofs off chain is the caller's responsibility. The SDK ships a reference implementation.

```ts
import { buildMerkleTree, getMerkleProof, computeLeaf } from "@kolz/sdk";

// leaves: [{ holder: PublicKey, epoch: bigint, amount: bigint }]
const leaves = [
  { holder: new PublicKey("11111111111111111111111111111111"), epoch: 42n, amount: 1_000n },
  { holder: holderKeypair.publicKey, epoch: 42n, amount: 12_500_000n },
];

const tree = buildMerkleTree(leaves);
// tree.root: Uint8Array(32)

const leaf = computeLeaf(holderKeypair.publicKey, 42n, 12_500_000n);
const proof = getMerkleProof(tree, leaf);
// proof: Uint8Array(32)[]
```

The leaf hashing matches the on-chain verifier exactly:

```ts
// leaf = keccak256(holder_pubkey_bytes || epoch_u64_le || amount_u64_le)
```

See [distributions.md](./distributions.md) for the full encoding.

## Account fetchers

```ts
// All fetchers return null when the account does not exist.
const config = await client.fetchConfig();                       // Config | null
const pet = await client.fetchPet(petPubkey);                    // Pet | null
const launch = await client.fetchLaunch(launchPubkey);           // Launch | null
const king = await client.fetchKing(kingPubkey);                 // KingOfHill | null
const dist = await client.fetchDistribution(epoch);              // Distribution | null
const claimed = await client.fetchHolderClaim(holder, epoch);    // HolderClaim | null
```

## Typed errors

The SDK wraps Anchor error codes into a `KolzError` enum. Catch them with `instanceof`:

```ts
import { KolzError, KolzErrorCode } from "@kolz/sdk";

try {
  await client.takeThrone({ /* ... */ });
} catch (e) {
  if (e instanceof KolzError) {
    switch (e.code) {
      case KolzErrorCode.NotTopHolder:           // 6003
      case KolzErrorCode.SettlementPeriodEnded:  // 6004
        // surface to UI
        break;
      default:
        throw e;
    }
  } else {
    throw e;
  }
}
```

## Cross references

- Instruction reference: [instructions.md](./instructions.md)
- CLI wrapper around this SDK: [cli.md](./cli.md)
- Distributions and merkle proofs: [distributions.md](./distributions.md)
