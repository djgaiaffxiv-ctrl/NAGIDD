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

const MODES = [
  { id: 'mp3',     icon: '🎵', title: 'Descargar MP3',  desc: 'Una cancion a MP3 de maxima calidad.', fmt: 'mp3', multi: false, scrape: false },
  { id: 'plist',   icon: '💿', title: 'Playlist a MP3', desc: 'Una playlist entera a MP3, numerada y en su carpeta.', badge: 'TOP', fire: true, fmt: 'mp3', multi: false, scrape: false, album: true },
  { id: 'video',   icon: '🎬', title: 'Descargar video', desc: 'Un video a MP4 de maxima calidad.', fmt: 'mp4', multi: false, scrape: false },
  { id: 'instagram', icon: IG_SVG, title: 'Instagram', desc: 'Fotos, videos, reels y stories (marca cookies para privados).', fmt: 'instagram', multi: false, scrape: false },
  { id: 'x',       icon: X_SVG, title: 'X / Twitter', desc: 'Descarga el video de un tweet.', fmt: 'mp4', multi: false, scrape: false },
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
