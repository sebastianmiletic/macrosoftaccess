const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  newPath: () => ipcRenderer.invoke('file:new-path'),
  openFile: (path) => ipcRenderer.invoke('file:open', path),
  chooseAccessFile: () => ipcRenderer.invoke('file:choose-access'),
  recentFiles: () => ipcRenderer.invoke('file:recent'),
  removeRecent: (path) => ipcRenderer.invoke('file:remove-recent', path),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  backupFile: (payload) => ipcRenderer.invoke('file:backup', payload),
  exportPdf: (name) => ipcRenderer.invoke('file:export-pdf', name),
  importAccess: (path) => ipcRenderer.invoke('access:import', path),
  importCsv: () => ipcRenderer.invoke('file:import-csv'),
  exportCsv: (payload) => ipcRenderer.invoke('file:export-csv', payload),
  print: () => ipcRenderer.invoke('window:print'),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  onCommand: (callback) => ipcRenderer.on('app-command', (_event, command) => callback(command)),
  platform: process.platform
});
