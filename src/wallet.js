import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js';

const adapters = {
  phantom: new PhantomWalletAdapter(),
  solflare: new SolflareWalletAdapter(),
};

let currentAdapter = null;
let connection = null;

export function getConnection(network) {
  const endpoint = network === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : clusterApiUrl('devnet');
  connection = new Connection(endpoint, 'confirmed');
  return connection;
}

export async function connectWallet(providerName, network) {
  const adapter = adapters[providerName];
  if (!adapter) throw new Error(`Unknown wallet: ${providerName}`);

  await adapter.connect();
  currentAdapter = adapter;
  
  const conn = getConnection(network);
  const balance = await conn.getBalance(adapter.publicKey);

  return {
    publicKey: adapter.publicKey,
    address: adapter.publicKey.toBase58(),
    balance: balance / LAMPORTS_PER_SOL,
    adapter,
  };
}

export async function disconnectWallet() {
  if (currentAdapter) {
    await currentAdapter.disconnect();
    currentAdapter = null;
  }
}

export function getAdapter() {
  return currentAdapter;
}

export function getPublicKey() {
  return currentAdapter?.publicKey || null;
}

export async function getBalance(network) {
  if (!currentAdapter?.publicKey) return 0;
  const conn = getConnection(network);
  const bal = await conn.getBalance(currentAdapter.publicKey);
  return bal / LAMPORTS_PER_SOL;
}
