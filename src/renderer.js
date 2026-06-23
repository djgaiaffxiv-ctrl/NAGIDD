'use strict';
const $ = (s) => document.querySelector(s);

const MODES = [
  { id: 'mp3',     icon: '🎵', title: 'Descargar MP3',  desc: 'Una cancion a MP3 de maxima calidad.', fmt: 'mp3', multi: false, scrape: false },
  { id: 'plist',   icon: '💿', title: 'Playlist a MP3', desc: 'Una playlist entera a MP3, numerada y en su carpeta.', badge: 'TOP', fire: true, fmt: 'mp3', multi: false, scrape: false, album: true },
  { id: 'video',   icon: '🎬', title: 'Descargar video', desc: 'Un video a MP4 de maxima calidad.', fmt: 'mp4', multi: false, scrape: false },
  { id: 'lista',   icon: '📋', title: 'Lista de videos', desc: 'Pega muchos enlaces y los descarga todos a MP4.', badge: 'NUEVO', fmt: 'mp4', multi: true, scrape: false },
  { id: 'galeria', icon: '🗃️', title: 'Galeria → videos', desc: 'Pega la URL de una pagina y baja TODOS sus videos.', badge: 'NUEVO', fmt: 'mp4', multi: true, scrape: true }
];

let cur = null;
let running = false;

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
  $('#toolIcon').textContent = m.icon;
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

  await window.nagi.download({
    urls, fmt: cur.fmt, multi: cur.multi, scrape: cur.scrape,
    album: cur.album ? $('#albumInput').value : '',
    cookies: { enabled: $('#ckCookies').checked, browser: $('#ckBrowser').value }
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
window.nagi.onDone(() => {});

// ---------- barra superior ----------
$('#btnFails').addEventListener('click', () => window.nagi.copyFails());
$('#btnFolder').addEventListener('click', () => window.nagi.openFolder());
$('#winMin').addEventListener('click', () => window.nagi.winMinimize());
$('#winMax').addEventListener('click', () => window.nagi.winMaximize());
$('#winClose').addEventListener('click', () => window.nagi.winClose());
window.nagi.onWinState((max) => document.body.classList.toggle('maximized', max));
