const { app, BrowserWindow, dialog, ipcMain, Menu, clipboard } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

function toolPath(name) {
  if (process.platform === 'darwin') return path.join(process.arch === 'arm64' ? '/opt/homebrew/bin' : '/usr/local/bin', name);
  return name;
}

let mainWindow;
let closeApproved = false;
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
  mainWindow.on('close', event => {
    if (closeApproved || mainWindow.webContents.isDestroyed() || mainWindow.webContents.isLoadingMainFrame()) return;
    event.preventDefault();
    mainWindow.webContents.send('app-command', 'request-quit');
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
      { label: 'Export Access Table Data…', click: () => sendCommand('export-access') },
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

const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  if (!hasInstanceLock) return;
  if (process.platform !== 'darwin') {
    dialog.showErrorBox('Macrosoft Access requires macOS', 'Only macOS is supported in this release. Linux support is planned for a later version.');
    app.quit();
    return;
  }
  installMenu();
  createWindow();
});
// A closed window must not leave an invisible copy running behind a new build.
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (process.platform === 'darwin' && BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('window:confirm-quit', async (event, dirty) => {
  if (event.sender !== mainWindow?.webContents) return 'cancel';
  if (!dirty) return 'discard';
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning', title: 'Unsaved database',
    message: 'Save changes before quitting Macrosoft Access?',
    detail: 'Discard will lose changes made since the last save.',
    buttons: ['Save', 'Cancel', 'Discard'], defaultId: 0, cancelId: 1, noLink: true
  });
  return ['save', 'cancel', 'discard'][response];
});
ipcMain.handle('window:finish-quit', event => {
  if (event.sender !== mainWindow?.webContents) return false;
  closeApproved = true;
  app.quit();
  return true;
});

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
  if (/\.(accdb|mdb)$/i.test(filePath)) {
    return { path: filePath, name: path.basename(filePath), access: true };
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
  if (!/\.(macrodb|sqlite|db)$/i.test(target)) throw new Error('Projects must be saved as .macrodb, .sqlite or .db. Use Export Access tables for a separate .accdb file.');
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

ipcMain.handle('file:export-access', async (_event, { name, payload }) => {
  if (typeof payload !== 'string' || !payload.startsWith('MDA-TABLES-1\n') || Buffer.byteLength(payload) > 40 * 1024 * 1024) {
    throw new Error('Invalid or oversized Access export. Use CSV for very large tables.');
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export table data to a new Access database',
    defaultPath: `${String(name || 'Database').replace(/[\\/]/g, '_')}.accdb`,
    filters: [{ name: 'Microsoft Access 2016 table data', extensions: ['accdb'] }]
  });
  if (result.canceled) return null;
  const target = result.filePath;
  if (!/\.accdb$/i.test(target)) throw new Error('Choose an .accdb destination.');
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'macrosoft-accdb-'));
  const jar = app.isPackaged ? path.join(process.resourcesPath, 'access-writer.jar') : path.join(__dirname, '..', 'access-writer', 'target', 'access-writer.jar');
  try {
    await fs.access(jar);
    const input = path.join(work, 'tables.txt');
    const output = path.join(work, 'export.accdb');
    await fs.writeFile(input, payload, { mode: 0o600 });
    try { await execFileAsync('/usr/bin/java', ['-jar', jar, input, output], { timeout: 120000, maxBuffer: 1024 * 1024 }); }
    catch (error) { throw new Error(`Access writer failed. Install Java 17 or newer and check table values. ${error.stderr || error.message}`); }
    // The Java writer only writes into a temporary directory. Never modify
    // a source Access file, even if the user selects an existing file name.
    try { await fs.access(target); throw new Error('Destination exists. Choose a new name; existing Access files are never overwritten.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.copyFile(output, target, require('node:fs').constants.COPYFILE_EXCL);
    return target;
  } finally { await fs.rm(work, { recursive: true, force: true }); }
});

ipcMain.handle('access:import', async (_event, filePath) => {
  try {
    const { stdout } = await execFileAsync(toolPath('mdb-tables'), ['-1', filePath], { maxBuffer: 10 * 1024 * 1024 });
    const names = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!names.length) return { ok: false, error: 'No readable tables were found in this Access database.' };
    const tables = [];
    for (const name of names) {
      const result = await execFileAsync(toolPath('mdb-export'), [filePath, name], { maxBuffer: 100 * 1024 * 1024 });
      let schema = '';
      let schemaWarning = null;
      try {
        const parsed = await execFileAsync(toolPath('mdb-schema'), ['-T', name, filePath, 'sqlite'], { maxBuffer: 10 * 1024 * 1024 });
        schema = parsed.stdout;
      } catch (error) {
        schemaWarning = `Schema for “${name}” could not be inspected; imported columns will use TEXT (${error.message}).`;
      }
      tables.push({ name, csv: result.stdout, schema, schemaWarning });
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
