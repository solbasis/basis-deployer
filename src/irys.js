import { WebUploader } from '@irys/web-upload';
import { WebSolana } from '@irys/web-upload-solana';
import { getAdapter } from './wallet.js';
import { RPC_ENDPOINTS } from './rpc.js';

let irysInstance = null;

/**
 * Initialize Irys web uploader with the connected Solana wallet.
 */
export async function initIrys(network) {
  const adapter = getAdapter();
  if (!adapter) throw new Error('Wallet not connected');

  const rpcUrl = RPC_ENDPOINTS[network];
  const isDevnet = network !== 'mainnet-beta';

  const irys = await WebUploader(WebSolana)
    .withProvider(adapter)
    .withRpc(rpcUrl)
    .devnet(isDevnet)
    .build();

  irysInstance = irys;
  return irys;
}

/**
 * Get the cost to upload a given number of bytes.
 * Returns cost in SOL.
 */
export async function getUploadPrice(bytes) {
  if (!irysInstance) throw new Error('Irys not initialized');
  const price = await irysInstance.getPrice(bytes);
  return Number(price) / 1e9;
}

/**
 * Fund the Irys node with SOL for uploads.
 * Includes retry logic for devnet confirmation delays.
 */
export async function fundIrys(amountInSOL) {
  if (!irysInstance) throw new Error('Irys not initialized');
  const lamports = Math.ceil(amountInSOL * 1e9);

  // Retry up to 3 times — devnet confirmations can be slow
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Wait before retry to let the tx confirm
      if (attempt > 1) {
        await new Promise(r => setTimeout(r, 5000));
      }
      const fundTx = await irysInstance.fund(lamports);
      return fundTx;
    } catch (err) {
      lastError = err;
      // If it's a "confirmed tx not found" error, wait and retry
      if (err.message && err.message.includes('Confirmed tx not found')) {
        console.log(`Funding attempt ${attempt}/3 — waiting for confirmation...`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }
      // For other errors, throw immediately
      throw err;
    }
  }
  throw lastError;
}

/**
 * Upload a single file to Arweave via Irys.
 * Returns the Arweave URI.
 */
export async function uploadFile(data, contentType, tags = {}) {
  if (!irysInstance) throw new Error('Irys not initialized');

  const allTags = [
    { name: 'Content-Type', value: contentType },
    ...Object.entries(tags).map(([name, value]) => ({ name, value })),
  ];

  const receipt = await irysInstance.upload(data, { tags: allTags });
  return `https://arweave.net/${receipt.id}`;
}

/**
 * Upload all collection assets (images + metadata).
 */
export async function uploadCollection(collectionData, onProgress) {
  const { images, metadata } = collectionData;
  const imageEntries = Object.entries(images);
  const metaEntries = Object.entries(metadata);
  const total = imageEntries.length + metaEntries.length;
  let done = 0;

  const imageURIs = {};
  const metadataURIs = {};

  // Calculate total size
  let totalSize = 0;
  for (const [, entry] of imageEntries) {
    const buf = await entry.async('arraybuffer');
    totalSize += buf.byteLength;
  }
  for (const [, entry] of metaEntries) {
    const text = await entry.async('text');
    totalSize += new TextEncoder().encode(text).length;
  }

  onProgress(0, total, `Calculating cost for ${(totalSize / 1024 / 1024).toFixed(1)} MB…`);

  // Get price and fund with buffer
  const costSOL = await getUploadPrice(totalSize);
  const fundAmount = costSOL * 1.2; // 20% buffer for safety
  onProgress(0, total, `Funding Irys with ${fundAmount.toFixed(4)} SOL (approve in wallet)…`);
  await fundIrys(fundAmount);
  onProgress(0, total, `Funded! Starting uploads…`);

  // Upload images
  for (const [path, entry] of imageEntries) {
    const buf = await entry.async('uint8array');
    const filename = path.split('/').pop();
    const ext = filename.split('.').pop().toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp';

    const uri = await uploadFile(buf, mime);
    imageURIs[filename] = uri;

    done++;
    onProgress(done, total, `Uploading image ${done}/${imageEntries.length}: ${filename}`);
  }

  // Upload metadata with updated image URIs
  for (const [path, entry] of metaEntries) {
    const text = await entry.async('text');
    const metaObj = JSON.parse(text);
    const filename = path.split('/').pop();
    const imgFilename = metaObj.image;

    if (imageURIs[imgFilename]) {
      metaObj.image = imageURIs[imgFilename];
      if (metaObj.properties?.files?.[0]) {
        metaObj.properties.files[0].uri = imageURIs[imgFilename];
      }
    }

    const updatedJson = new TextEncoder().encode(JSON.stringify(metaObj, null, 2));
    const uri = await uploadFile(updatedJson, 'application/json');
    metadataURIs[filename] = uri;

    done++;
    onProgress(done, total, `Uploading metadata ${done - imageEntries.length}/${metaEntries.length}: ${filename}`);
  }

  return { imageURIs, metadataURIs };
}
