import Irys from '@irys/sdk';
import { getAdapter, getConnection } from './wallet.js';

let irysInstance = null;

/**
 * Initialize Irys with the connected wallet.
 * Irys uses the wallet adapter to sign fund/upload transactions.
 */
export async function initIrys(network) {
  const adapter = getAdapter();
  if (!adapter) throw new Error('Wallet not connected');

  const irysNetwork = network === 'mainnet-beta' ? 'mainnet' : 'devnet';
  const rpcUrl = network === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';

  // Irys requires a provider-compatible wallet
  // The wallet adapter's signTransaction/signAllTransactions is used
  const irys = new Irys({
    network: irysNetwork,
    token: 'solana',
    wallet: {
      rpcUrl,
      name: 'solana',
      provider: adapter,
    },
  });

  await irys.ready();
  irysInstance = irys;
  return irys;
}

/**
 * Get the cost to upload a given number of bytes to Arweave.
 * Returns cost in SOL.
 */
export async function getUploadPrice(bytes) {
  if (!irysInstance) throw new Error('Irys not initialized');
  const price = await irysInstance.getPrice(bytes);
  // price is in atomic units (lamports for Solana)
  return Number(price) / 1e9;
}

/**
 * Fund the Irys node with enough SOL to cover uploads.
 * This transfers SOL from the wallet to Irys.
 */
export async function fundIrys(amountInSOL) {
  if (!irysInstance) throw new Error('Irys not initialized');
  const lamports = Math.ceil(amountInSOL * 1e9);
  const fundTx = await irysInstance.fund(lamports);
  return fundTx;
}

/**
 * Upload a single file to Arweave via Irys.
 * Returns the Arweave URI (https://arweave.net/{txId}).
 *
 * @param {Buffer|Uint8Array} data - File contents
 * @param {string} contentType - MIME type (e.g. 'image/png')
 * @param {Object} tags - Additional Arweave tags
 * @returns {string} Arweave URI
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
 * 
 * Flow:
 * 1. Calculate total upload cost
 * 2. Fund Irys
 * 3. Upload each image → get Arweave URI
 * 4. Update metadata JSON with real image URIs
 * 5. Upload each metadata JSON → get Arweave URI
 * 
 * @param {Object} collectionData - Parsed ZIP data from the builder
 * @param {Function} onProgress - Callback (done, total, message)
 * @returns {Object} { imageURIs: {}, metadataURIs: {} }
 */
export async function uploadCollection(collectionData, onProgress) {
  const { images, metadata } = collectionData;
  const imageEntries = Object.entries(images);
  const metaEntries = Object.entries(metadata);
  const total = imageEntries.length + metaEntries.length;
  let done = 0;

  const imageURIs = {};
  const metadataURIs = {};

  // 1. Calculate total size for cost estimate
  let totalSize = 0;
  for (const [, entry] of imageEntries) {
    const buf = await entry.async('arraybuffer');
    totalSize += buf.byteLength;
  }
  for (const [, entry] of metaEntries) {
    const text = await entry.async('text');
    totalSize += new TextEncoder().encode(text).length;
  }

  onProgress(0, total, `Calculating upload cost for ${(totalSize / 1024 / 1024).toFixed(1)} MB…`);

  // 2. Get price and fund
  const costSOL = await getUploadPrice(totalSize);
  const fundAmount = costSOL * 1.1; // 10% buffer
  onProgress(0, total, `Funding Irys with ${fundAmount.toFixed(4)} SOL…`);
  await fundIrys(fundAmount);

  // 3. Upload images
  for (const [path, entry] of imageEntries) {
    const buf = await entry.async('arraybuffer');
    const filename = path.split('/').pop();
    const ext = filename.split('.').pop().toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp';

    const uri = await uploadFile(Buffer.from(buf), mime);
    imageURIs[filename] = uri;

    done++;
    onProgress(done, total, `Uploading image ${done}/${imageEntries.length}: ${filename}`);
  }

  // 4. Upload metadata (with updated image URIs)
  for (const [path, entry] of metaEntries) {
    const text = await entry.async('text');
    const metaObj = JSON.parse(text);
    const filename = path.split('/').pop();
    const imgFilename = metaObj.image;

    // Replace image filename with Arweave URI
    if (imageURIs[imgFilename]) {
      metaObj.image = imageURIs[imgFilename];
      if (metaObj.properties?.files?.[0]) {
        metaObj.properties.files[0].uri = imageURIs[imgFilename];
      }
    }

    const updatedJson = JSON.stringify(metaObj, null, 2);
    const uri = await uploadFile(
      Buffer.from(updatedJson),
      'application/json'
    );
    metadataURIs[filename] = uri;

    done++;
    onProgress(done, total, `Uploading metadata ${done - imageEntries.length}/${metaEntries.length}: ${filename}`);
  }

  return { imageURIs, metadataURIs };
}
