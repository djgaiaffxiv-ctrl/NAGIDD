'use strict';
// NAGIDD - extraccion automatica de cookies de navegadores Chromium.
// Los Chromium nuevos (127+) cifran las cookies (app-bound encryption) y yt-dlp
// no puede leerlas con --cookies-from-browser. Solucion: lanzar el navegador en
// modo headless con su depurador (CDP), pedirle las cookies YA DESCIFRADAS, y
// guardarlas en un cookies.txt que yt-dlp usa con --cookies.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const WebSocket = require('ws');

const CACHE_DIR = path.join(os.tmpdir(), 'nagidd-cookies');
const CACHE_MS = 120 * 60 * 1000; // 2 horas

const BROWSERS = {
  brave:  { proc: 'brave.exe',  udd: '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data',
    exes: ['%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', '%ProgramFiles(x86)%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'] },
  chrome: { proc: 'chrome.exe', udd: '%LOCALAPPDATA%\\Google\\Chrome\\User Data',
    exes: ['%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe', '%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe', '%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe'] },
  edge:   { proc: 'msedge.exe', udd: '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data',
    exes: ['%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe', '%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe'] },
  opera:  { proc: 'opera.exe',  udd: '%APPDATA%\\Opera Software\\Opera Stable',
    exes: ['%LOCALAPPDATA%\\Programs\\Opera\\opera.exe', '%LOCALAPPDATA%\\Programs\\Opera GX\\opera.exe'] }
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const resolveEnv = (s) => s.replace(/%([^%]+)%/g, (_, v) => process.env[v] || '');
function isRunning(proc) {
  try { return execSync('tasklist /FI "IMAGENAME eq ' + proc + '" /NH', { encoding: 'utf8' }).toLowerCase().includes(proc.toLowerCase()); }
  catch (_) { return false; }
}
function killProc(proc) { try { execSync('taskkill /F /IM ' + proc, { stdio: 'ignore' }); } catch (_) {} }

function getJSON(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

function cdpGetCookies(port) {
  return new Promise(async (resolve) => {
    let wsUrl = null;
    for (let i = 0; i < 50; i++) {
      try { const v = await getJSON('http://127.0.0.1:' + port + '/json/version'); wsUrl = v.webSocketDebuggerUrl; break; }
      catch (_) { await sleep(300); }
    }
    if (!wsUrl) return resolve(null);
    let done = false;
    const sock = new WebSocket(wsUrl);
    const finish = (val) => { if (done) return; done = true; try { sock.close(); } catch (_) {} resolve(val); };
    const timer = setTimeout(() => finish(null), 20000);
    sock.on('open', () => sock.send(JSON.stringify({ id: 1, method: 'Storage.getCookies' })));
    sock.on('message', (data) => {
      try { const m = JSON.parse(data.toString()); if (m.id === 1) { clearTimeout(timer); finish((m.result && m.result.cookies) || []); } } catch (_) {}
    });
    sock.on('error', () => { clearTimeout(timer); finish(null); });
  });
}

function toNetscape(cookies) {
  let out = '# Netscape HTTP Cookie File\n';
  for (const c of cookies) {
    if (!c.name) continue;
    const dom = c.domain || '';
    const inc = dom.startsWith('.') ? 'TRUE' : 'FALSE';
    const exp = c.session ? 0 : Math.floor(c.expires || 0);
    out += [dom, inc, c.path || '/', c.secure ? 'TRUE' : 'FALSE', exp, c.name, c.value].join('\t') + '\n';
  }
  return out;
}

// Devuelve la ruta a un cookies.txt del navegador (o null). log = funcion de progreso.
async function getCookiesFile(browser, log) {
  const cfg = BROWSERS[browser];
  if (!cfg) return null;
  const cacheFile = path.join(CACHE_DIR, browser + '.txt');
  try { if (Date.now() - fs.statSync(cacheFile).mtimeMs < CACHE_MS) { log('Cookies de ' + browser + ' (ya leidas hace poco).'); return cacheFile; } } catch (_) {}

  const exe = cfg.exes.map(resolveEnv).find(p => fs.existsSync(p));
  const udd = resolveEnv(cfg.udd);
  if (!exe || !fs.existsSync(udd)) { log('No encuentro ' + browser + ' instalado.'); return null; }

  if (isRunning(cfg.proc)) {
    log('Cierro ' + browser + ' un momento para leer las cookies (reabrelo cuando quieras, se restauran las pestanas)...');
    killProc(cfg.proc); await sleep(2000);
  }
  log('Leyendo cookies de ' + browser + ' (invisible)...');
  const port = 9412;
  const child = spawn(exe, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + udd,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--mute-audio'],
    { detached: true, stdio: 'ignore' });
  child.unref();

  const cookies = await cdpGetCookies(port);
  try { child.kill(); } catch (_) {}
  killProc(cfg.proc); // cerrar el headless

  if (!cookies || !cookies.length) { log('No pude leer las cookies de ' + browser + '.'); return null; }
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(cacheFile, toNetscape(cookies)); } catch (e) { log('Error guardando cookies: ' + e.message); return null; }
  log('Cookies de ' + browser + ' leidas (' + cookies.length + ').');
  return cacheFile;
}

module.exports = { getCookiesFile, isChromium: (b) => !!BROWSERS[b] };
