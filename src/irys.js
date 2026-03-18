/**
 * ASSET UPLOADER — Uses Umi's built-in Irys uploader plugin.
 * No separate funding step needed. Umi handles payment automatically.
 */
import { createGenericFile } from '@metaplex-foundation/umi';
import { getUmi } from './deploy.js';

export async function uploadFile(data, filename, contentType) {
  const umi = getUmi();
  if (!umi) throw new Error('Umi not initialized');
  const u8 = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  const file = createGenericFile(u8, filename, { contentType });
  const [uri] = await umi.uploader.upload([file]);
  return uri;
}

export async function uploadCollection(collectionData, onProgress) {
  const umi = getUmi();
  if (!umi) throw new Error('Umi not initialized');
  const { images, metadata } = collectionData;
  const imageEntries = Object.entries(images);
  const metaEntries = Object.entries(metadata);
  const total = imageEntries.length + metaEntries.length;
  let done = 0;
  const imageURIs = {};
  const metadataURIs = {};

  onProgress(0, total, 'Starting image uploads…');

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

  for (const [path, entry] of metaEntries) {
    const text = await entry.async('text');
    const metaObj = JSON.parse(text);
    const filename = path.split('/').pop();
    const imgFilename = metaObj.image;
    if (imageURIs[imgFilename]) {
      metaObj.image = imageURIs[imgFilename];
      if (metaObj.properties?.files?.[0]) metaObj.properties.files[0].uri = imageURIs[imgFilename];
    }
    const updatedJson = JSON.stringify(metaObj, null, 2);
    const uri = await uploadFile(updatedJson, filename, 'application/json');
    metadataURIs[filename] = uri;
    done++;
    onProgress(done, total, `Metadata ${done - imageEntries.length}/${metaEntries.length}: ${filename}`);
  }

  return { imageURIs, metadataURIs };
}
