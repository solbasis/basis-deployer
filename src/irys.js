import { createGenericFile } from '@metaplex-foundation/umi';
import { getUmi } from './deploy.js';

const BATCH_SIZE = 10;
const STORAGE_KEY = 'basis-deployer-upload-state';

function saveState(s) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} }
function loadState() { try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
export function clearState() { try { localStorage.removeItem(STORAGE_KEY); } catch {} }
export function getResumeState() { return loadState(); }

export async function uploadFile(data, filename, contentType) {
  const umi = getUmi();
  if (!umi) throw new Error('Umi not initialized');
  const u8 = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  const [uri] = await umi.uploader.upload([createGenericFile(u8, filename, { contentType })]);
  return uri;
}

async function uploadBatch(files) {
  const umi = getUmi();
  if (!umi) throw new Error('Umi not initialized');
  const gf = files.map(f => createGenericFile(
    f.data instanceof Uint8Array ? f.data : new TextEncoder().encode(f.data),
    f.filename, { contentType: f.contentType }
  ));
  return await umi.uploader.upload(gf);
}

/** Extract the bare filename from a potentially path-prefixed string, e.g. "images/0.png" → "0.png" */
function bareFilename(path) {
  return path.includes('/') ? path.split('/').pop() : path;
}

/** Resolve image URI from the imageURIs map, tolerating both bare and path-prefixed keys */
function resolveImageUri(imageURIs, rawRef) {
  if (!rawRef) return '';
  // Try exact match first (bare filename)
  if (imageURIs[rawRef]) return imageURIs[rawRef];
  // Try as bare filename extracted from path
  const bare = bareFilename(rawRef);
  if (imageURIs[bare]) return imageURIs[bare];
  return '';
}

export async function uploadCollection(collectionData, onProgress, onLog) {
  const { images, metadata } = collectionData;
  const imageEntries = Object.entries(images).sort((a, b) => a[0].localeCompare(b[0]));
  const metaEntries  = Object.entries(metadata).sort((a, b) => a[0].localeCompare(b[0]));
  const totalFiles   = imageEntries.length + metaEntries.length;

  let state       = loadState();
  let imageURIs   = {};
  let metadataURIs = {};

  if (state && state.totalFiles === totalFiles) {
    imageURIs    = state.imageURIs    || {};
    metadataURIs = state.metadataURIs || {};
    const done = Object.keys(imageURIs).length + Object.keys(metadataURIs).length;
    if (done > 0) onLog('Resuming — ' + done + ' files already uploaded', 'ok');
  }

  // Phase 1: Images
  const imgTodo = imageEntries.filter(([p]) => !imageURIs[bareFilename(p)]);
  if (imgTodo.length > 0) onLog('Uploading ' + imgTodo.length + ' images (batches of ' + BATCH_SIZE + ')…', 'info');

  for (let i = 0; i < imgTodo.length; i += BATCH_SIZE) {
    const batch = imgTodo.slice(i, i + BATCH_SIZE);
    const files = [];
    for (const [path, entry] of batch) {
      const buf  = await entry.async('uint8array');
      const fn   = bareFilename(path);
      const ext  = fn.split('.').pop().toLowerCase();
      const mime = ext === 'png' ? 'image/png'
        : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
        : ext === 'webp' ? 'image/webp'
        : ext === 'gif'  ? 'image/gif'
        : 'image/png';
      files.push({ data: buf, filename: fn, contentType: mime });
    }
    try {
      const uris = await uploadBatch(files);
      for (let j = 0; j < files.length; j++) imageURIs[files[j].filename] = uris[j];
    } catch (err) {
      onLog('Batch failed, retrying individually: ' + err.message, 'warn');
      for (const f of files) {
        if (imageURIs[f.filename]) continue;
        try { imageURIs[f.filename] = await uploadFile(f.data, f.filename, f.contentType); }
        catch (e2) { onLog('  Skip ' + f.filename + ': ' + e2.message, 'err'); }
      }
    }
    onProgress(
      Object.keys(imageURIs).length + Object.keys(metadataURIs).length,
      totalFiles,
      'Images: ' + Object.keys(imageURIs).length + '/' + imageEntries.length
    );
    saveState({ totalFiles, imageURIs, metadataURIs });
  }
  if (imageEntries.length > 0) onLog('✓ ' + Object.keys(imageURIs).length + ' images uploaded', 'ok');

  // Phase 2: Metadata — patch image URIs before uploading
  const metaTodo = metaEntries.filter(([p]) => !metadataURIs[bareFilename(p)]);
  if (metaTodo.length > 0) onLog('Uploading ' + metaTodo.length + ' metadata (batches of ' + BATCH_SIZE + ')…', 'info');

  for (let i = 0; i < metaTodo.length; i += BATCH_SIZE) {
    const batch = metaTodo.slice(i, i + BATCH_SIZE);
    const files = [];
    for (const [path, entry] of batch) {
      const text    = await entry.async('text');
      const metaObj = JSON.parse(text);
      const fn      = bareFilename(path);

      // Resolve the image URI using the bare filename, tolerating path prefixes in metadata
      const resolvedImageUri = resolveImageUri(imageURIs, metaObj.image);
      if (resolvedImageUri) {
        metaObj.image = resolvedImageUri;
        if (metaObj.properties?.files?.[0]) metaObj.properties.files[0].uri = resolvedImageUri;
      } else if (metaObj.image) {
        onLog('  Warning: no uploaded URI found for image reference "' + metaObj.image + '" in ' + fn, 'warn');
      }

      files.push({ data: JSON.stringify(metaObj, null, 2), filename: fn, contentType: 'application/json' });
    }
    try {
      const uris = await uploadBatch(files);
      for (let j = 0; j < files.length; j++) metadataURIs[files[j].filename] = uris[j];
    } catch (err) {
      onLog('Batch failed, retrying individually: ' + err.message, 'warn');
      for (const f of files) {
        if (metadataURIs[f.filename]) continue;
        try { metadataURIs[f.filename] = await uploadFile(f.data, f.filename, f.contentType); }
        catch (e2) { onLog('  Skip ' + f.filename + ': ' + e2.message, 'err'); }
      }
    }
    onProgress(
      Object.keys(imageURIs).length + Object.keys(metadataURIs).length,
      totalFiles,
      'Metadata: ' + Object.keys(metadataURIs).length + '/' + metaEntries.length
    );
    saveState({ totalFiles, imageURIs, metadataURIs });
  }
  if (metaEntries.length > 0) onLog('✓ ' + Object.keys(metadataURIs).length + ' metadata uploaded', 'ok');

  clearState();
  return { imageURIs, metadataURIs };
}
