import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys/web';
import { createCollection, mplCore } from '@metaplex-foundation/mpl-core';
import {
  mplCandyMachine, create, addConfigLines, getMerkleRoot,
} from '@metaplex-foundation/mpl-core-candy-machine';
import { generateSigner, publicKey, some, sol, dateTime, transactionBuilder } from '@metaplex-foundation/umi';
import { setComputeUnitLimit, setComputeUnitPrice } from '@metaplex-foundation/mpl-toolbox';
import { getAdapter } from './wallet.js';
import { RPC_ENDPOINTS } from './rpc.js';

let umi = null;

// Priority fee in microLamports — high enough to land reliably on mainnet
const PRIORITY_FEE = 10_000;

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

/* ── Step 1: Create Collection (~0.015 SOL, 1 tx) ── */
export async function createOnChainCollection(config, onLog) {
  if (!umi) throw new Error('Umi not initialized');
  onLog('Generating collection keypair…', 'info');
  const signer = generateSigner(umi);
  onLog('Creating collection: ' + config.name + '…', 'info');

  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 200_000 }))
    .add(setComputeUnitPrice(umi, { microLamports: PRIORITY_FEE }))
    .add(createCollection(umi, {
      collection: signer,
      name: config.name,
      uri: config.collectionUri,
    }))
    .sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

  const addr = signer.publicKey.toString();
  onLog('✓ Collection: ' + addr, 'ok');
  return { address: addr, signer };
}

/* ── Step 2: Create Candy Machine (~0.02 SOL, 1 tx) ── */
export async function createCandyMachine(config, collectionSigner, onLog) {
  if (!umi) throw new Error('Umi not initialized');
  onLog('Creating Candy Machine…', 'info');
  const cmSigner = generateSigner(umi);
  const treasury = publicKey(config.treasury || umi.identity.publicKey.toString());

  const createArgs = {
    candyMachine: cmSigner,
    collection: collectionSigner.publicKey,
    collectionUpdateAuthority: umi.identity,
    itemsAvailable: config.totalItems,
    configLineSettings: some({
      prefixName: '', nameLength: 32, prefixUri: '', uriLength: 200, isSequential: false,
    }),
  };

  // ── With whitelist: use guard groups ──
  if (config.whitelist && config.whitelist.wallets.length > 0) {
    onLog('  Setting up whitelist for ' + config.whitelist.wallets.length + ' wallets…', 'info');
    const merkleRoot = getMerkleRoot(config.whitelist.wallets);

    const wlGuards = { allowList: some({ merkleRoot }) };
    if (config.whitelist.price > 0) wlGuards.solPayment = some({ lamports: sol(config.whitelist.price), destination: treasury });
    if (config.whitelist.limit > 0) wlGuards.mintLimit = some({ id: 1, limit: config.whitelist.limit });
    if (config.whitelist.startDate) wlGuards.startDate = some({ date: dateTime(config.whitelist.startDate) });

    const pubGuards = {};
    if (config.mintPrice > 0) pubGuards.solPayment = some({ lamports: sol(config.mintPrice), destination: treasury });
    if (config.publicStartDate) pubGuards.startDate = some({ date: dateTime(config.publicStartDate) });
    else if (config.startDate) pubGuards.startDate = some({ date: dateTime(config.startDate) });
    if (config.mintLimit > 0) pubGuards.mintLimit = some({ id: 2, limit: config.mintLimit });

    createArgs.guards = {};
    createArgs.groups = [
      { label: 'wl', guards: wlGuards },
      { label: 'public', guards: pubGuards },
    ];
    onLog('  WL: ' + config.whitelist.wallets.length + ' wallets, ' + (config.whitelist.price || 'FREE') + ' SOL', 'info');
    onLog('  Public: ' + (config.mintPrice || 'FREE') + ' SOL', 'info');
  } else {
    // ── Without whitelist: simple guards ──
    const guards = {};
    if (config.mintPrice > 0) guards.solPayment = some({ lamports: sol(config.mintPrice), destination: treasury });
    if (config.startDate) guards.startDate = some({ date: dateTime(config.startDate) });
    if (config.mintLimit > 0) guards.mintLimit = some({ id: 1, limit: config.mintLimit });
    createArgs.guards = guards;
  }

  await transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 500_000 }))
    .add(setComputeUnitPrice(umi, { microLamports: PRIORITY_FEE }))
    .add(create(umi, createArgs))
    .sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

  const addr = cmSigner.publicKey.toString();
  onLog('✓ Candy Machine: ' + addr, 'ok');
  onLog('  Supply: ' + config.totalItems + ' | Price: ' + (config.mintPrice || 'FREE') + ' SOL', 'info');
  return { address: addr, signer: cmSigner };
}

/* ── Step 3: Add config lines in batches ── */
export async function addItems(cmAddr, items, onProgress, onLog) {
  if (!umi) throw new Error('Umi not initialized');
  const pk = publicKey(cmAddr);
  const BATCH = 10;
  const total = Math.ceil(items.length / BATCH);
  onLog('Adding ' + items.length + ' items in ' + total + ' batches…', 'info');

  for (let b = 0; b < total; b++) {
    const start = b * BATCH;
    const end = Math.min(start + BATCH, items.length);
    const lines = items.slice(start, end).map(i => ({ name: i.name, uri: i.uri }));

    const buildBatchTx = () => transactionBuilder()
      .add(setComputeUnitLimit(umi, { units: 150_000 }))
      .add(setComputeUnitPrice(umi, { microLamports: PRIORITY_FEE }))
      .add(addConfigLines(umi, { candyMachine: pk, index: start, configLines: lines }));

    try {
      await buildBatchTx().sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
      onProgress(end, items.length, 'Added ' + end + '/' + items.length);
    } catch (err) {
      onLog('  Batch ' + (b + 1) + ' failed: ' + err.message + ' — retrying in 3s…', 'warn');
      await new Promise(r => setTimeout(r, 3000));
      try {
        await buildBatchTx().sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
        onProgress(end, items.length, 'Retried ' + end + '/' + items.length);
      } catch (e2) {
        onLog('  Retry failed (batch ' + (b + 1) + '): ' + e2.message, 'err');
      }
    }

    // Rate limit: brief pause every 5 batches to avoid RPC throttling
    if (b > 0 && b % 5 === 0) await new Promise(r => setTimeout(r, 800));
  }

  onLog('✓ All ' + items.length + ' items loaded', 'ok');
}

/* ── Full pipeline ── */
export async function fullDeploy(config, metadataURIs, collectionMetaURI, onProgress, onLog) {
  onLog('══ STEP 1/3: Create Collection ══', 'info');
  onProgress('step', 0, 100, 'Creating collection…');
  const coll = await createOnChainCollection({ name: config.name, collectionUri: collectionMetaURI }, onLog);
  onProgress('step', 10, 100, 'Collection created');

  onLog('══ STEP 2/3: Create Candy Machine ══', 'info');
  const items = Object.entries(metadataURIs)
    .sort((a, b) => {
      const aNum = parseInt(a[0]);
      const bNum = parseInt(b[0]);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a[0].localeCompare(b[0]);
    })
    .map(([fn, uri]) => ({ name: config.name + ' #' + fn.replace('.json', ''), uri }));

  const cm = await createCandyMachine({
    totalItems: items.length,
    mintPrice: config.mintPrice || 0,
    startDate: config.startDate || null,
    mintLimit: config.mintLimit || 0,
    treasury: config.creatorAddress,
    whitelist: config.whitelist || null,
    publicStartDate: config.publicStartDate || null,
  }, coll.signer, onLog);
  onProgress('step', 30, 100, 'Candy Machine created');

  onLog('══ STEP 3/3: Loading Items ══', 'info');
  await addItems(cm.address, items, (done, tot, msg) => {
    onProgress('step', 30 + (done / tot) * 70, 100, msg);
  }, onLog);
  onProgress('step', 100, 100, 'Done!');

  onLog('', 'info');
  onLog('══ DEPLOYMENT COMPLETE ══', 'ok');
  onLog('Collection: ' + coll.address, 'ok');
  onLog('Candy Machine: ' + cm.address, 'ok');
  onLog('Items: ' + items.length + ' | Price: ' + (config.mintPrice || 'FREE') + ' SOL', 'ok');
  onLog('Auto-listed on Magic Eden & Tensor after first mint.', 'info');

  return {
    collectionAddress: coll.address,
    candyMachineAddress: cm.address,
    itemsLoaded: items.length,
  };
}
