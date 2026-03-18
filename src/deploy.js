import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import {
  createCollection,
  create as createAsset,
  fetchCollection,
} from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey, sol } from '@metaplex-foundation/umi';
import { getAdapter } from './wallet.js';
import { RPC_ENDPOINTS } from './rpc.js';

let umi = null;

/**
 * Initialize Umi with the connected wallet and network.
 */
export function initUmi(network) {
  const adapter = getAdapter();
  if (!adapter) throw new Error('Wallet not connected');

  umi = createUmi(RPC_ENDPOINTS[network])
    .use(walletAdapterIdentity(adapter));

  return umi;
}

/**
 * Create a Metaplex Core Collection on-chain.
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
    }

    // Rate limiting
    if (i % 5 === 0 && i > 0) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return mintedAddresses;
}

/**
 * Full deployment pipeline.
 */
export async function fullDeploy(config, metadataURIs, collectionMetaURI, onProgress, onLog) {
  onLog('Step 1/3: Creating collection on-chain…', 'info');
  onProgress('collection', 0, 1, 'Creating collection…');
  
  const collectionAddr = await deployCollection({
    name: config.name,
    uri: collectionMetaURI,
  }, onLog);

  onProgress('collection', 1, 1, 'Collection created');

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
