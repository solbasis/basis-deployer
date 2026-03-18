/**
 * ASSET UPLOADER — Uses Metaplex Umi's native uploader
 * 
 * Irys's Solana bundler is currently unreliable (funding tx confirmation failures).
 * Instead, we upload directly using Umi's built-in generic uploader which
 * creates Arweave-compatible URIs via the Metaplex storage provider.
 * 
 * For production at scale, you can also:
 * - Use nft.storage (free, IPFS)  
 * - Use Pinata (IPFS, generous free tier)
 * - Use Shadow Drive (Solana-native storage)
 */

import { createGenericFile } from '@metaplex-foundation/umi';

let umiRef = null;

export function setUmi(umi) {
  umiRef = umi;
}

/**
 * Upload a single file using Umi's uploader.
 * Returns the URI string.
 */
export async function uploadFile(data, filename, contentType) {
  if (!umiRef) throw new Error('Umi not initialized');
  
  const file = createGenericFile(
    data instanceof Uint8Array ? data : new TextEncoder().encode(data),
    filename,
    { contentType }
  );
  
  const [uri] = await umiRef.uploader.upload([file]);
  return uri;
}

/**
 * Upload all collection assets (images + metadata).
 * No separate funding step needed — Umi handles payment automatically.
 */
export async function uploadCollection(collectionData, onProgress) {
  const { images, metadata } = collectionData;
  const imageEntries = Object.entries(images);
  const metaEntries = Object.entries(metadata);
  const total = imageEntries.length + metaEntries.length;
  let done = 0;

  const imageURIs = {};
  const metadataURIs = {};

  onProgress(0, total, 'Starting image uploads…');

  // Upload images
  for (const [path, entry] of imageEntries) {
    const buf = await entry.async('uint8array');
    const filename = path.split('/').pop();
    const ext = filename.split('.').pop().toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp';

    const uri = await uploadFile(buf, filename, mime);
    imageURIs[filename] = uri;

    done++;
    onProgress(done, total, `Image ${done}/${imageEntries.length}: ${filename}`);
  }

  onProgress(done, total, 'Images done. Uploading metadata…');

  // Upload metadata with updated image URIs
  for (const [path, entry] of metaEntries) {
    const text = await entry.async('text');
    const metaObj = JSON.parse(text);
    const filename = path.split('/').pop();
    const imgFilename = metaObj.image;

    // Replace local image filename with Arweave/IPFS URI
    if (imageURIs[imgFilename]) {
      metaObj.image = imageURIs[imgFilename];
      if (metaObj.properties?.files?.[0]) {
        metaObj.properties.files[0].uri = imageURIs[imgFilename];
      }
    }

    const updatedJson = JSON.stringify(metaObj, null, 2);
    const uri = await uploadFile(updatedJson, filename, 'application/json');
    metadataURIs[filename] = uri;

    done++;
    onProgress(done, total, `Metadata ${done - imageEntries.length}/${metaEntries.length}: ${filename}`);
  }

  return { imageURIs, metadataURIs };
}
