# basis-deployer

NFT collection + Candy Machine deployment UI for the Basis ecosystem.

## What it does
6-step wizard: wallet connect → metadata form → asset upload (Arweave/Irys) → collection creation → Candy Machine creation → generate mint page HTML.

## Key files
| File | Role |
|---|---|
| `src/main.js` | UI shell, step navigation, form collection |
| `src/deploy.js` | Core Solana logic: Umi init, collection + Candy Machine creation |
| `src/wallet.js` | Phantom/Solflare wallet connection, balance checks |
| `src/irys.js` | Arweave upload via Irys web3 storage |
| `src/mintpage.js` | Generate downloadable mint page HTML |
| `src/rpc.js` | RPC endpoint config |
| `vite.config.js` | Polyfills: buffer, crypto, stream (required by web3.js v1) |

## Solana stack (current — legacy)
- `@metaplex-foundation/umi` `^0.9.2` — Solana abstraction layer
- `@metaplex-foundation/mpl-core` `^1.1.1` — NFT standard
- `@metaplex-foundation/mpl-core-candy-machine` `^0.3.0` — minting machine
- `@metaplex-foundation/umi-uploader-irys` — Arweave via Irys
- `@solana/web3.js` `^1.95.3` — low-level Solana RPC
- Wallet adapters: Phantom, Solflare

## Skill guidance
The `solana-dev` skill applies here for:
- **Candy Machine guard configuration** — whitelist (Merkle roots), sol payment guards, mint limits, start dates
- **Umi patterns** — transaction building, `sendAndConfirm`, signer management
- **Error diagnosis** — use `references/common-errors.md` for Metaplex/Umi errors
- **Future SDK migration** — `references/kit-web3-interop.md` for moving from Umi/web3.js v1 to `@solana/kit`
- **Security review** — `references/security.md` for checking transaction building patterns

## Known patterns
- `createCollection` → `createCandyMachine` → `addConfigLines` (batched, 10 per tx) → `setMintAuthority`
- Candy Machine guards use `some()` wrapper (Umi Option type)
- Whitelist = `allowList` guard with `getMerkleRoot()` from wallet array

## Dev
```bash
npm run dev       # localhost:5174
npm run build
npm run preview
```
