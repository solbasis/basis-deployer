import './style.css';
import { Buffer } from 'buffer';
import JSZip from 'jszip';
import { connectWallet, disconnectWallet, getBalance } from './wallet.js';
import { uploadCollection, uploadFile, getResumeState, clearState } from './irys.js';
import { initUmi, getUmi, fullDeploy } from './deploy.js';
import { downloadMintPage } from './mintpage.js';

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
  if (a) a.style.width = Math.min(pct, 100) + '%';
  if (b) b.textContent = Math.round(Math.min(pct, 100)) + '%';
  if (c && lbl) c.textContent = lbl;
}
function showProg(id) { $(id)?.classList.add('show'); }
function log(id, msg, type = 'info') {
  const el = $(id); if (!el) return;
  el.style.display = 'block';
  const div = document.createElement('div');
  div.className = 'log-' + type;
  div.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
  el.appendChild(div);
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
      <div class="logo-sub">Metaplex Core · Candy Machine · Arweave</div>
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
      <p style="font-size:.66rem;color:var(--text-dim);margin-bottom:14px;line-height:1.7">This wallet becomes the <strong style="color:var(--text)">update authority</strong> and receives mint revenue.</p>
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
        <div style="font-size:.72rem;color:var(--text-dim)">Drop ZIP here or click to browse</div>
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
      <div class="g2"><div class="field"><label>Name <span style="color:var(--neg)">*</span></label><input type="text" id="deployName" placeholder="My Collection"></div><div class="field"><label>Symbol <span style="color:var(--neg)">*</span></label><input type="text" id="deploySymbol" maxlength="10" placeholder="MYCO"></div></div>
      <div class="field"><label>Description</label><input type="text" id="deployDesc"></div>
      <div class="field"><label>External URL</label><input type="url" id="deployUrl"></div>
      <hr><h3>> Mint Settings</h3>
      <div class="g2"><div class="field"><label>Mint Price (SOL)</label><input type="number" id="mintPrice" value="0" min="0" step="0.01" placeholder="0 = free mint"></div><div class="field"><label>Max per Wallet</label><input type="number" id="mintLimit" value="0" min="0" placeholder="0 = unlimited"></div></div>
      <div class="g2"><div class="field"><label>Mint Start (UTC)</label><input type="text" id="mintStart" placeholder="YYYY-MM-DDTHH:MM:SS"></div><div class="field"><label>Creator / Treasury Wallet</label><input type="text" id="deployCreator"></div></div>
      <hr><h3>> Whitelist (Optional)</h3>
      <p style="font-size:.60rem;color:var(--text-dim);margin-bottom:6px">Add wallet addresses that get early access before public mint. One address per line.</p>
      <div class="field"><label>Whitelist Wallets</label><textarea id="wlWallets" rows="4" style="width:100%;background:rgba(0,0,0,.40);border:1px solid var(--border);border-radius:5px;color:var(--text);font-family:var(--mono);font-size:.66rem;padding:7px 9px;resize:vertical;outline:none" placeholder="Ur1CbWSGsXCdedknRbJsEk7urwAvu1uddmQv51nAnXB&#10;GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS&#10;(one wallet per line)"></textarea></div>
      <div class="g2"><div class="field"><label>WL Mint Price (SOL)</label><input type="number" id="wlPrice" value="0" min="0" step="0.01" placeholder="0 = free for WL"></div><div class="field"><label>WL Max per Wallet</label><input type="number" id="wlLimit" value="1" min="1" placeholder="1"></div></div>
      <div class="g2"><div class="field"><label>WL Start (UTC)</label><input type="text" id="wlStart" placeholder="YYYY-MM-DDTHH:MM:SS"></div><div class="field"><label>Public Start (UTC)</label><input type="text" id="publicStart" placeholder="After WL ends"></div></div>
      <hr><h3>> Royalties</h3>
      <div class="g2"><div class="field"><label>Royalty (bps, 500 = 5%)</label><input type="number" id="deployRoyalty" value="500" min="0" max="10000"></div><div class="field"></div></div>
      <hr><h3>> Cost Estimate</h3>
      <p style="font-size:.60rem;color:var(--text-dim);margin-bottom:6px">With Candy Machine, <strong style="color:var(--pos)">buyers pay mint cost</strong> — you only pay setup + upload.</p>
      <div class="kv" id="costEstimate">
        <div class="kv-row"><span class="kv-k">Collection creation</span><span class="kv-v">~0.015 SOL</span></div>
        <div class="kv-row"><span class="kv-k">Candy Machine</span><span class="kv-v">~0.02 SOL</span></div>
        <div class="kv-row"><span class="kv-k">Arweave uploads</span><span class="kv-v" id="costUploads">—</span></div>
        <div class="kv-row"><span class="kv-k">Config lines</span><span class="kv-v" id="costMint">—</span></div>
        <div class="kv-row" style="border-top:1px solid var(--border-hi)"><span class="kv-k" style="color:var(--text)">Total (creator pays)</span><span class="kv-v" id="costTotal" style="font-size:.74rem;color:var(--pos)">—</span></div>
      </div>
      <div class="status-bar" id="step3Status"></div>
      <div class="btn-row"><button class="btn" id="backStep3">← Back</button><button class="btn btn-p" id="nextStep3">Continue →</button></div>
    </div>
  </div>

  <!-- STEP 4: UPLOAD -->
  <div class="step-content" id="step-4">
    <div class="panel">
      <div class="pbar"><div class="pbar-l"><div class="pdots"><span class="pdot"></span><span class="pdot"></span><span class="pdot"></span></div><div class="plbl">Arweave Upload</div></div><div class="psts" id="uploadSts">Ready</div></div>
      <h2>> Upload to Arweave via Irys</h2>
      <p style="font-size:.66rem;color:var(--text-dim);margin-bottom:14px">Uploads all images and metadata to permanent Arweave storage. Umi handles funding automatically.</p>
      <div class="status-bar" id="balanceWarning"></div>
      <div class="btn-row" style="margin-top:8px"><button class="btn" id="backStep4">← Back</button><button class="btn btn-p btn-lg" id="startUpload">⬆ Start Upload</button></div>
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
      <p style="font-size:.66rem;color:var(--text-dim);margin-bottom:14px">Creates collection + Candy Machine on Solana. ~3-20 wallet approvals total. Buyers mint on demand.</p>
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
      <p style="font-size:.66rem;color:var(--text-dim);margin-bottom:10px">Buyers can now mint from your Candy Machine. Auto-indexed on Magic Eden & Tensor after first mint.</p>
      <div class="kv" style="margin-bottom:12px">
        <div class="kv-row"><span class="kv-k">Collection</span><span class="kv-v" style="display:flex;align-items:center;gap:6px"><span id="finalAddr" style="font-size:.56rem">—</span><button class="copy-btn" id="copyCollectionBtn" title="Copy address">⎘</button></span></div>
        <div class="kv-row"><span class="kv-k">Candy Machine</span><span class="kv-v" style="display:flex;align-items:center;gap:6px"><span id="finalCM" style="font-size:.56rem">—</span><button class="copy-btn" id="copyCMBtn" title="Copy address">⎘</button></span></div>
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
      <hr>
      <h3>> Mint Page</h3>
      <p style="font-size:.62rem;color:var(--text-dim);margin-bottom:8px">Download a ready-to-host mint page for your buyers. Upload it to any web host or share the HTML file directly.</p>
      <div class="btn-row" style="margin-top:0">
        <button class="btn btn-p btn-lg" id="downloadMintPage">⬇ Download Mint Page</button>
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
   COPY TO CLIPBOARD
══════════════════════════════════════ */
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = '✓';
    btn.style.color = 'var(--pos)';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
  } catch {}
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
  await disconnectWallet(); walletConnected = false;
  $('walletDisconnected').style.display = 'block';
  $('walletConnected').style.display = 'none';
  $('walletSts').textContent = 'Disconnected';
};
$('nextStep1').onclick = () => { if (!walletConnected) return; completeStep(1); goToStep(2); };

/* ══════════════════════════════════════
   STEP 2: LOAD ZIP
══════════════════════════════════════ */
async function processZipFile(file) {
  if (!file || !file.name.endsWith('.zip')) {
    showSt('zipStatus', 'Please select a valid .zip file.', 'err');
    return;
  }
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
    if (count === 0) { showSt('zipStatus', 'No images or metadata found in ZIP. Check folder structure.', 'err'); return; }
    $('colName').textContent = collJson?.name || 'Unknown';
    $('colItems').textContent = count;
    $('colSize').textContent = (file.size / 1024 / 1024).toFixed(1) + ' MB';
    $('colLoaded').style.display = 'block';
    $('zipZone').style.display = 'none';
    $('colSts').textContent = 'Loaded';
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
}

$('zipUpload').onchange = (e) => { const f = e.target.files?.[0]; if (f) processZipFile(f); };

// Drag-and-drop support
const zipZone = $('zipZone');
zipZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  zipZone.style.borderColor = 'var(--a)';
  zipZone.style.background = 'var(--a06)';
});
zipZone.addEventListener('dragleave', () => {
  zipZone.style.borderColor = '';
  zipZone.style.background = '';
});
zipZone.addEventListener('drop', (e) => {
  e.preventDefault();
  zipZone.style.borderColor = '';
  zipZone.style.background = '';
  const f = e.dataTransfer?.files?.[0];
  if (f) processZipFile(f);
});

$('reloadZip').onclick = () => {
  collectionData = null;
  $('colLoaded').style.display = 'none';
  $('zipZone').style.display = 'flex';
  $('zipUpload').value = '';
  hideSt('zipStatus');
};
$('nextStep2').onclick = () => { if (!collectionData) return; completeStep(2); goToStep(3); updateCosts(); };

/* ══════════════════════════════════════
   STEP 3: CONFIGURE
══════════════════════════════════════ */
// Validate base58 Solana address (32–44 chars, base58 alphabet only)
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
function isValidAddress(addr) { return BASE58_RE.test(addr.trim()); }

function parseWhitelistWallets() {
  const raw = $('wlWallets')?.value?.trim() || '';
  if (!raw) return [];
  return raw.split('\n').map(w => w.trim()).filter(w => isValidAddress(w));
}

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
$('nextStep3').onclick = () => {
  const name = $('deployName').value.trim();
  const symbol = $('deploySymbol').value.trim();
  if (!name) { showSt('step3Status', 'Collection Name is required.', 'err'); $('deployName').focus(); return; }
  if (!symbol) { showSt('step3Status', 'Symbol is required.', 'err'); $('deploySymbol').focus(); return; }
  const creator = $('deployCreator').value.trim();
  if (creator && !isValidAddress(creator)) { showSt('step3Status', 'Creator wallet address looks invalid.', 'err'); return; }
  hideSt('step3Status');
  completeStep(3);
  goToStep(4);
  checkBalance();
};

/* ══════════════════════════════════════
   BALANCE WARNING (Step 4)
══════════════════════════════════════ */
async function checkBalance() {
  if (!collectionData) return;
  try {
    const bal = await getBalance(network);
    const n = Object.keys(collectionData.images).length;
    const sizeMB = collectionData.file.size / 1024 / 1024;
    const est = 0.015 + 0.02 + (sizeMB / 1024) * 0.8 + 0.05 + Math.ceil(n / 10) * 0.00015;
    if (bal < est * 1.1) {
      showSt('balanceWarning',
        `⚠ Low balance: ${bal.toFixed(4)} SOL. Estimated cost: ~${est.toFixed(3)} SOL. Top up before deploying.`,
        'warn');
    } else {
      showSt('balanceWarning',
        `✓ Balance: ${bal.toFixed(4)} SOL  |  Estimated cost: ~${est.toFixed(3)} SOL`,
        'ok');
    }
  } catch {}
}

/* ══════════════════════════════════════
   STEP 4: UPLOAD TO ARWEAVE
   Uses Umi's Irys uploader plugin — no separate initIrys needed.
   initUmi() sets up Umi with irysUploader() plugin.
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

    const resumeState = getResumeState();
    if (resumeState) {
      log('uploadLog', '⚡ Found previous upload progress — resuming…', 'warn');
    }

    log('uploadLog', 'Starting collection upload (batches of 10)…', 'info');
    uploadedURIs = await uploadCollection(collectionData, (done, total, msg) => {
      const pct = (done / total) * 100;
      setProg('uploadProgF', 'uploadProgP', 'uploadProgL', pct, msg);
    }, (msg, type) => log('uploadLog', msg, type));

    // Find collection image from any supported extension
    log('uploadLog', 'Uploading collection metadata…', 'info');
    const imgURIs = uploadedURIs.imageURIs;
    const collectionImageUri =
      imgURIs['0.png'] || imgURIs['0.jpg'] || imgURIs['0.jpeg'] || imgURIs['0.webp'] || '';
    const collJsonStr = JSON.stringify({
      ...collectionData.collJson,
      image: collectionImageUri,
    }, null, 2);
    uploadedURIs.collectionURI = await uploadFile(collJsonStr, 'collection.json', 'application/json');
    uploadedURIs.collectionImageUri = collectionImageUri;
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
   STEP 5: DEPLOY CANDY MACHINE
══════════════════════════════════════ */
$('backStep5').onclick = () => goToStep(4);
$('startDeploy').onclick = async () => {
  if (!uploadedURIs) { showSt('deployStatus', 'Upload assets first.', 'err'); return; }

  try {
    $('startDeploy').disabled = true;
    $('deploySts').textContent = 'DEPLOYING';
    showProg('deployProg');

    log('deployLog', 'Initializing Umi…', 'info');
    if (!getUmi()) initUmi(network);
    log('deployLog', '✓ Umi ready', 'ok');

    const wlWallets = parseWhitelistWallets();
    const mintLimitVal = parseInt($('mintLimit').value) || 0;
    const wlLimitVal = parseInt($('wlLimit')?.value) || 1;

    deployResult = await fullDeploy(
      {
        name: $('deployName').value.trim(),
        symbol: $('deploySymbol').value.trim(),
        description: $('deployDesc').value,
        royaltyBps: parseInt($('deployRoyalty').value) || 500,
        creatorAddress: $('deployCreator').value.trim(),
        mintPrice: parseFloat($('mintPrice').value) || 0,
        mintLimit: mintLimitVal,
        startDate: $('mintStart').value || null,
        whitelist: wlWallets.length > 0 ? {
          wallets: wlWallets,
          price: parseFloat($('wlPrice')?.value) || 0,
          limit: wlLimitVal,
          startDate: $('wlStart')?.value || null,
        } : null,
        publicStartDate: $('publicStart')?.value || null,
      },
      uploadedURIs.metadataURIs,
      uploadedURIs.collectionURI,
      (label, pct, total, msg) => {
        setProg('deployProgF', 'deployProgP', 'deployProgL', pct, msg);
      },
      (msg, type) => log('deployLog', msg, type)
    );

    setProg('deployProgF', 'deployProgP', 'deployProgL', 100, 'Deployed!');
    $('deploySts').textContent = 'DEPLOYED';
    showSt('deployStatus', '✓ Candy Machine deployed', 'ok');
    completeStep(5);

    // Populate step 6
    const addr = deployResult.collectionAddress;
    const cmAddr = deployResult.candyMachineAddress;
    $('finalAddr').textContent = addr;
    $('finalCM').textContent = cmAddr;
    $('finalMinted').textContent = deployResult.itemsLoaded;
    $('finalPrice').textContent = ($('mintPrice').value || '0') + ' SOL';
    $('finalNet').textContent = network === 'mainnet-beta' ? 'Mainnet' : 'Devnet';

    // Copy buttons
    $('copyCollectionBtn').onclick = (e) => copyText(addr, e.currentTarget);
    $('copyCMBtn').onclick = (e) => copyText(cmAddr, e.currentTarget);

    const suffix = network === 'devnet' ? '?cluster=devnet' : '';
    $('linkSolscan').href = `https://solscan.io/account/${addr}${suffix}`;
    $('linkExplorer').href = `https://explorer.solana.com/address/${addr}${suffix}`;
    $('linkME').href = `https://magiceden.io/marketplace/${addr}`;
    $('linkTensor').href = `https://www.tensor.trade/trade/${addr}`;

    // Mint page download — pass all guard config
    $('downloadMintPage').onclick = () => {
      const wlList = parseWhitelistWallets();
      downloadMintPage({
        collectionName: $('deployName').value.trim(),
        collectionAddress: deployResult.collectionAddress,
        candyMachineAddress: deployResult.candyMachineAddress,
        mintPrice: parseFloat($('mintPrice').value) || 0,
        totalItems: deployResult.itemsLoaded,
        network,
        collectionImageUri: uploadedURIs?.collectionImageUri || '',
        description: $('deployDesc').value,
        creatorAddress: $('deployCreator').value.trim(),
        hasWhitelist: wlList.length > 0,
        whitelistWallets: wlList,
        wlPrice: parseFloat($('wlPrice')?.value) || 0,
        mintLimit: parseInt($('mintLimit').value) || 0,
        wlMintLimit: parseInt($('wlLimit')?.value) || 0,
      });
    };

    setTimeout(() => goToStep(6), 600);
  } catch (err) {
    log('deployLog', `ERROR: ${err.message}`, 'err');
    showSt('deployStatus', 'Deploy failed: ' + err.message, 'err');
  }
  $('startDeploy').disabled = false;
};
