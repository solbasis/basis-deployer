import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys/web';
import { createCollection, mplCore } from '@metaplex-foundation/mpl-core';
import {
  mplCandyMachine,
  create,
  addConfigLines,
} from '@metaplex-foundation/mpl-core-candy-machine';
import {
  generateSigner,
  publicKey,
  some,
  sol,
  dateTime,
} from '@metaplex-foundation/umi';
import { getAdapter } from './wallet.js';
import { RPC_ENDPOINTS } from './rpc.js';

let umi = null;

export function initUmi(network) {
  const adapter = getAdapter();
  if (!adapter) throw new Error('Wallet not connected');
  umi = createUmi(RPC_ENDPOINTS[network])
    .use(walletAdapterIdentity(adapter))
    .use(mplCore())
    .use(mplCandyMachine())
    .use(irysUploader());
  return umi;
}

export function getUmi() { return umi; }

// Step 1: Create collection (~0.015 SOL, 1 tx)
export async function createOnChainCollection(config, onLog) {
  if (!umi) throw new Error('Umi not initialized');
  onLog('Generating collection keypair…', 'info');
  const signer = generateSigner(umi);
  onLog(`Creating collection: ${config.name}…`, 'info');
  await createCollection(umi, {
    collection: signer,
    name: config.name,
    uri: config.collectionUri,
  }).sendAndConfirm(umi);
  const addr = signer.publicKey.toString();
  onLog(`✓ Collection: ${addr}`, 'ok');
  return { address: addr, signer };
}

// Step 2: Create Candy Machine (~0.02 SOL, 1 tx)
export async function createCandyMachine(config, collectionSigner, onLog) {
  if (!umi) throw new Error('Umi not initialized');
  onLog('Creating Candy Machine…', 'info');
  const cmSigner = generateSigner(umi);
  const guards = {};
  if (config.mintPrice > 0) {
    guards.solPayment = some({
      lamports: sol(config.mintPrice),
      destination: publicKey(config.treasury || umi.identity.publicKey.toString()),
    });
  }
  if (config.startDate) {
    guards.startDate = some({ date: dateTime(config.startDate) });
  }
  if (config.mintLimit > 0) {
    guards.mintLimit = some({ id: 1, limit: config.mintLimit });
  }
  await create(umi, {
    candyMachine: cmSigner,
    collection: collectionSigner.publicKey,
    collectionUpdateAuthority: umi.identity,
    itemsAvailable: config.totalItems,
    configLineSettings: some({
      prefixName: '',
      nameLength: 32,
      prefixUri: '',
      uriLength: 200,
      isSequential: false,
    }),
    guards,
  }).sendAndConfirm(umi);
  const addr = cmSigner.publicKey.toString();
  onLog(`✓ Candy Machine: ${addr}`, 'ok');
  onLog(`  Supply: ${config.totalItems} | Price: ${config.mintPrice || 'FREE'} SOL`, 'info');
  return { address: addr, signer: cmSigner };
}

// Step 3: Add config lines in batches (~10 per tx)
export async function addItems(cmAddr, items, onProgress, onLog) {
  if (!umi) throw new Error('Umi not initialized');
  const pk = publicKey(cmAddr);
  const BATCH = 10;
  const batches = Math.ceil(items.length / BATCH);
  onLog(`Adding ${items.length} items in ${batches} batches…`, 'info');
  for (let b = 0; b < batches; b++) {
    const start = b * BATCH;
    const end = Math.min(start + BATCH, items.length);
    const lines = items.slice(start, end).map(i => ({ name: i.name, uri: i.uri }));
    try {
      await addConfigLines(umi, {
        candyMachine: pk,
        index: start,
        configLines: lines,
      }).sendAndConfirm(umi);
      onProgress(end, items.length, `Added ${end}/${items.length}`);
    } catch (err) {
      onLog(`  Batch ${b + 1} failed: ${err.message} — retrying…`, 'warn');
      await new Promise(r => setTimeout(r, 2000));
      try {
        await addConfigLines(umi, { candyMachine: pk, index: start, configLines: lines }).sendAndConfirm(umi);
        onProgress(end, items.length, `Retried ${end}/${items.length}`);
      } catch (e2) { onLog(`  Retry failed: ${e2.message}`, 'err'); }
    }
    if (b % 3 === 0 && b > 0) await new Promise(r => setTimeout(r, 500));
  }
  onLog(`✓ All ${items.length} items loaded`, 'ok');
}

// Full pipeline
export async function fullDeploy(config, metadataURIs, collectionMetaURI, onProgress, onLog) {
  onLog('══ STEP 1/3: Create Collection ══', 'info');
  onProgress('step', 0, 100, 'Creating collection…');
  const coll = await createOnChainCollection({ name: config.name, collectionUri: collectionMetaURI }, onLog);
  onProgress('step', 10, 100, 'Collection created');

  onLog('══ STEP 2/3: Create Candy Machine ══', 'info');
  const items = Object.entries(metadataURIs)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([fn, uri]) => ({ name: `${config.name} #${fn.replace('.json', '')}`, uri }));
  const cm = await createCandyMachine({
    totalItems: items.length,
    mintPrice: config.mintPrice || 0,
    startDate: config.startDate || null,
    mintLimit: config.mintLimit || 0,
    treasury: config.creatorAddress,
  }, coll.signer, onLog);
  onProgress('step', 30, 100, 'Candy Machine created');

  onLog('══ STEP 3/3: Loading Items ══', 'info');
  await addItems(cm.address, items, (done, total, msg) => {
    const pct = 30 + (done / total) * 70;
    onProgress('step', pct, 100, msg);
  }, onLog);
  onProgress('step', 100, 100, 'Done!');

  onLog('', 'info');
  onLog('══ DEPLOYMENT COMPLETE ══', 'ok');
  onLog(`Collection: ${coll.address}`, 'ok');
  onLog(`Candy Machine: ${cm.address}`, 'ok');
  onLog(`Items: ${items.length} | Price: ${config.mintPrice || 'FREE'} SOL`, 'ok');
  onLog('Buyers mint on demand — auto-listed on Magic Eden & Tensor.', 'info');

  return { collectionAddress: coll.address, candyMachineAddress: cm.address, itemsLoaded: items.length };
}
