# BASIS Deployer

Deploys NFT collections to Solana using Metaplex Core + Arweave via Irys.

## Setup

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`

## Production Build

```bash
npm run build
```

Deploy the `dist/` folder to Vercel, Netlify, or any static host.

## How It Works

1. **Connect Wallet** — Phantom or Solflare
2. **Load Collection** — Upload the ZIP from BASIS NFT Builder
3. **Configure** — Review settings, royalties, cost estimate
4. **Upload to Arweave** — Images + metadata get permanent `ar://` URIs via Irys
5. **Deploy On-Chain** — Creates Metaplex Core collection + mints all NFTs
6. **Live!** — Auto-indexed on Magic Eden & Tensor

## Architecture

```
src/
├── main.js      — UI + orchestration
├── wallet.js    — Phantom/Solflare wallet adapter
├── irys.js      — Arweave upload via Irys SDK
├── deploy.js    — Metaplex Core collection + minting
└── style.css    — BASIS branding
```

## Dependencies

- `@metaplex-foundation/mpl-core` — Metaplex Core NFT standard
- `@metaplex-foundation/umi` — Metaplex transaction framework
- `@irys/sdk` — Arweave permanent storage
- `@solana/wallet-adapter-*` — Wallet connection
- `jszip` — Read ZIP exports from the builder

## Network

Default: **Mainnet**. Toggle to Devnet in the UI header for testing.
Get devnet SOL from [faucet.solana.com](https://faucet.solana.com).
