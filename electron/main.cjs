const { app, BrowserWindow, dialog, ipcMain, Menu, clipboard } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

function toolPath(name) {
  if (process.platform === 'darwin') return path.join(process.arch === 'arm64' ? '/opt/homebrew/bin' : '/usr/local/bin', name);
  return name;
}

let mainWindow;
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

const recentPath = () => path.join(app.getPath('userData'), 'recent.json');
async function getRecent() {
  try { return JSON.parse(await fs.readFile(recentPath(), 'utf8')); }
  catch { return []; }
}
async function rememberFile(filePath) {
  const recent = await getRecent();
  const next = [filePath, ...recent.filter(item => item !== filePath)].slice(0, 15);
  await fs.mkdir(path.dirname(recentPath()), { recursive: true });
  await fs.writeFile(recentPath(), JSON.stringify(next));
}


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 650,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#f4f3f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (devServerUrl) mainWindow.loadURL(devServerUrl);
  else mainWindow.loadFile(path.join(__dirname, '..', 'renderer-dist', 'index.html'));
}

function sendCommand(command) { mainWindow?.webContents.send('app-command', command); }

function installMenu() {
  const template = [
    { role: 'appMenu', submenu: [
      { label: 'About Macrosoft Access', role: 'about' }, { type: 'separator' },
      { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => sendCommand('options') },
      { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }
    ]},
    { label: 'File', submenu: [
      { label: 'New Database', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('new') },
      { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('open') },
      { type: 'separator' },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('save') },
      { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendCommand('save-as') },
      { label: 'Back Up Database…', click: () => sendCommand('backup') },
      { label: 'Import Access File…', click: () => sendCommand('import-database') },
      { label: 'Import CSV…', click: () => sendCommand('import-csv') },
      { label: 'Export CSV…', click: () => sendCommand('export-csv') },
      { type: 'separator' },
      { label: 'Export Report as PDF…', click: () => sendCommand('export-pdf') },
      { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => sendCommand('print') },
      { type: 'separator' }, { role: 'close' }
    ]},
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' }, { label: 'Find Command…', accelerator: 'CmdOrCtrl+K', click: () => sendCommand('command-palette') }]},
    { label: 'View', submenu: [{ label: 'Switch View', accelerator: 'CmdOrCtrl+Shift+V', click: () => sendCommand('view') }, { label: 'Datasheet View', click: () => sendCommand('datasheet-view') }, { label: 'Design View', click: () => sendCommand('design-view') }, { type: 'separator' }, { role: 'togglefullscreen' }]},
    { label: 'Database', submenu: [
      { label: 'Create Table…', click: () => sendCommand('create-table') },
      { label: 'SQL Query', click: () => sendCommand('sql-query') },
      { label: 'Create Form', click: () => sendCommand('create-form') },
      { label: 'Create Report', click: () => sendCommand('create-report') },
      { label: 'Relationships', click: () => sendCommand('relationships') },
      { type: 'separator' }, { label: 'Check Integrity', click: () => sendCommand('integrity-check') }, { label: 'Compact Database', click: () => sendCommand('compact') }, { label: 'Database Information', click: () => sendCommand('database-info') }
    ]},
    { role: 'windowMenu' }, { role: 'help', submenu: [{ label: 'Command Palette', accelerator: 'CmdOrCtrl+K', click: () => sendCommand('command-palette') }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => { installMenu(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('file:new-path', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Create Database',
    defaultPath: 'Untitled.macrodb',
    filters: [{ name: 'Macrosoft Database', extensions: ['macrodb', 'sqlite', 'db'] }]
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('file:recent', async () => {
  const paths = await getRecent();
  return Promise.all(paths.map(async filePath => ({ path: filePath, name: path.basename(filePath), available: await fs.access(filePath).then(() => true, () => false) })));
});
ipcMain.handle('file:remove-recent', async (_event, filePath) => {
  await fs.writeFile(recentPath(), JSON.stringify((await getRecent()).filter(item => item !== filePath)));
  return true;
});
ipcMain.handle('file:choose-access', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Microsoft Access table data', properties: ['openFile'],
    filters: [{ name: 'Access database files', extensions: ['accdb', 'mdb'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('file:open', async (_event, requestedPath) => {
  let filePath = requestedPath;
  if (!filePath) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Database', properties: ['openFile'],
      filters: [
        { name: 'Supported databases', extensions: ['macrodb', 'sqlite', 'db', 'accdb', 'mdb'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (result.canceled) return null;
    filePath = result.filePaths[0];
  }
  const data = await fs.readFile(filePath);
  await rememberFile(filePath);
  return { path: filePath, name: path.basename(filePath), data: Array.from(data) };
});

ipcMain.handle('file:save', async (_event, { filePath, data, saveAs }) => {
  let target = filePath;
  if (!target || saveAs) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Database', defaultPath: target || 'Untitled.macrodb',
      filters: [{ name: 'Macrosoft Database', extensions: ['macrodb', 'sqlite', 'db'] }]
    });
    if (result.canceled) return null;
    target = result.filePath;
  }
  const temporary = `${target}.tmp-${process.pid}`;
  try {
    await fs.writeFile(temporary, Buffer.from(data));
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  await rememberFile(target);
  return { path: target, name: path.basename(target) };
});

ipcMain.handle('file:backup', async (_event, { name, data }) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Back Up Database', defaultPath: `${name || 'Database'} Backup ${stamp}.macrodb`,
    filters: [{ name: 'Database backup', extensions: ['macrodb', 'db'] }]
  });
  if (result.canceled) return null;
  await fs.writeFile(result.filePath, Buffer.from(data));
  return result.filePath;
});

ipcMain.handle('file:export-pdf', async (_event, name) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export PDF', defaultPath: `${name || 'Report'}.pdf`,
    filters: [{ name: 'PDF document', extensions: ['pdf'] }]
  });
  if (result.canceled) return null;
  const data = await mainWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
  await fs.writeFile(result.filePath, data);
  return result.filePath;
});

ipcMain.handle('file:import-csv', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import CSV', properties: ['openFile'],
    filters: [{ name: 'CSV file', extensions: ['csv'] }, { name: 'Text files', extensions: ['txt'] }]
  });
  if (result.canceled) return null;
  const filePath = result.filePaths[0];
  return { path: filePath, name: path.basename(filePath, path.extname(filePath)), text: await fs.readFile(filePath, 'utf8') };
});

ipcMain.handle('file:export-csv', async (_event, { name, csv }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export CSV', defaultPath: `${name || 'export'}.csv`,
    filters: [{ name: 'CSV file', extensions: ['csv'] }]
  });
  if (result.canceled) return false;
  await fs.writeFile(result.filePath, csv, 'utf8');
  return true;
});

ipcMain.handle('access:import', async (_event, filePath) => {
  try {
    const { stdout } = await execFileAsync(toolPath('mdb-tables'), ['-1', filePath], { maxBuffer: 10 * 1024 * 1024 });
    const names = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!names.length) return { ok: false, error: 'No readable tables were found in this Access database.' };
    const tables = [];
    for (const name of names) {
      const result = await execFileAsync(toolPath('mdb-export'), [filePath, name], { maxBuffer: 100 * 1024 * 1024 });
      tables.push({ name, csv: result.stdout });
    }
    return { ok: true, tables };
  } catch (error) {
    return {
      ok: false,
      error: error.code === 'ENOENT'
        ? 'Access import requires mdbtools. Install it with “brew install mdbtools”, then try again.'
        : `Could not read Access tables with mdbtools: ${error.message}`,
      detail: error.message
    };
  }
});

ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('clipboard:write', (_event, text) => { clipboard.writeText(String(text)); return true; });

ipcMain.handle('window:print', async () => {
  if (!mainWindow) return false;
  mainWindow.webContents.print({ printBackground: true });
  return true;
});
