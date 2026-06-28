'use strict';
// NAGIDD - mini servidor web para el movil. Sirve la carpeta de descargas
// (musica y video) en la red local para escuchar/descargar desde el telefono.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const AUDIO = ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.mka', '.weba'];
const VIDEO = ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v'];
const MEDIA = AUDIO.concat(VIDEO);
const TYPES = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.weba': 'audio/webm', '.mka': 'audio/x-matroska',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.m4v': 'video/x-m4v'
};

let server = null;
let baseDir = '';

function lanIP() {
  const ifaces = os.networkInterfaces();
  const cands = [];
  for (const name of Object.keys(ifaces)) {
    for (const i of (ifaces[name] || [])) {
      if (i.family === 'IPv4' && !i.internal) cands.push(i.address);
    }
  }
  return cands.find((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(a)) || cands[0] || '127.0.0.1';
}

function listMedia(dir) {
  const out = [];
  (function walk(d, rel) {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { walk(full, r); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (!MEDIA.includes(ext)) continue;
      let size = 0, mtime = 0;
      try { const s = fs.statSync(full); size = s.size; mtime = s.mtimeMs; } catch (_) {}
      out.push({ name: e.name.replace(/\.[^.]+$/, ''), file: e.name, rel: r, size, mtime, audio: AUDIO.includes(ext), folder: rel });
    }
  })(dir, '');
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

function safeResolve(base, relEnc) {
  let rel;
  try { rel = decodeURIComponent(relEnc); } catch (_) { return null; }
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) return null;  // anti path-traversal
  return full;
}

function serveFile(req, res, filePath, download) {
  let stat;
  try { stat = fs.statSync(filePath); } catch (_) { res.writeHead(404); return res.end('not found'); }
  const ext = path.extname(filePath).toLowerCase();
  const h = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  if (download) h['Content-Disposition'] = "attachment; filename*=UTF-8''" + encodeURIComponent(path.basename(filePath));
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= stat.size) end = stat.size - 1;
    if (start > end) { res.writeHead(416); return res.end(); }
    h['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
    h['Content-Length'] = end - start + 1;
    res.writeHead(206, h);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    h['Content-Length'] = stat.size;
    res.writeHead(200, h);
    fs.createReadStream(filePath).pipe(res);
  }
}

function start(dir, port) {
  baseDir = path.resolve(dir);
  return new Promise((resolve, reject) => {
    if (server) return resolve(info());
    server = http.createServer((req, res) => {
      let u;
      try { u = new URL(req.url, 'http://x'); } catch (_) { res.writeHead(400); return res.end(); }
      const p = u.pathname;
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (p === '/' || p === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
      if (p === '/api/list') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); return res.end(JSON.stringify(listMedia(baseDir))); }
      if (p.startsWith('/f/')) {
        const full = safeResolve(baseDir, p.slice(3));
        if (!full) { res.writeHead(403); return res.end('forbidden'); }
        return serveFile(req, res, full, u.searchParams.get('dl') === '1');
      }
      res.writeHead(404); res.end('not found');
    });
    server.on('error', (e) => { server = null; reject(e); });
    server.listen(port || 8770, '0.0.0.0', () => resolve(info()));
  });
}

function info() {
  const a = server && server.address();
  const port = a ? a.port : 8770;
  const ip = lanIP();
  return { running: true, ip, port, url: 'http://' + ip + ':' + port };
}
function stop() { if (server) { try { server.close(); } catch (_) {} server = null; } return { running: false }; }
function status() { return server ? info() : { running: false }; }

// ----- pagina movil (tema NAGI gacha-neon) -----
const PAGE = `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta name="theme-color" content="#0b0717"><title>NAGIDD Movil</title>
<style>
:root{--bg:#0b0717;--card:#171029;--pink:#ff4fa3;--pur:#9b5cff;--cy:#5ce1ff;--tx:#f1ebff;--mut:#9a8fc2}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:radial-gradient(1200px 600px at 80% -10%,#2a1650 0%,transparent 60%),var(--bg);color:var(--tx);font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding-bottom:96px}
header{position:sticky;top:0;z-index:5;background:linear-gradient(180deg,#0b0717 70%,transparent);padding:16px 14px 10px}
h1{margin:0;font-size:20px;font-weight:800;letter-spacing:.5px;background:linear-gradient(90deg,var(--pink),var(--pur),var(--cy));-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:var(--mut);font-size:12px;margin:2px 0 10px}
.search{width:100%;padding:11px 14px;border-radius:12px;border:1px solid #2c2148;background:#120c22;color:var(--tx);font-size:15px;outline:none}
.search:focus{border-color:var(--pur)}
ul{list-style:none;margin:0;padding:6px 10px 10px}
li{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid #241a3e;border-radius:14px;padding:11px 12px;margin:8px 0}
.play{flex:0 0 auto;width:42px;height:42px;border-radius:50%;border:none;background:linear-gradient(135deg,var(--pink),var(--pur));color:#fff;font-size:16px;display:grid;place-items:center}
.play.vid{background:linear-gradient(135deg,var(--pur),var(--cy))}
.meta{flex:1;min-width:0}
.nm{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dt{font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dl{flex:0 0 auto;width:40px;height:40px;border-radius:10px;border:1px solid #33264f;background:#160f29;color:var(--cy);font-size:18px;text-decoration:none;display:grid;place-items:center}
.empty{color:var(--mut);text-align:center;padding:40px 20px;font-size:14px}
#bar{position:fixed;left:0;right:0;bottom:0;background:#140d26;border-top:1px solid #2c2148;padding:8px 12px 14px;transform:translateY(120%);transition:.25s}
#bar.on{transform:none}
#bar .t{font-size:12px;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px}
audio,video{width:100%}
video{max-height:40vh;border-radius:10px;background:#000;margin-bottom:6px}
.badge{font-size:9px;font-weight:700;padding:2px 6px;border-radius:6px;background:#2a1d44;color:var(--cy);margin-left:6px}
</style></head><body>
<header>
  <h1>NAGIDD &#9834; Movil</h1>
  <div class="sub" id="count">Cargando...</div>
  <input class="search" id="q" placeholder="Buscar cancion o video...">
</header>
<ul id="list"></ul>
<div class="empty" id="empty" style="display:none">No hay canciones todavia.<br>Descarga algo con NAGIDD en el PC.</div>
<div id="bar"><div class="t" id="now"></div><div id="player"></div></div>
<script>
var data=[],fmtSize=function(b){if(!b)return'';var u=['B','KB','MB','GB'],i=0;while(b>=1024&&i<3){b/=1024;i++}return b.toFixed(b<10&&i>0?1:0)+u[i]};
function render(f){var ul=document.getElementById('list');ul.innerHTML='';var q=(f||'').toLowerCase();
 var items=data.filter(function(d){return!q||d.name.toLowerCase().indexOf(q)>=0||(d.folder||'').toLowerCase().indexOf(q)>=0});
 document.getElementById('empty').style.display=items.length?'none':'block';
 document.getElementById('count').textContent=data.length+' archivos &middot; '+'toca &#9654; para reproducir, &#11015; para bajar';
 items.forEach(function(d){var li=document.createElement('li');
  var meta=(d.folder?d.folder+'  &middot;  ':'')+fmtSize(d.size)+(d.audio?'':' <span class=badge>VIDEO</span>');
  li.innerHTML='<button class="play'+(d.audio?'':' vid')+'">&#9654;</button>'+
   '<div class=meta><div class=nm>'+esc(d.name)+'</div><div class=dt>'+meta+'</div></div>'+
   '<a class=dl href="/f/'+enc(d.rel)+'?dl=1">&#11015;</a>';
  li.querySelector('.play').onclick=function(){play(d)};
  ul.appendChild(li)})}
function esc(s){return s.replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
function enc(p){return p.split('/').map(encodeURIComponent).join('/')}
function play(d){var bar=document.getElementById('bar'),pl=document.getElementById('player');
 document.getElementById('now').innerHTML='&#9834; '+esc(d.name);
 var tag=d.audio?'audio':'video';
 pl.innerHTML='<'+tag+' controls autoplay playsinline src="/f/'+enc(d.rel)+'"></'+tag+'>';
 bar.classList.add('on')}
fetch('/api/list').then(function(r){return r.json()}).then(function(j){data=j;render('')}).catch(function(){document.getElementById('count').textContent='Error al cargar'});
document.getElementById('q').addEventListener('input',function(e){render(e.target.value)});
</script></body></html>`;

module.exports = { start, stop, status, lanIP };
