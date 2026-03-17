import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import {
  createCollection,
  create as createAsset,
  fetchCollection,
} from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey, sol } from '@metaplex-foundation/umi';
import { getAdapter } from './wallet.js';

let umi = null;

/**
 * Initialize Umi with the connected wallet and network.
 */
export function initUmi(network) {
  const endpoint = network === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';

  const adapter = getAdapter();
  if (!adapter) throw new Error('Wallet not connected');

  umi = createUmi(endpoint)
    .use(walletAdapterIdentity(adapter));

  return umi;
}

/**
 * Create a Metaplex Core Collection on-chain.
 * 
 * @param {Object} config
 * @param {string} config.name - Collection name
 * @param {string} config.uri - Arweave URI of collection metadata JSON
 * @param {Function} onLog - Log callback
 * @returns {string} Collection public key (base58)
 */
export async function deployCollection(config, onLog) {
  if (!umi) throw new Error('Umi not initialized');

  onLog('Generating collection keypair…', 'info');
  const collectionSigner = generateSigner(umi);

  onLog(`Creating collection: ${config.name}…`, 'info');
  await createCollection(umi, {
    collection: collectionSigner,
    name: config.name,
    uri: config.uri,
  }).sendAndConfirm(umi);

  const collectionAddress = collectionSigner.publicKey.toString();
  onLog(`✓ Collection created: ${collectionAddress}`, 'ok');

  return collectionAddress;
}

/**
 * Mint all NFTs into the collection.
 * Each NFT is created as a Metaplex Core Asset belonging to the collection.
 * 
 * @param {string} collectionAddr - Collection public key
 * @param {Object[]} items - Array of {name, uri} for each NFT
 * @param {Object} config - {royaltyBps, creatorAddress}
 * @param {Function} onProgress - (done, total, message)
 * @returns {string[]} Array of minted asset public keys
 */
export async function mintCollection(collectionAddr, items, config, onProgress) {
  if (!umi) throw new Error('Umi not initialized');

  const collectionPubkey = publicKey(collectionAddr);
  const mintedAddresses = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const assetSigner = generateSigner(umi);

    try {
      await createAsset(umi, {
        asset: assetSigner,
        name: item.name,
        uri: item.uri,
        collection: collectionPubkey,
        plugins: [
          {
            type: 'Royalties',
            basisPoints: config.royaltyBps || 500,
            creators: [
              {
                address: publicKey(config.creatorAddress || umi.identity.publicKey.toString()),
                percentage: 100,
              },
            ],
            ruleSet: { type: 'None' },
          },
        ],
      }).sendAndConfirm(umi);

      mintedAddresses.push(assetSigner.publicKey.toString());
      onProgress(i + 1, items.length, `Minted #${i}: ${item.name}`);
    } catch (err) {
      onProgress(i + 1, items.length, `Failed #${i}: ${err.message}`);
      // Continue minting — don't stop on individual failures
      // User can retry failed items later
    }

    // Rate limiting — Solana RPC has limits
    if (i % 5 === 0 && i > 0) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return mintedAddresses;
}

/**
 * Full deployment pipeline.
 * 
 * @param {Object} config - All deployment settings
 * @param {Object} metadataURIs - {filename: arweaveURI} from upload step
 * @param {string} collectionMetaURI - Arweave URI for collection.json
 * @param {Function} onProgress - (step, done, total, message)
 * @param {Function} onLog - (message, type)
 */
export async function fullDeploy(config, metadataURIs, collectionMetaURI, onProgress, onLog) {
  // Step 1: Create collection
  onLog('Step 1/3: Creating collection on-chain…', 'info');
  onProgress('collection', 0, 1, 'Creating collection…');
  
  const collectionAddr = await deployCollection({
    name: config.name,
    uri: collectionMetaURI,
  }, onLog);

  onProgress('collection', 1, 1, 'Collection created');

  // Step 2: Prepare mint items
  onLog('Step 2/3: Preparing mint items…', 'info');
  const items = [];
  const sortedEntries = Object.entries(metadataURIs)
    .sort((a, b) => {
      const numA = parseInt(a[0].replace('.json', ''));
      const numB = parseInt(b[0].replace('.json', ''));
      return numA - numB;
    });

  for (const [filename, uri] of sortedEntries) {
    const num = filename.replace('.json', '');
    items.push({
      name: `${config.name} #${num}`,
      uri,
    });
  }

  // Step 3: Mint all items
  onLog(`Step 3/3: Minting ${items.length} NFTs…`, 'info');
  const mintedAddrs = await mintCollection(
    collectionAddr,
    items,
    {
      royaltyBps: config.royaltyBps,
      creatorAddress: config.creatorAddress,
    },
    (done, total, msg) => {
      onProgress('mint', done, total, msg);
      if (done % 50 === 0) onLog(`  Minted ${done}/${total}`, 'ok');
    }
  );

  onLog(`✓ Deployment complete: ${mintedAddrs.length} NFTs minted`, 'ok');
  onLog(`Collection: ${collectionAddr}`, 'ok');

  return {
    collectionAddress: collectionAddr,
    mintedCount: mintedAddrs.length,
    mintedAddresses: mintedAddrs,
  };
}
