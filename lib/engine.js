'use strict';
// NAGIDD - motor de descarga (yt-dlp + ffmpeg + aria2c). Puro Node, testeable.

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const cookiesLib = require('./cookies');

let pathsFile = null; // archivo temporal donde yt-dlp escribe las rutas finales

const BASE = path.join(__dirname, '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133 Safari/537.36';

// Rutas configurables (en desarrollo: carpeta del proyecto; instalado: main.js las pasa)
let BIN, OUT, YTDLP, FFDIR, ARIA, DENO, GALLERYDL;
function init(cfg) {
  cfg = cfg || {};
  BIN = cfg.binDir || path.join(BASE, 'bin');
  OUT = cfg.outDir || path.join(BASE, 'Descargas');
  YTDLP = path.join(BIN, 'yt-dlp.exe');
  FFDIR = path.join(BIN, 'ffmpeg');
  ARIA = path.join(BIN, 'aria2c.exe');
  DENO = path.join(BIN, 'deno.exe');   // runtime JS para YouTube
  GALLERYDL = path.join(BIN, 'gallery-dl.exe');  // perfiles completos (fotos+videos)
  try { fs.mkdirSync(OUT, { recursive: true }); } catch (_) {}
}
init(); // por defecto (desarrollo / test standalone)

let current = null;   // proceso en curso
let canceled = false;

function cancel() { canceled = true; if (current) { try { current.kill(); } catch (_) {} } }

function sanitize(s) {
  s = (s || '').replace(/[\\/:*?"<>|]/g, '').trim();
  if (s.length > 120) s = s.slice(0, 120).trim();
  return s;
}

// Detecta si la URL es un PERFIL de red social (no un post/video suelto).
// Un perfil -> se baja entero con gallery-dl; un post -> yt-dlp.
function isProfileUrl(url) {
  const u = (url || '').toLowerCase();
  if (/instagram\.com\//.test(u))
    return !/instagram\.com\/(p|reel|reels|tv|stories|explore|accounts|share)\b/.test(u);
  if (/(twitter|x)\.com\//.test(u))
    return !/\/status\//.test(u) && !/(twitter|x)\.com\/(home|explore|search|messages|notifications|settings|i)\b/.test(u);
  if (/(facebook\.com|fb\.com)\//.test(u))
    return !/(\/watch|\/reel\/|\/videos?\/|\/video\.php|\/photo\b|\/photo\.php|\/posts\/|\/permalink|\/story|story_fbid|[?&]v=|fbid=|\/groups\/|\/events\/)/.test(u);
  return false;
}
function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'");
}

function runYtDlp(args, log) { return runProc(YTDLP, args, log); }

function runProc(exe, args, log) {
  return new Promise((resolve) => {
    const p = spawn(exe, args, { windowsHide: true });
    current = p;
    let err = '', outBuf = '';
    p.stdout.on('data', (d) => {
      outBuf += d.toString();
      let idx;
      while ((idx = outBuf.indexOf('\n')) >= 0) {
        const line = outBuf.slice(0, idx).replace(/\r$/, '');
        outBuf = outBuf.slice(idx + 1);
        if (line) log(line);
      }
    });
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => {
      if (outBuf.trim()) log(outBuf.trim());
      if (err.trim()) log(err.trim());
      current = null;
      resolve({ exit: code, err });
    });
    p.on('error', (e) => { current = null; resolve({ exit: -1, err: String(e) }); });
  });
}

function runYtDlpCapture(args) {
  return new Promise((resolve) => {
    const p = spawn(YTDLP, args, { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.on('close', () => resolve(out));
    p.on('error', () => resolve(out));
  });
}

function speedArgs() {
  let s = ['--concurrent-fragments', '8'];
  if (fs.existsSync(ARIA)) s = s.concat(['--downloader', ARIA, '--downloader-args', 'aria2c:-x16 -s16 -k1M']);
  return s;
}

// Cookies: devuelve ['--cookies', file] o ['--cookies-from-browser', browser] o null.
// Sirve igual para yt-dlp y para gallery-dl (mismos flags).
async function getCookieArgs(cookies, log) {
  if (!cookies || !cookies.enabled) return null;
  if (cookies.file) { log('Usando archivo de cookies: ' + path.basename(cookies.file)); return ['--cookies', cookies.file]; }
  const br = String(cookies.browser || 'brave').toLowerCase();
  if (br === 'firefox') { log('Usando cookies de Firefox...'); return ['--cookies-from-browser', 'firefox']; }
  if (cookiesLib.isChromium(br)) {
    const f = await cookiesLib.getCookiesFile(br, log);
    if (f) return ['--cookies', f];
    log('Sigo sin cookies (no servira para privados).');
    return null;
  }
  return ['--cookies-from-browser', br];
}

// Perfil completo (fotos + videos) con gallery-dl: Instagram, X, Facebook, etc.
async function runGalleryDl(url, cookies, log) {
  if (!fs.existsSync(GALLERYDL)) { log('Falta bin/gallery-dl.exe.'); return { exit: 1, err: 'no gallery-dl' }; }
  log('-> Perfil completo (gallery-dl): fotos + videos...');
  const cookieArgs = (await getCookieArgs(cookies, log)) || [];
  const hadCookies = cookieArgs.length > 0;
  const args = ['-d', OUT].concat(cookieArgs).concat([url]);
  const r = await runProc(GALLERYDL, args, log);
  r.gallery = true;
  if (r.exit !== 0) {
    const out = String(r.err || '');
    if (/AuthRequired|authenticated cookies needed|login.?required|NotFoundError|account.*private/i.test(out)) {
      if (!hadCookies) { log('!! Es un perfil PRIVADO: marca la casilla "Privado / con login" y elige tu navegador.'); r.err = 'Perfil privado: marca cookies (login).'; }
      else { log('!! No tienes acceso a este perfil privado (tu cuenta tiene que seguirlo / ser amiga).'); r.err = 'Perfil privado: tu cuenta no tiene acceso (debes seguir/ser amig@).'; }
    } else if (/KeyError|unexpected error|empty profile|'set_id'/i.test(out)) {
      log('!! Facebook no deja ver el contenido de este perfil.');
      log('   Suele ser porque es PRIVADO y tu cuenta no es amiga (solo se baja lo que tu cuenta puede ver).');
      r.err = 'Facebook: sin acceso al perfil (privado / no eres amig@ / FB lo bloquea).';
    }
  }
  return r;
}

async function startDownload(url, fmt, album, cookies, log) {
  if (fmt === 'perfil') return await runGalleryDl(url, cookies, log);

  // Si en una card de IG/FB/X pegan un PERFIL entero -> lo baja todo con gallery-dl
  // (yt-dlp daria "Unsupported URL" con un perfil; solo sirve para posts sueltos).
  if ((fmt === 'instagram' || fmt === 'facebook' || fmt === 'x') && isProfileUrl(url)) {
    log('Esto es un PERFIL completo, no un post -> lo bajo entero (gallery-dl).');
    return await runGalleryDl(url, cookies, log);
  }

  // Normalizacion
  const before = url;
  url = url.replace(/:\/\/(www\.)?txxx\.me\//, '://txxx.com/');
  if (/eporner\.com/.test(url)) {
    const m = url.match(/\/video-([0-9A-Za-z]{6,})(?:[/?#]|$)/) || url.match(/\/video-[a-z]+\/([0-9A-Za-z]{6,})/);
    if (m) url = 'https://www.eporner.com/video-' + m[1] + '/x/';
  }
  if (url !== before) log('URL normalizada: ' + url);

  const safeAlbum = album ? sanitize(String(album).replace(/%/g, '')) : '';
  const folderTok = safeAlbum || '%(playlist_title|Sueltas)s';
  const folderName = safeAlbum || 'Sueltas';
  if (safeAlbum) log('Carpeta: ' + safeAlbum);
  const tpl = path.join(OUT, folderTok + '\\%(playlist_index&{:02d} - |)s%(title)s.%(ext)s');

  let a;
  if (fmt === 'mp3') {
    log('-> MP3 (maxima calidad)...');
    a = ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '--embed-thumbnail', '--add-metadata',
      '--ffmpeg-location', FFDIR, '-o', tpl, '--no-mtime', url];
  } else if (fmt === 'instagram' || fmt === 'facebook') {
    log('-> ' + (fmt === 'facebook' ? 'Facebook' : 'Instagram') + ' (fotos, videos, reels, stories)...');
    // sin -f para que descargue tanto fotos (jpg) como videos (mp4); carruseles -> todos
    a = ['--add-metadata', '--ffmpeg-location', FFDIR, '-o', tpl, '--no-mtime', url];
  } else {
    log('-> MP4 (maxima calidad)...');
    a = ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4', '--add-metadata',
      '--ffmpeg-location', FFDIR, '-o', tpl, '--no-mtime', url];
  }
  a = speedArgs().concat(['--extractor-args', 'generic:impersonate'], a);
  if (DENO && fs.existsSync(DENO)) a = ['--js-runtimes', 'deno:' + DENO].concat(a);  // YouTube necesita runtime JS
  if (pathsFile) a = ['--print-to-file', 'after_move:filepath', pathsFile].concat(a);  // guarda la ruta final

  // Cookies (archivo / Firefox directo / Chromium via extraccion automatica CDP)
  const cookieArgs = await getCookieArgs(cookies, log);
  let r = cookieArgs ? await runYtDlp(cookieArgs.concat(a), log) : await runYtDlp(a, log);

  // Rescate KVS (no aplica a Instagram/Facebook/X)
  if (r.exit !== 0 && !/cookie/i.test(r.err) && !canceled && fmt !== 'instagram' && fmt !== 'facebook' && fmt !== 'x') {
    let murl = null, title = '', html = '';
    try { html = await (await fetch(url, { headers: { 'User-Agent': UA } })).text(); } catch (_) { html = ''; }
    if (html) {
      const cands = [];
      const re = /video(?:_alt)?_url\d*\s*:\s*["']([^"']+)["']/g;
      let mm;
      while ((mm = re.exec(html))) { if (/^https?:\/\//.test(mm[1])) cands.push(mm[1]); }
      if (cands.length) {
        murl = cands.sort((x, y) => {
          const rx = (x.match(/_(\d{3,4})p/) || [0, 0])[1];
          const ry = (y.match(/_(\d{3,4})p/) || [0, 0])[1];
          return Number(ry) - Number(rx);
        })[0];
      }
      const tm = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || html.match(/<title>([^<]+)<\/title>/i);
      if (tm) title = tm[1];
    }
    if (!murl) {
      const sel = fmt === 'mp3' ? 'ba/b' : 'bv*+ba/b';
      const info = await runYtDlpCapture(['--no-warnings', '--extractor-args', 'generic:impersonate', '-f', sel, '--print', '%(title)s', '--print', 'urls', url]);
      const u2 = info.split(/\r?\n/).find((l) => /^https?:\/\//.test(l));
      if (u2) { murl = u2; if (!title) title = info.split(/\r?\n/)[0]; }
    }
    if (murl) {
      log('Reintento via URL directa del video (rescate KVS)...');
      const st = sanitize(decodeHtml(title)) || 'video';
      const o2 = path.join(OUT, folderName + '\\' + st + '.%(ext)s');
      const ref = (url.match(/^(https?:\/\/[^/]+)/) || [])[1];
      let a2;
      if (fmt === 'mp3') {
        a2 = ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '--add-metadata', '--ffmpeg-location', FFDIR, '-o', o2, '--no-mtime', '--force-overwrites'];
      } else {
        a2 = ['--merge-output-format', 'mp4', '--add-metadata', '--ffmpeg-location', FFDIR, '-o', o2, '--no-mtime', '--force-overwrites'];
      }
      a2 = speedArgs().concat(a2);
      if (pathsFile) a2 = ['--print-to-file', 'after_move:filepath', pathsFile].concat(a2);
      if (ref) a2 = ['--referer', ref + '/'].concat(a2);
      a2.push(murl);
      r = await runYtDlp(a2, log);
    }
  }
  return r;
}

async function getVideoLinks(pageUrl, log) {
  let html = '';
  try { html = await (await fetch(pageUrl, { headers: { 'User-Agent': UA } })).text(); }
  catch (e) { log('  No pude abrir la pagina: ' + e.message); return []; }
  const origin = (pageUrl.match(/^(https?:\/\/[^/]+)/) || [])[1] || '';
  const set = new Set();
  const re = /href=["']([^"']+)["']/g;
  let mm;
  while ((mm = re.exec(html))) {
    let u = mm[1];
    if (/^\/\//.test(u)) u = 'https:' + u;
    else if (/^\//.test(u)) u = origin + u;
    if (!/^https?:\/\//.test(u)) continue;
    const m = u.match(/\/(videos?|watch|v|movie|movies|porn-movies|clips?|scene|scenes)\/([^/?#]+)/);
    if (m && m[2].length >= 4 && /[a-zA-Z]/.test(m[2])) set.add(u);
  }
  return Array.from(set);
}

async function runBatch(payload, log) {
  canceled = false;
  const fmt = payload.fmt || 'mp4';
  const album = payload.album || '';
  const cookies = payload.cookies || { enabled: false };
  let urls = (payload.urls || []).map((u) => u.trim()).filter(Boolean);

  // Archivo donde yt-dlp anota las rutas finales (para el boton "Ver")
  pathsFile = path.join(os.tmpdir(), 'nagidd-paths.txt');
  try { fs.writeFileSync(pathsFile, ''); } catch (_) { pathsFile = null; }

  if (payload.scrape) {
    const expanded = [];
    for (const g of urls) {
      if (canceled) break;
      log('Analizando galeria: ' + g);
      const found = await getVideoLinks(g, log);
      log('  -> ' + found.length + ' videos encontrados');
      expanded.push(...found);
    }
    urls = Array.from(new Set(expanded));
    log('');
    log('TOTAL de videos a descargar: ' + urls.length);
    if (!urls.length) { log('No encontre enlaces de video en esa(s) pagina(s).'); return { ok: 0, fail: 0, report: '' }; }
  }

  const fails = [];
  const n = urls.length;
  let i = 0, ok = 0, usedGallery = false;
  for (const u of urls) {
    if (canceled) { log('Cancelado.'); break; }
    i++;
    if (n > 1) { log(''); log('===== (' + i + '/' + n + ') ' + u + ' ====='); }
    let r = await startDownload(u, fmt, album, cookies, log);
    if (r.gallery) usedGallery = true;
    if (r.exit !== 0 && /403|429|503|522|Cloudflare|Too Many Requests|rate.?limit/i.test(r.err) && !canceled) {
      log('Bloqueo temporal de la web (Cloudflare/limite). Espero 10s y reintento...');
      await new Promise((res) => setTimeout(res, 10000));
      r = await startDownload(u, fmt, album, cookies, log);
    }
    if (r.exit === 0) ok++;
    else {
      const lines = r.err.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const el = (lines.filter((l) => /error/i.test(l)).pop() || lines.pop() || '(codigo ' + r.exit + ')').trim();
      fails.push({ url: u, err: el });
    }
  }

  let report = '';
  log('');
  if (fails.length) {
    report = 'NAGIDD - Videos con error (' + fails.length + '):\r\n';
    log('===== VIDEOS CON ERROR (' + fails.length + ') =====');
    for (const f of fails) { log(f.url); log('   -> ' + f.err); report += f.url + '\r\n   -> ' + f.err + '\r\n'; }
    log('');
    log("Pulsa 'Copiar fallos' (arriba) para enviarmelos y arreglarlos.");
  }
  log('');
  if (n > 1) log('TERMINADO.  OK: ' + ok + '   con error: ' + fails.length);
  else if (ok) log('==== LISTO! Guardado en la carpeta Descargas ====');
  else log('Termino con error. Revisa arriba.');

  // Rutas de los archivos descargados (para el boton "Ver")
  let files = [];
  if (fmt === 'perfil' || usedGallery) {
    if (ok) files = [OUT];   // perfil completo (gallery-dl) -> "Ver" abre la carpeta de descargas
  } else {
    try { files = fs.readFileSync(pathsFile, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean); } catch (_) {}
    files = files.filter((f) => fs.existsSync(f));
  }

  return { ok, fail: fails.length, report, files };
}

module.exports = { runBatch, cancel, init, get OUT() { return OUT; } };
