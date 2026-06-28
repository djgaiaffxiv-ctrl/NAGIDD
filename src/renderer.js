'use strict';
const $ = (s) => document.querySelector(s);

// Iconos de marca (SVG)
const IG_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="iggrad" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#feda75"/><stop offset=".28" stop-color="#fa7e1e"/>
    <stop offset=".6" stop-color="#d62976"/><stop offset=".85" stop-color="#962fbf"/>
    <stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs>
  <rect x="2" y="2" width="20" height="20" rx="6" fill="none" stroke="url(#iggrad)" stroke-width="2.1"/>
  <circle cx="12" cy="12" r="5" fill="none" stroke="url(#iggrad)" stroke-width="2.1"/>
  <circle cx="17.6" cy="6.4" r="1.5" fill="url(#iggrad)"/></svg>`;
const X_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path fill="#f4ecff" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.65l-5.21-6.81-5.96 6.81H1.69l7.73-8.835L1.254 2.25H8.08l4.71 6.23 5.454-6.23zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;
const FB_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8v8.44C19.61 23.08 24 18.09 24 12.07z"/></svg>`;
const GRID_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="gridg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ff4fa3"/><stop offset=".5" stop-color="#9b5cff"/><stop offset="1" stop-color="#5ce1ff"/></linearGradient></defs>
  <g fill="url(#gridg)">
    <rect x="2" y="2" width="5.5" height="5.5" rx="1.4"/><rect x="9.25" y="2" width="5.5" height="5.5" rx="1.4"/><rect x="16.5" y="2" width="5.5" height="5.5" rx="1.4"/>
    <rect x="2" y="9.25" width="5.5" height="5.5" rx="1.4"/><rect x="9.25" y="9.25" width="5.5" height="5.5" rx="1.4"/><rect x="16.5" y="9.25" width="5.5" height="5.5" rx="1.4"/>
    <rect x="2" y="16.5" width="5.5" height="5.5" rx="1.4"/><rect x="9.25" y="16.5" width="5.5" height="5.5" rx="1.4"/><rect x="16.5" y="16.5" width="5.5" height="5.5" rx="1.4"/>
  </g></svg>`;

const MODES = [
  { id: 'mp3',     icon: '🎵', title: 'Descargar MP3',  desc: 'Una cancion a MP3 de maxima calidad.', fmt: 'mp3', multi: false, scrape: false },
  { id: 'plist',   icon: '💿', title: 'Playlist a MP3', desc: 'Una playlist entera a MP3, numerada y en su carpeta.', badge: 'TOP', fire: true, fmt: 'mp3', multi: false, scrape: false, album: true },
  { id: 'video',   icon: '🎬', title: 'Descargar video', desc: 'Un video a MP4 de maxima calidad.', fmt: 'mp4', multi: false, scrape: false },
  { id: 'instagram', icon: IG_SVG, title: 'Instagram', desc: 'Fotos, videos, reels y stories. Privados: marca cookies.', fmt: 'instagram', multi: false, scrape: false },
  { id: 'facebook', icon: FB_SVG, title: 'Facebook', desc: 'Videos y reels de Facebook. Privados: marca cookies.', fmt: 'facebook', multi: false, scrape: false },
  { id: 'x',       icon: X_SVG, title: 'X / Twitter', desc: 'Video de un tweet, o un perfil entero. Privados: marca cookies.', fmt: 'x', multi: false, scrape: false },
  { id: 'perfil',  icon: GRID_SVG, title: 'Perfil completo', desc: 'TODAS las fotos y videos de un perfil de Instagram, X o Facebook. Privados: marca cookies.', badge: 'NUEVO', fire: true, fmt: 'perfil', multi: true, scrape: false },
  { id: 'lista',   icon: '📋', title: 'Lista de videos', desc: 'Pega muchos enlaces y los descarga todos a MP4.', badge: 'NUEVO', fmt: 'mp4', multi: true, scrape: false },
  { id: 'galeria', icon: '🗃️', title: 'Galeria → videos', desc: 'Pega la URL de una pagina y baja TODOS sus videos.', badge: 'NUEVO', fmt: 'mp4', multi: true, scrape: true }
];

let cur = null;
let running = false;
let cookieFile = '';

// Selector de cookies: "Archivo cookies.txt..." abre el dialogo
$('#ckBrowser').addEventListener('change', async (e) => {
  if (e.target.value === 'file') {
    const f = await window.nagi.pickCookies();
    if (f) { cookieFile = f; $('#ckFile').textContent = '✓ ' + f.split(/[\\/]/).pop(); $('#ckCookies').checked = true; }
    else { cookieFile = ''; $('#ckFile').textContent = ''; e.target.value = 'brave'; }
  } else {
    cookieFile = ''; $('#ckFile').textContent = '';
  }
});

// ---------- rejilla ----------
const grid = $('#grid');
MODES.forEach((m) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML =
    (m.badge ? `<span class="badge${m.fire ? ' fire' : ''}">${m.badge}</span>` : '') +
    `<span class="ci">${m.icon}</span><h3>${m.title}</h3><p>${m.desc}</p>`;
  card.addEventListener('click', () => openTool(m));
  grid.appendChild(card);
});

// ---------- navegacion ----------
function openTool(m) {
  cur = m;
  $('#toolIcon').innerHTML = m.icon;
  $('#toolTitle').textContent = m.title;
  $('#toolDesc').textContent = m.desc;

  const url = $('#urlInput'), area = $('#urlArea');
  if (m.multi) {
    url.classList.add('hidden'); area.classList.remove('hidden');
    $('#inputLabel').textContent = m.scrape ? 'Pega una o varias URLs de galeria/lista (una por linea):' : 'Pega un enlace por linea (se descargan todos):';
    area.value = '';
  } else {
    area.classList.add('hidden'); url.classList.remove('hidden');
    $('#inputLabel').textContent = 'Pega la URL:';
    url.value = '';
  }
  $('#albumRow').classList.toggle('hidden', !m.album);
  if (m.album) $('#albumInput').value = '';
  $('#logPre').textContent = 'Listo. Pega y pulsa DESCARGAR.\n';
  $('#home').classList.add('hidden');
  $('#toolView').classList.remove('hidden');
  document.querySelector('.tool-view').scrollTop = 0;
}

$('#backBtn').addEventListener('click', () => {
  if (running) return;
  $('#toolView').classList.add('hidden');
  $('#home').classList.remove('hidden');
});

// ---------- descarga ----------
$('#runBtn').addEventListener('click', async () => {
  if (running || !cur) return;
  let urls;
  if (cur.multi) urls = $('#urlArea').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  else { const u = $('#urlInput').value.trim(); urls = u ? [u] : []; }
  if (!urls.length) { appendLog('Pega al menos una URL.'); return; }

  running = true;
  const btn = $('#runBtn');
  btn.disabled = true; btn.textContent = 'Trabajando...';
  $('#logPre').textContent = '';
  $('#openBtn').classList.add('hidden');

  await window.nagi.download({
    urls, fmt: cur.fmt, multi: cur.multi, scrape: cur.scrape,
    album: cur.album ? $('#albumInput').value : '',
    cookies: {
      enabled: $('#ckCookies').checked,
      browser: $('#ckBrowser').value === 'file' ? 'brave' : $('#ckBrowser').value,
      file: ($('#ckBrowser').value === 'file') ? cookieFile : ''
    }
  });

  running = false;
  btn.disabled = false; btn.textContent = 'DESCARGAR';
});

function appendLog(line) {
  const pre = $('#logPre');
  pre.textContent += line + '\n';
  pre.scrollTop = pre.scrollHeight;
}
window.nagi.onLog(appendLog);

let doneFiles = [];
window.nagi.onDone((d) => {
  doneFiles = (d && d.files) || [];
  const btn = $('#openBtn');
  if (doneFiles.length === 1) {
    btn.innerHTML = '&#9654; Ver';
    btn.classList.remove('hidden');
  } else if (doneFiles.length > 1) {
    btn.innerHTML = '&#9654; Ver carpeta (' + doneFiles.length + ')';
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
});
$('#openBtn').addEventListener('click', () => {
  if (doneFiles.length === 1) window.nagi.openFile(doneFiles[0]);
  else if (doneFiles.length > 1) window.nagi.openFolder();
});

// ---------- barra superior ----------
$('#btnFails').addEventListener('click', () => window.nagi.copyFails());
$('#btnFolder').addEventListener('click', () => window.nagi.openFolder());
$('#winMin').addEventListener('click', () => window.nagi.winMinimize());
$('#winMax').addEventListener('click', () => window.nagi.winMaximize());
$('#winClose').addEventListener('click', () => window.nagi.winClose());
window.nagi.onWinState((max) => document.body.classList.toggle('maximized', max));

// ---------- acceso movil ----------
const mModal = $('#mobileModal');
function showMobileState(st) {
  const on = st && st.running;
  $('#mobileOff').classList.toggle('hidden', on);
  $('#mobileOn').classList.toggle('hidden', !on);
  const box = $('#qr'); box.innerHTML = '';
  if (on) {
    $('#mobileUrl').textContent = st.url;
    $('#mobileUrl').href = st.url;
    try { new QRCode(box, { text: st.url, width: 184, height: 184, colorDark: '#0b0717', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); } catch (_) {}
  }
}
$('#btnMobile').addEventListener('click', async () => {
  mModal.classList.remove('hidden');
  showMobileState(await window.nagi.mobileStatus());
});
$('#mobileClose').addEventListener('click', () => mModal.classList.add('hidden'));
mModal.addEventListener('click', (e) => { if (e.target === mModal) mModal.classList.add('hidden'); });
$('#mobileToggleOn').addEventListener('click', async () => {
  const b = $('#mobileToggleOn'); b.disabled = true; b.textContent = 'Encendiendo...';
  const st = await window.nagi.mobileStart();
  b.disabled = false; b.innerHTML = 'Encender acceso móvil';
  if (st && st.running) showMobileState(st);
  else appendLog('No se pudo iniciar el servidor movil' + (st && st.error ? ': ' + st.error : ''));
});
$('#mobileToggleOff').addEventListener('click', async () => {
  await window.nagi.mobileStop();
  showMobileState({ running: false });
});
