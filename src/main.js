import './style.css';
import { Buffer } from 'buffer';
import JSZip from 'jszip';
import { connectWallet, disconnectWallet, getBalance, getPublicKey } from './wallet.js';
import { uploadCollection, uploadFile } from './irys.js';
import { initUmi, getUmi, fullDeploy } from './deploy.js';

// Polyfill Buffer for browser
window.Buffer = Buffer;

/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
let network = 'mainnet-beta';
let walletConnected = false;
let collectionData = null;
let uploadedURIs = null;
let deployResult = null;

const $ = id => document.getElementById(id);
function showSt(id, msg, t = 'info') {
  const e = $(id); if (!e) return;
  e.textContent = msg; e.className = `status-bar show ${t}`;
}
function hideSt(id) { $(id)?.classList.remove('show'); }
function setProg(f, p, l, pct, lbl) {
  const a = $(f), b = $(p), c = $(l);
  if (a) a.style.width = pct + '%';
  if (b) b.textContent = Math.round(pct) + '%';
  if (c && lbl) c.textContent = lbl;
}
function showProg(id) { $(id)?.classList.add('show'); }
function log(id, msg, type = 'info') {
  const el = $(id); if (!el) return;
  el.style.display = 'block';
  el.innerHTML += `<div class="log-${type}">[${new Date().toLocaleTimeString()}] ${msg}</div>`;
  el.scrollTop = el.scrollHeight;
}

/* ══════════════════════════════════════
   RENDER UI
══════════════════════════════════════ */
document.getElementById('app').innerHTML = `
<div class="wrap">
  <div class="hdr">
    <div>
      <div class="logo">BASIS://DEPLOYER</div>
      <div class="logo-sub">Metaplex Core · Solana · Arweave</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span class="net-badge net-main" id="netBadge">MAINNET</span>
      <button class="net-toggle" id="netToggle">Switch to Devnet</button>
    </div>
  </div>

  <div class="dev-banner" id="devBanner">⚠ DEVNET MODE — No real SOL will be spent. Get test SOL from <a href="https://faucet.solana.com" target="_blank" style="color:var(--warn);text-decoration:underline">faucet.solana.com</a></div>

  <div class="steps" id="stepsNav">
    <div class="step-tab active" data-step="1"><span class="step-num">1</span>Wallet</div>
    <div class="step-tab locked" data-step="2"><span class="step-num">2</span>Collection</div>
    <div class="step-tab locked" data-step="3"><span class="step-num">3</span>Configure</div>
    <div class="step-tab locked" data-step="4"><span class="step-num">4</span>Upload</div>
    <div class="step-tab locked" data-step="5"><span class="step-num">5</span>Deploy</div>
    <div class="step-tab locked" data-step="6"><span class="step-num">6</span>Live!</div>
  </div>

  <!-- STEP 1: WALLET -->
  <div class="step-content active" id="step-1">
    <div class="panel">
      <div class="pbar"><div class="pbar-l"><div class="pdots"><span class="pdot"></span><span class="pdot"></span><span class="pdot"></span></div><div class="plbl">Wallet</div></div><div class="psts" id="walletSts">Disconnected</div></div>
      <h2>> Connect Solana Wallet</h2>
      <p style="font-size:.66rem;color:var(--text-dim);margin-bottom:14px;line-height:1.7">This wallet becomes the <strong style="color:var(--text)">update authority</strong> for your collection.</p>
      <div id="walletDisconnected">
        <div class="btn-row" style="margin-top:0">
          <button class="btn btn-p btn-lg" id="connectPhantom">🟣 Connect Phantom</button>
          <button class="btn btn-lg" id="connectSolflare">🔶 Connect Solflare</button>
        </div>
      </div>
      <div id="walletConnected" style="display:none">
        <div class="wallet-info"><span>🟢</span><span>Connected:</span><span class="wallet-addr" id="walletAddr">—</span></div>
        <div class="g2" style="margin-top:10px">
          <div class="kv">
            <div class="kv-row"><span class="kv-k">Balance</span><span class="kv-v wallet-bal" id="walletBal">—</span></div>
            <div class="kv-row"><span class="kv-k">Network</span><span class="kv-v" id="walletNet">Mainnet</span></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;justify-content:center">
            <button class="btn btn-p btn-full" id="nextStep1">Continue →</button>
            <button class="btn btn-full btn-d" id="disconnectBtn">Disconnect</button>
          </div>
        </div>
      </div>
      <div class="status-bar" id="walletStatus"></div>
    </div>
  </div>

  <!-- STEP 2: LOAD ZIP -->
  <div class="step-content" id="step-2">
    <div class="panel">
      <div class="pbar"><div class="pbar-l"><div class="pdots"><span class="pdot"></span><span class="pdot"></span><span class="pdot"></span></div><div class="plbl">Collection</div></div><div class="psts" id="colSts">Not Loaded</div></div>
      <h2>> Load Collection ZIP</h2>
      <p style="font-size:.66rem;color:var(--text-dim);margin-bottom:14px">Upload the ZIP exported from <strong style="color:var(--text)">BASIS NFT Builder</strong>.</p>
      <div class="upload-zone" id="zipZone">
        <div style="font-size:1.5rem;opacity:.3">📦</div>
        <div style="font-size:.72rem;color:var(--text-dim)">Drop collection ZIP here</div>
        <input type="file" accept=".zip" id="zipUpload">
      </div>
      <div id="colLoaded" style="display:none;margin-top:12px">
        <div class="kv">
          <div class="kv-row"><span class="kv-k">Collection</span><span class="kv-v" id="colName">—</span></div>
          <div class="kv-row"><span class="kv-k">Items</span><span class="kv-v" id="colItems">—</span></div>
          <div class="kv-row"><span class="kv-k">Total Size</span><span class="kv-v" id="colSize">—</span></div>
        </div>
        <div class="btn-row"><button class="btn btn-p" id="nextStep2">Continue →</button><button class="btn" id="reloadZip">Reload</button></div>
      </div>
      <div class="prog-wrap" id="zipProg"><div class="prog-lbl"><span id="zipProgL">…</span><span id="zipProgP">0%</span></div><div class="prog-track"><div class="prog-fill" id="zipProgF"></div></div></div>
      <div class="status-bar" id="zipStatus"></div>
    </div>
  </div>

  <!-- STEP 3: CONFIGURE -->
  <div class="step-content" id="step-3">
    <div class="panel">
      <div class="pbar"><div class="pbar-l"><div class="pdots"><span class="pdot"></span><span class="pdot"></span><span class="pdot"></span></div><div class="plbl">Config</div></div><div class="psts">Review</div></div>
      <h2>> Collection Settings</h2>
      <div class="g2"><div class="field"><label>Name</label><input type="text" id="deployName"></div><div class="field"><label>Symbol</label><input type="text" id="deploySymbol" maxlength="10"></div></div>
      <div class="field"><label>Description</label><input type="text" id="deployDesc"></div>
      <div class="field"><label>External URL</label><input type="url" id="deployUrl"></div>
      <hr><h3>> Mint Settings</h3>
      <div class="g2"><div class="field"><label>Mint Price (SOL)</label><input type="number" id="mintPrice" value="0" min="0" step="0.01" placeholder="0 = free mint"></div><div class="field"><label>Max per Wallet</label><input type="number" id="mintLimit" value="0" min="0" placeholder="0 = unlimited"></div></div>
      <div class="g2"><div class="field"><label>Mint Start (UTC)</label><input type="text" id="mintStart" placeholder="YYYY-MM-DDTHH:MM:SS e.g. 2025-06-01T18:00:00"></div><div class="field"><label>Creator / Treasury Wallet</label><input type="text" id="deployCreator"></div></div>
      <hr><h3>> Royalties</h3>
      <div class="g2"><div class="field"><label>Royalty (bps)</label><input type="number" id="deployRoyalty" value="500" min="0" max="10000"></div><div class="field"></div></div>
      <hr><h3>> Cost Estimate</h3>
      <p style="font-size:.60rem;color:var(--text-dim);margin-bottom:6px">With Candy Machine, <strong style="color:var(--pos)">buyers pay mint cost</strong> — you only pay for setup + upload.</p>
      <div class="kv" id="costEstimate">
        <div class="kv-row"><span class="kv-k">Collection creation</span><span class="kv-v">~0.015 SOL</span></div>
        <div class="kv-row"><span class="kv-k">Candy Machine</span><span class="kv-v">~0.02 SOL</span></div>
        <div class="kv-row"><span class="kv-k">Arweave uploads</span><span class="kv-v" id="costUploads">—</span></div>
        <div class="kv-row"><span class="kv-k">Config lines (~10/tx)</span><span class="kv-v" id="costMint">—</span></div>
        <div class="kv-row" style="border-top:1px solid var(--border-hi)"><span class="kv-k" style="color:var(--text)">Total (creator pays)</span><span class="kv-v" id="costTotal" style="font-size:.74rem;color:var(--pos)">—</span></div>
      </div>
      <div class="btn-row"><button class="btn" id="backStep3">← Back</button><button class="btn btn-p" id="nextStep3">Continue →</button></div>
    </div>
  </div>

  <!-- STEP 4: UPLOAD -->
  <div class="step-content" id="step-4">
    <div class="panel">
      <div class="pbar"><div class="pbar-l"><div class="pdots"><span class="pdot"></span><span class="pdot"></span><span class="pdot"></span></div><div class="plbl">Arweave Upload</div></div><div class="psts" id="uploadSts">Ready</div></div>
      <h2>> Upload to Arweave via Irys</h2>
      <p style="font-size:.66rem;color:var(--text-dim);margin-bottom:14px">Uploads all images and metadata to permanent Arweave storage. <strong style="color:var(--warn)">This costs SOL.</strong></p>
      <div class="btn-row" style="margin-top:0"><button class="btn" id="backStep4">← Back</button><button class="btn btn-p btn-lg" id="startUpload">⬆ Fund & Upload</button></div>
      <div class="prog-wrap" id="uploadProg"><div class="prog-lbl"><span id="uploadProgL">…</span><span id="uploadProgP">0%</span></div><div class="prog-track"><div class="prog-fill" id="uploadProgF"></div></div></div>
      <div class="deploy-log" id="uploadLog" style="display:none"></div>
      <div class="status-bar" id="uploadStatus"></div>
    </div>
  </div>

  <!-- STEP 5: DEPLOY -->
  <div class="step-content" id="step-5">
    <div class="panel">
      <div class="pbar"><div class="pbar-l"><div class="pdots"><span class="pdot"></span><span class="pdot"></span><span class="pdot"></span></div><div class="plbl">Deploy</div></div><div class="psts" id="deploySts">Ready</div></div>
      <h2>> Deploy Candy Machine</h2>
      <p style="font-size:.66rem;color:var(--text-dim);margin-bottom:14px">Creates collection + Candy Machine on Solana. Buyers will mint on demand — you don't pre-mint. ~3-20 transactions total.</p>
      <div class="btn-row" style="margin-top:0"><button class="btn" id="backStep5">← Back</button><button class="btn btn-p btn-lg" id="startDeploy">🚀 Deploy</button></div>
      <div class="prog-wrap" id="deployProg"><div class="prog-lbl"><span id="deployProgL">…</span><span id="deployProgP">0%</span></div><div class="prog-track"><div class="prog-fill" id="deployProgF"></div></div></div>
      <div class="deploy-log" id="deployLog" style="display:none"></div>
      <div class="status-bar" id="deployStatus"></div>
    </div>
  </div>

  <!-- STEP 6: LIVE -->
  <div class="step-content" id="step-6">
    <div class="panel">
      <div class="pbar"><div class="pbar-l"><div class="pdots"><span class="pdot"></span><span class="pdot"></span><span class="pdot"></span></div><div class="plbl">Live</div></div><div class="psts" style="color:var(--pos)">DEPLOYED</div></div>
      <h2>> 🎉 Collection is Live!</h2>
      <div class="kv" style="margin-bottom:12px">
        <div class="kv-row"><span class="kv-k">Collection</span><span class="kv-v" id="finalAddr" style="font-size:.56rem">—</span></div>
        <div class="kv-row"><span class="kv-k">Candy Machine</span><span class="kv-v" id="finalCM" style="font-size:.56rem">—</span></div>
        <div class="kv-row"><span class="kv-k">Items Loaded</span><span class="kv-v" id="finalMinted">—</span></div>
        <div class="kv-row"><span class="kv-k">Mint Price</span><span class="kv-v" id="finalPrice">—</span></div>
        <div class="kv-row"><span class="kv-k">Network</span><span class="kv-v" id="finalNet">—</span></div>
      </div>
      <h3>> View On</h3>
      <div class="btn-row" style="margin-top:0">
        <a class="btn" id="linkSolscan" href="#" target="_blank">Solscan</a>
        <a class="btn" id="linkExplorer" href="#" target="_blank">Explorer</a>
        <a class="btn" id="linkME" href="#" target="_blank">Magic Eden</a>
        <a class="btn" id="linkTensor" href="#" target="_blank">Tensor</a>
      </div>
    </div>
  </div>
</div>
`;

/* ══════════════════════════════════════
   STEP NAVIGATION
══════════════════════════════════════ */
let currentStep = 1;
const completed = new Set();

function goToStep(n) {
  currentStep = n;
  document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.step-tab').forEach(el => {
    const s = +el.dataset.step;
    el.classList.remove('active', 'locked');
    if (s === n) el.classList.add('active');
    else if (!completed.has(s) && s > n) el.classList.add('locked');
  });
  $(`step-${n}`).classList.add('active');
}

function completeStep(n) {
  completed.add(n);
  const tab = document.querySelector(`[data-step="${n}"]`);
  if (tab) { tab.classList.add('done'); tab.classList.remove('locked'); }
  const next = document.querySelector(`[data-step="${n + 1}"]`);
  if (next) next.classList.remove('locked');
}

/* ══════════════════════════════════════
   NETWORK TOGGLE
══════════════════════════════════════ */
$('netToggle').onclick = () => {
  if (network === 'mainnet-beta') {
    network = 'devnet';
    $('netBadge').textContent = 'DEVNET'; $('netBadge').className = 'net-badge net-dev';
    $('netToggle').textContent = 'Switch to Mainnet';
    $('devBanner').classList.add('show');
  } else {
    network = 'mainnet-beta';
    $('netBadge').textContent = 'MAINNET'; $('netBadge').className = 'net-badge net-main';
    $('netToggle').textContent = 'Switch to Devnet';
    $('devBanner').classList.remove('show');
  }
};

/* ══════════════════════════════════════
   STEP 1: WALLET
══════════════════════════════════════ */
async function doConnect(provider) {
  try {
    showSt('walletStatus', 'Connecting…', 'info');
    const result = await connectWallet(provider, network);
    walletConnected = true;
    $('walletAddr').textContent = result.address.slice(0, 6) + '…' + result.address.slice(-4);
    $('walletBal').textContent = result.balance.toFixed(4) + ' SOL';
    $('walletNet').textContent = network === 'mainnet-beta' ? 'Mainnet' : 'Devnet';
    $('walletSts').textContent = 'Connected';
    $('walletDisconnected').style.display = 'none';
    $('walletConnected').style.display = 'block';
    $('deployCreator').value = result.address;
    showSt('walletStatus', `✓ Connected via ${provider}`, 'ok');
  } catch (e) {
    showSt('walletStatus', 'Failed: ' + e.message, 'err');
  }
}

$('connectPhantom').onclick = () => doConnect('phantom');
$('connectSolflare').onclick = () => doConnect('solflare');
$('disconnectBtn').onclick = async () => {
  await disconnectWallet();
  walletConnected = false;
  $('walletDisconnected').style.display = 'block';
  $('walletConnected').style.display = 'none';
  $('walletSts').textContent = 'Disconnected';
};
$('nextStep1').onclick = () => { if (!walletConnected) return; completeStep(1); goToStep(2); };

/* ══════════════════════════════════════
   STEP 2: LOAD ZIP
══════════════════════════════════════ */
$('zipUpload').onchange = async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  showProg('zipProg'); setProg('zipProgF', 'zipProgP', 'zipProgL', 10, 'Reading ZIP…');

  try {
    const zip = await JSZip.loadAsync(file);
    setProg('zipProgF', 'zipProgP', 'zipProgL', 50, 'Parsing…');

    const images = {}, metadata = {};
    let collJson = null;

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      if (path.startsWith('images/')) images[path] = entry;
      else if (path.startsWith('metadata/') && path.endsWith('.json')) metadata[path] = entry;
      else if (path === 'collection.json') collJson = JSON.parse(await entry.async('text'));
    }

    collectionData = { zip, images, metadata, collJson, file };
    const count = Math.max(Object.keys(images).length, Object.keys(metadata).length);

    $('colName').textContent = collJson?.name || 'Unknown';
    $('colItems').textContent = count;
    $('colSize').textContent = (file.size / 1024 / 1024).toFixed(1) + ' MB';
    $('colLoaded').style.display = 'block';
    $('zipZone').style.display = 'none';
    $('colSts').textContent = 'Loaded';

    // Auto-fill config
    if (collJson) {
      $('deployName').value = collJson.name || '';
      $('deploySymbol').value = collJson.symbol || '';
      $('deployDesc').value = collJson.description || '';
      $('deployUrl').value = collJson.external_url || '';
      if (collJson.seller_fee_basis_points) $('deployRoyalty').value = collJson.seller_fee_basis_points;
    }

    setProg('zipProgF', 'zipProgP', 'zipProgL', 100, 'Done');
    showSt('zipStatus', `✓ ${count} items loaded`, 'ok');
  } catch (err) {
    showSt('zipStatus', 'Error: ' + err.message, 'err');
  }
};
$('reloadZip').onclick = () => { collectionData = null; $('colLoaded').style.display = 'none'; $('zipZone').style.display = 'flex'; $('zipUpload').value = ''; };
$('nextStep2').onclick = () => { if (!collectionData) return; completeStep(2); goToStep(3); updateCosts(); };

/* ══════════════════════════════════════
   STEP 3: CONFIGURE
══════════════════════════════════════ */
function updateCosts() {
  if (!collectionData) return;
  const n = Object.keys(collectionData.images).length;
  const sizeMB = collectionData.file.size / 1024 / 1024;
  const uploadCost = (sizeMB / 1024) * 0.8 + 0.05;
  const configTxs = Math.ceil(n / 10);
  const configCost = configTxs * 0.00015;
  const total = 0.015 + 0.02 + uploadCost + configCost;
  $('costUploads').textContent = `~${uploadCost.toFixed(3)} SOL`;
  $('costMint').textContent = `${configTxs} txs (~${configCost.toFixed(4)} SOL)`;
  $('costTotal').textContent = `~${total.toFixed(3)} SOL`;
}
$('backStep3').onclick = () => goToStep(2);
$('nextStep3').onclick = () => { completeStep(3); goToStep(4); };

/* ══════════════════════════════════════
   STEP 4: UPLOAD TO ARWEAVE
══════════════════════════════════════ */
$('backStep4').onclick = () => goToStep(3);
$('startUpload').onclick = async () => {
  try {
    $('startUpload').disabled = true;
    $('uploadSts').textContent = 'UPLOADING';
    showProg('uploadProg');

    log('uploadLog', 'Initializing Umi + Irys uploader…', 'info');
    initUmi(network);
    log('uploadLog', '✓ Uploader ready', 'ok');

    log('uploadLog', 'Starting collection upload…', 'info');
    uploadedURIs = await uploadCollection(collectionData, (done, total, msg) => {
      const pct = (done / total) * 100;
      setProg('uploadProgF', 'uploadProgP', 'uploadProgL', pct, msg);
    });

    // Upload collection.json
    log('uploadLog', 'Uploading collection metadata…', 'info');
    const collJsonStr = JSON.stringify({
      ...collectionData.collJson,
      image: uploadedURIs.imageURIs['0.png'] || uploadedURIs.imageURIs['0.jpg'] || '',
    }, null, 2);
    const { createGenericFile } = await import('@metaplex-foundation/umi');
    const collFile = createGenericFile(new TextEncoder().encode(collJsonStr), 'collection.json', { contentType: 'application/json' });
    const [collUri] = await getUmi().uploader.upload([collFile]);
    uploadedURIs.collectionURI = collUri;
    log('uploadLog', `✓ Collection metadata: ${uploadedURIs.collectionURI}`, 'ok');

    setProg('uploadProgF', 'uploadProgP', 'uploadProgL', 100, 'Complete');
    $('uploadSts').textContent = 'DONE';
    showSt('uploadStatus', '✓ All assets uploaded to Arweave', 'ok');
    completeStep(4);
    setTimeout(() => goToStep(5), 500);
  } catch (err) {
    log('uploadLog', `ERROR: ${err.message}`, 'err');
    showSt('uploadStatus', 'Upload failed: ' + err.message, 'err');
  }
  $('startUpload').disabled = false;
};

/* ══════════════════════════════════════
   STEP 5: DEPLOY ON-CHAIN
══════════════════════════════════════ */
$('backStep5').onclick = () => goToStep(4);
$('startDeploy').onclick = async () => {
  if (!uploadedURIs) { showSt('deployStatus', 'Upload assets first.', 'err'); return; }

  try {
    $('startDeploy').disabled = true;
    $('deploySts').textContent = 'DEPLOYING';
    showProg('deployProg');

    log('deployLog', 'Initializing Metaplex Umi…', 'info');
    initUmi(network);
    log('deployLog', '✓ Umi ready', 'ok');

    deployResult = await fullDeploy(
      {
        name: $('deployName').value,
        symbol: $('deploySymbol').value,
        description: $('deployDesc').value,
        royaltyBps: parseInt($('deployRoyalty').value) || 500,
        creatorAddress: $('deployCreator').value,
        mintPrice: parseFloat($('mintPrice').value) || 0,
        mintLimit: parseInt($('mintLimit').value) || 0,
        startDate: $('mintStart').value || null,
      },
      uploadedURIs.metadataURIs,
      uploadedURIs.collectionURI,
      (step, done, total, msg) => {
        const pct = step === 'collection' ? 10 : 10 + (done / total) * 90;
        setProg('deployProgF', 'deployProgP', 'deployProgL', pct, msg);
      },
      (msg, type) => log('deployLog', msg, type)
    );

    setProg('deployProgF', 'deployProgP', 'deployProgL', 100, 'Deployed!');
    $('deploySts').textContent = 'DEPLOYED';
    showSt('deployStatus', '✓ Collection deployed on-chain', 'ok');
    completeStep(5);

    // Setup step 6
    const addr = deployResult.collectionAddress;
    const cmAddr = deployResult.candyMachineAddress;
    $('finalAddr').textContent = addr;
    if ($('finalCM')) $('finalCM').textContent = cmAddr;
    $('finalMinted').textContent = deployResult.itemsLoaded;
    if ($('finalPrice')) $('finalPrice').textContent = ($('mintPrice').value || '0') + ' SOL';
    $('finalNet').textContent = network === 'mainnet-beta' ? 'Mainnet' : 'Devnet';
    const suffix = network === 'devnet' ? '?cluster=devnet' : '';
    $('linkSolscan').href = `https://solscan.io/account/${addr}${suffix}`;
    $('linkExplorer').href = `https://explorer.solana.com/address/${addr}${suffix}`;
    $('linkME').href = `https://magiceden.io/marketplace/${addr}`;
    $('linkTensor').href = `https://www.tensor.trade/trade/${addr}`;

    setTimeout(() => goToStep(6), 600);
  } catch (err) {
    log('deployLog', `ERROR: ${err.message}`, 'err');
    showSt('deployStatus', 'Deploy failed: ' + err.message, 'err');
  }
  $('startDeploy').disabled = false;
};
