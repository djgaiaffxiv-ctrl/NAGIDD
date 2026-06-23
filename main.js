'use strict';
// NAGIDD - NAGI OG DOWNLOADER  ·  proceso principal de Electron.

const { app, BrowserWindow, ipcMain, shell, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const engine = require('./lib/engine');

let win;
let lastFails = '';

// ---------- Auto-actualizacion (electron-updater + GitHub Releases) ----------
function initAutoUpdate() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (_) { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async (i) => {
    const r = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['Reiniciar ahora', 'Mas tarde'], defaultId: 0, cancelId: 1,
      title: 'Actualizacion lista',
      message: 'NAGIDD ' + i.version + ' se ha descargado.',
      detail: 'Se instalara al reiniciar la aplicacion.'
    });
    if (r.response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 2 * 60 * 60 * 1000);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 920, minHeight: 660,
    backgroundColor: '#0b0717',
    title: 'NAGIDD',
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('maximize', () => win.webContents.send('win-state', true));
  win.on('unmaximize', () => win.webContents.send('win-state', false));
}

app.setAppUserModelId('com.nagistudios.nagidd');

// Rutas: instalado -> binarios en resources/bin, descargas a Descargas\NAGIDD del usuario.
//        desarrollo -> bin/ y Descargas/ del proyecto.
function initPaths() {
  if (app.isPackaged) {
    engine.init({
      binDir: path.join(process.resourcesPath, 'bin'),
      outDir: path.join(app.getPath('downloads'), 'NAGIDD')
    });
  } else {
    engine.init({ binDir: path.join(__dirname, 'bin'), outDir: path.join(__dirname, 'Descargas') });
  }
}

app.whenReady().then(() => {
  initPaths();
  createWindow();
  initAutoUpdate();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

const log = (line) => { try { win && win.webContents.send('log', line); } catch (_) {} };

// controles de ventana
ipcMain.handle('win:minimize', () => { win && win.minimize(); });
ipcMain.handle('win:maximize', () => { if (!win) return false; if (win.isMaximized()) { win.unmaximize(); return false; } win.maximize(); return true; });
ipcMain.handle('win:close', () => { win && win.close(); });
ipcMain.handle('open-folder', () => { shell.openPath(engine.OUT); });
ipcMain.handle('cancel', () => { engine.cancel(); });
ipcMain.handle('copy-fails', () => {
  if (!lastFails) { clipboard.writeText('NAGIDD: no hay videos con error en la ultima descarga.'); return; }
  clipboard.writeText(lastFails);
  try { fs.writeFileSync(path.join(engine.OUT, 'NAGIDD-fallos.txt'), lastFails, 'utf8'); } catch (_) {}
  log('Fallos copiados al portapapeles (y guardados en Descargas\\NAGIDD-fallos.txt).');
});

ipcMain.handle('download', async (e, payload) => {
  const res = await engine.runBatch(payload, log);
  lastFails = res.report || '';
  win && win.webContents.send('done', { ok: res.ok, fail: res.fail });
  return { ok: res.ok, fail: res.fail };
});
