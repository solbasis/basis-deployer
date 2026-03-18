import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys/web';
import {
  createCollection,
  create as createAsset,
} from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey } from '@metaplex-foundation/umi';
import { getAdapter } from './wallet.js';
import { RPC_ENDPOINTS } from './rpc.js';

let umi = null;

export function initUmi(network) {
  const adapter = getAdapter();
  if (!adapter) throw new Error('Wallet not connected');

  umi = createUmi(RPC_ENDPOINTS[network])
    .use(walletAdapterIdentity(adapter))
    .use(irysUploader());

  return umi;
}

export function getUmi() { return umi; }

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
  const addr = collectionSigner.publicKey.toString();
  onLog(`✓ Collection created: ${addr}`, 'ok');
  return addr;
}

export async function mintCollection(collectionAddr, items, config, onProgress) {
  if (!umi) throw new Error('Umi not initialized');
  const collPk = publicKey(collectionAddr);
  const minted = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const signer = generateSigner(umi);
    try {
      await createAsset(umi, {
        asset: signer,
        name: item.name,
        uri: item.uri,
        collection: collPk,
        plugins: [{
          type: 'Royalties',
          basisPoints: config.royaltyBps || 500,
          creators: [{ address: publicKey(config.creatorAddress || umi.identity.publicKey.toString()), percentage: 100 }],
          ruleSet: { type: 'None' },
        }],
      }).sendAndConfirm(umi);
      minted.push(signer.publicKey.toString());
      onProgress(i + 1, items.length, `Minted #${i}: ${item.name}`);
    } catch (err) {
      onProgress(i + 1, items.length, `Failed #${i}: ${err.message}`);
    }
    if (i % 5 === 0 && i > 0) await new Promise(r => setTimeout(r, 500));
  }
  return minted;
}

export async function fullDeploy(config, metadataURIs, collectionMetaURI, onProgress, onLog) {
  onLog('Step 1/3: Creating collection…', 'info');
  onProgress('collection', 0, 1, 'Creating collection…');
  const collAddr = await deployCollection({ name: config.name, uri: collectionMetaURI }, onLog);
  onProgress('collection', 1, 1, 'Collection created');

  onLog('Step 2/3: Preparing items…', 'info');
  const items = Object.entries(metadataURIs)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([fn, uri]) => ({ name: `${config.name} #${fn.replace('.json', '')}`, uri }));

  onLog(`Step 3/3: Minting ${items.length} NFTs…`, 'info');
  const addrs = await mintCollection(collAddr, items, {
    royaltyBps: config.royaltyBps,
    creatorAddress: config.creatorAddress,
  }, (done, total, msg) => {
    onProgress('mint', done, total, msg);
    if (done % 50 === 0) onLog(`  Minted ${done}/${total}`, 'ok');
  });

  onLog(`✓ Done: ${addrs.length} NFTs minted`, 'ok');
  return { collectionAddress: collAddr, mintedCount: addrs.length, mintedAddresses: addrs };
}
