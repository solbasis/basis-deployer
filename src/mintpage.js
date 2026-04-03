/**
 * MINT PAGE GENERATOR
 * Generates a standalone HTML mint page for buyers.
 * The page connects to Phantom/Solflare and mints from the Candy Machine.
 */

export function generateMintPage(config) {
  const {
    collectionName,
    collectionAddress,
    candyMachineAddress,
    mintPrice,
    totalItems,
    network,
    collectionImageUri,
    description,
    creatorAddress,
    hasWhitelist,
    whitelistWallets,
    wlPrice,
  } = config;

  const rpcUrl = network === 'mainnet-beta'
    ? (import.meta.env.VITE_RPC ?? 'https://api.mainnet-beta.solana.com')
    : 'https://api.devnet.solana.com';

  const explorerSuffix = network === 'devnet' ? '?cluster=devnet' : '';
  const priceDisplay = mintPrice > 0 ? `${mintPrice} SOL` : 'FREE';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Mint — ${collectionName}</title>
<meta name="description" content="${(description || '').replace(/"/g, '&quot;')}"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --a:#78b15a;--bg:#000;--surface:rgba(14,26,12,.80);
  --border:rgba(120,177,90,.12);--border-hi:rgba(120,177,90,.22);
  --text:rgba(120,177,90,.88);--text-dim:rgba(120,177,90,.50);
  --pos:#6dd97d;--neg:#e07070;--warn:#d4a843;
  --mono:'JetBrains Mono',monospace;--sans:'Outfit',sans-serif;
  color-scheme:dark;
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:var(--mono);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse 800px 400px at 50% 20%,rgba(120,177,90,.06),transparent 60%)}
.card{position:relative;max-width:420px;width:100%;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;text-align:center;overflow:hidden}
.card::before{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(120,177,90,.005) 0px,rgba(120,177,90,.005) 1px,transparent 1px,transparent 4px)}
.card>*{position:relative;z-index:1}
.col-img{width:180px;height:180px;border-radius:10px;border:2px solid var(--border-hi);object-fit:cover;margin:0 auto 16px;display:block;background:rgba(0,0,0,.4)}
.col-name{font-family:var(--sans);font-size:1.4rem;font-weight:800;color:var(--a);letter-spacing:1px;margin-bottom:4px}
.col-desc{font-size:.72rem;color:var(--text-dim);line-height:1.6;margin-bottom:16px;max-height:60px;overflow:hidden}
.stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:18px}
.stat{background:rgba(0,0,0,.3);border:1px solid var(--border);border-radius:8px;padding:8px 4px}
.stat-val{font-size:.9rem;font-weight:700;color:var(--a)}
.stat-lbl{font-size:.52rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;margin-top:2px}
.mint-btn{width:100%;padding:14px;font-family:var(--mono);font-size:.85rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;border:2px solid var(--a);border-radius:8px;background:rgba(120,177,90,.1);color:var(--a);cursor:pointer;transition:all .15s}
.mint-btn:hover{background:rgba(120,177,90,.18);box-shadow:0 0 30px rgba(120,177,90,.2);transform:translateY(-1px)}
.mint-btn:active{transform:scale(.98)}
.mint-btn:disabled{opacity:.3;cursor:not-allowed;transform:none!important;box-shadow:none!important}
.status{font-size:.68rem;margin-top:10px;padding:8px;border-radius:6px;display:none}
.status.show{display:block}
.status.ok{background:rgba(109,217,125,.08);border:1px solid rgba(109,217,125,.2);color:var(--pos)}
.status.err{background:rgba(224,112,112,.08);border:1px solid rgba(224,112,112,.2);color:var(--neg)}
.status.info{background:rgba(120,177,90,.06);border:1px solid var(--border);color:var(--text)}
.wallet-row{display:flex;gap:6px;margin-bottom:14px}
.wallet-row button{flex:1;padding:8px;font-family:var(--mono);font-size:.62rem;font-weight:600;letter-spacing:.8px;text-transform:uppercase;border:1px solid var(--border-hi);border-radius:6px;background:transparent;color:var(--text-dim);cursor:pointer;transition:all .1s}
.wallet-row button:hover{border-color:var(--a);color:var(--a)}
.wallet-row button.connected{border-color:var(--pos);color:var(--pos);background:rgba(109,217,125,.06)}
.wallet-addr{font-size:.60rem;color:var(--text-dim);margin-bottom:12px}
.footer{margin-top:16px;font-size:.52rem;color:rgba(120,177,90,.25);letter-spacing:.5px}
.footer a{color:rgba(120,177,90,.35);text-decoration:none}
.qty-row{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:14px}
.qty-btn{width:32px;height:32px;border-radius:6px;border:1px solid var(--border-hi);background:transparent;color:var(--text);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center}
.qty-btn:hover{border-color:var(--a);color:var(--a)}
.qty-val{font-size:1.1rem;font-weight:700;color:var(--a);min-width:30px;text-align:center}
.progress{margin-top:8px;height:3px;background:rgba(120,177,90,.08);border-radius:2px;overflow:hidden;display:none}
.progress.show{display:block}
.progress-fill{height:100%;background:var(--a);width:0%;transition:width .3s}
</style>
</head>
<body>
<div class="card">
  ${collectionImageUri ? `<img class="col-img" src="${collectionImageUri}" alt="${collectionName}" onerror="this.style.display='none'">` : ''}
  <div class="col-name">${collectionName}</div>
  <div class="col-desc">${description || ''}</div>
  
  <div class="stats">
    <div class="stat"><div class="stat-val">${priceDisplay}</div><div class="stat-lbl">Price</div></div>
    <div class="stat"><div class="stat-val">${totalItems}</div><div class="stat-lbl">Supply</div></div>
    <div class="stat"><div class="stat-val" id="minted">—</div><div class="stat-lbl">Minted</div></div>
  </div>
  ${hasWhitelist ? '<div style="font-size:.60rem;color:var(--warn);padding:6px 10px;border:1px solid rgba(212,168,67,.2);border-radius:6px;margin-bottom:12px;text-align:center">★ Whitelist phase active — WL wallets mint first</div>' : ''}

  <div class="wallet-row">
    <button id="btnPhantom" onclick="connect('phantom')">🟣 Phantom</button>
    <button id="btnSolflare" onclick="connect('solflare')">🔶 Solflare</button>
  </div>
  <div class="wallet-addr" id="walletAddr">Connect wallet to mint</div>

  <div class="qty-row">
    <button class="qty-btn" onclick="changeQty(-1)">−</button>
    <span class="qty-val" id="qtyVal">1</span>
    <button class="qty-btn" onclick="changeQty(1)">+</button>
  </div>

  <button class="mint-btn" id="mintBtn" disabled onclick="doMint()">Connect Wallet First</button>
  
  <div class="progress" id="progress"><div class="progress-fill" id="progressFill"></div></div>
  <div class="status" id="status"></div>

  <div class="footer">
    Powered by <a href="#">BASIS</a> · <a href="https://solscan.io/account/${collectionAddress}${explorerSuffix}" target="_blank">View on Solscan</a>
  </div>
</div>

<script type="module">
import { createUmi } from 'https://esm.sh/@metaplex-foundation/umi-bundle-defaults@0.9.2';
import { walletAdapterIdentity } from 'https://esm.sh/@metaplex-foundation/umi-signer-wallet-adapters@0.9.2';
import { mplCandyMachine, fetchCandyMachine, mintV1, safeFetchCandyGuard, route, getMerkleRoot, getMerkleProof } from 'https://esm.sh/@metaplex-foundation/mpl-core-candy-machine@0.3.0';
import { mplCore } from 'https://esm.sh/@metaplex-foundation/mpl-core@1.1.1';
import { generateSigner, transactionBuilder, publicKey, some, sol } from 'https://esm.sh/@metaplex-foundation/umi@0.9.2';
import { setComputeUnitLimit } from 'https://esm.sh/@metaplex-foundation/mpl-toolbox@0.9.4';
import { PhantomWalletAdapter } from 'https://esm.sh/@solana/wallet-adapter-phantom@0.9.24';
import { SolflareWalletAdapter } from 'https://esm.sh/@solana/wallet-adapter-solflare@0.6.28';

const CM_ID = '${candyMachineAddress}';
const COLLECTION_ID = '${collectionAddress}';
const MINT_PRICE = ${mintPrice || 0};
const WL_PRICE = ${wlPrice || 0};
const TREASURY = '${creatorAddress}';
const RPC = '${rpcUrl}';
const HAS_WL = ${hasWhitelist ? 'true' : 'false'};
const WL_WALLETS = ${hasWhitelist ? JSON.stringify(whitelistWallets || []) : '[]'};

const adapters = { phantom: new PhantomWalletAdapter(), solflare: new SolflareWalletAdapter() };
let umi = null;
let wallet = null;
let qty = 1;

const $=id=>document.getElementById(id);
function showStatus(msg, type='info') {
  const el=$('status'); el.textContent=msg; el.className='status show '+type;
}

// Fetch minted count on load
async function fetchMintedCount() {
  try {
    const tempUmi = createUmi(RPC).use(mplCandyMachine()).use(mplCore());
    const cm = await fetchCandyMachine(tempUmi, publicKey(CM_ID));
    const minted = Number(cm.itemsRedeemed);
    const total = Number(cm.data.itemsAvailable);
    $('minted').textContent = minted + '/' + total;
    if (minted >= total) {
      $('mintBtn').textContent = 'SOLD OUT';
      $('mintBtn').disabled = true;
    }
  } catch(e) { console.error('Fetch CM:', e); }
}
fetchMintedCount();

window.connect = async function(name) {
  try {
    const adapter = adapters[name];
    await adapter.connect();
    wallet = adapter;
    umi = createUmi(RPC)
      .use(walletAdapterIdentity(adapter))
      .use(mplCandyMachine())
      .use(mplCore());
    const addr = adapter.publicKey.toBase58();
    $('walletAddr').textContent = addr.slice(0,4) + '…' + addr.slice(-4);
    $('btn'+name.charAt(0).toUpperCase()+name.slice(1)).classList.add('connected');
    $('mintBtn').disabled = false;
    updateMintButton();
    showStatus('Wallet connected', 'ok');
  } catch(e) { showStatus('Connection failed: '+e.message, 'err'); }
};

window.changeQty = function(d) {
  qty = Math.max(1, Math.min(10, qty + d));
  $('qtyVal').textContent = qty;
  if (wallet) updateMintButton();
};

let isWL = false;
let wlVerified = false;

// Check if connected wallet is on whitelist
function checkWL() {
  if (!HAS_WL || !wallet) return false;
  const addr = wallet.publicKey.toBase58();
  return WL_WALLETS.includes(addr);
}

window.doMint = async function() {
  if (!umi || !wallet) return;
  $('mintBtn').disabled = true;
  $('mintBtn').textContent = 'MINTING…';
  $('progress').classList.add('show');

  const useWL = HAS_WL && isWL;
  const price = useWL ? WL_PRICE : MINT_PRICE;
  const group = HAS_WL ? (useWL ? 'wl' : 'public') : null;

  // Verify WL merkle proof if needed (one-time per wallet)
  if (useWL && !wlVerified) {
    try {
      showStatus('Verifying whitelist…', 'info');
      const merkleRoot = getMerkleRoot(WL_WALLETS);
      const merkleProof = getMerkleProof(WL_WALLETS, wallet.publicKey.toBase58());
      await route(umi, {
        candyMachine: publicKey(CM_ID),
        guard: 'allowList',
        group: some('wl'),
        routeArgs: { path: 'proof', merkleRoot, merkleProof },
      }).sendAndConfirm(umi);
      wlVerified = true;
      showStatus('✓ Whitelist verified', 'ok');
    } catch(e) {
      showStatus('WL verification failed: ' + e.message, 'err');
      $('mintBtn').disabled = false;
      $('mintBtn').textContent = 'MINT';
      return;
    }
  }

  let minted = 0;
  for (let i = 0; i < qty; i++) {
    try {
      const nftSigner = generateSigner(umi);
      const mintArgs = {};
      if (price > 0) mintArgs.solPayment = some({ destination: publicKey(TREASURY) });
      if (useWL) mintArgs.allowList = some({ merkleRoot: getMerkleRoot(WL_WALLETS) });

      let tx = transactionBuilder()
        .add(setComputeUnitLimit(umi, { units: 800_000 }))
        .add(mintV1(umi, {
          candyMachine: publicKey(CM_ID),
          collection: publicKey(COLLECTION_ID),
          asset: nftSigner,
          mintArgs,
          ...(group ? { group: some(group) } : {}),
        }));
      await tx.sendAndConfirm(umi);
      minted++;
      $('progressFill').style.width = ((i+1)/qty*100)+'%';
      showStatus('Minted ' + minted + '/' + qty, 'ok');
    } catch(e) {
      showStatus('Mint failed: ' + e.message, 'err');
      break;
    }
  }

  if (minted > 0) {
    showStatus('✓ Minted ' + minted + ' NFT' + (minted>1?'s':'') + '!', 'ok');
    fetchMintedCount();
  }
  $('mintBtn').disabled = false;
  updateMintButton();
};

function updateMintButton() {
  if (!wallet) { $('mintBtn').textContent = 'Connect Wallet First'; return; }
  isWL = checkWL();
  const price = isWL ? WL_PRICE : MINT_PRICE;
  const label = isWL ? '★ WL MINT' : 'MINT';
  $('mintBtn').textContent = price > 0 ? label + ' ' + (price * qty) + ' SOL' : label + ' FREE';
}
<\/script>
</body>
</html>`;
}

/**
 * Trigger download of the mint page HTML file.
 */
export function downloadMintPage(config) {
  const html = generateMintPage(config);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(config.collectionName || 'mint').replace(/\s+/g, '-').toLowerCase()}-mint-page.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
