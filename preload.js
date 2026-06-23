'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nagi', {
  // descargas
  download: (payload) => ipcRenderer.invoke('download', payload),
  cancel: () => ipcRenderer.invoke('cancel'),
  copyFails: () => ipcRenderer.invoke('copy-fails'),
  openFolder: () => ipcRenderer.invoke('open-folder'),

  // controles de ventana (frameless)
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winMaximize: () => ipcRenderer.invoke('win:maximize'),
  winClose: () => ipcRenderer.invoke('win:close'),
  onWinState: (cb) => ipcRenderer.on('win-state', (e, max) => cb(max)),

  // progreso en vivo
  onLog: (cb) => ipcRenderer.on('log', (e, line) => cb(line)),
  onDone: (cb) => ipcRenderer.on('done', (e, data) => cb(data))
});
