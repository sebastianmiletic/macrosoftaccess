import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import logoUrl from '../assets/logo-transparent.png';
import { migrateMetadata, METADATA_VERSION } from './metadata.js';
import { createImportReport, uniqueHeaders } from './compatibility.js';
import { defaultFormSettings, normalizeFormSettings, FORM_CONTROL_TYPES } from './form-model.js';
import { fieldMapping, parseAccessPrimaryKey } from './access-schema.js';
import { translateAccessSql, registerAccessFunctions } from './access-sql.js';
import { normalizeReportSettings } from './report-model.js';
import { accessExportPayload } from './access-export.js';

const SQL = await initSqlJs({ locateFile: () => wasmUrl });

const state = {
  db: null,
  filePath: null,
  fileName: null,
  dirty: false,
  objects: { tables: [], queries: [], forms: [], reports: [] },
  tabs: [],
  activeTab: null,
  selectedObject: null,
  rowSelection: null,
  formIndex: 0,
  lastResults: null,
  commandSelection: 0,
  filter: null,
  importReport: null,
  backstagePage: 'info',
  settings: { theme: 'light', density: 'compact', confirmActions: true, rows: 1000, sqlDialect: 'sqlite' }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const quoteId = (name) => `"${String(name).replaceAll('"', '""')}"`;
const appTitle = 'Macrosoft Access';
try { Object.assign(state.settings, JSON.parse(localStorage.getItem('macrosoft-access-settings') || '{}')); } catch { /* Invalid old preferences. */ }
document.documentElement.dataset.theme = state.settings.theme;
document.documentElement.dataset.density = state.settings.density;

function toast(message, kind = '') {
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.textContent = message;
  $('#toastRegion').append(node);
  setTimeout(() => node.remove(), 3400);
}

function setStatus(message, record = '') {
  $('#statusText').textContent = message;
  $('#recordStatus').textContent = record;
}

function markDirty(value = true) {
  state.dirty = value;
  const prefix = value ? '• ' : '';
  $('#windowTitle').textContent = `${prefix}${state.fileName || 'Untitled'} — ${appTitle}`;
}

function ensureDb() {
  if (state.db) return true;
  toast('Create or open a database first.', 'error');
  return false;
}

function createMetadata() {
  return migrateMetadata(state.db);
}

function rowsFromExec(sql, params = []) {
  const statement = state.db.prepare(sql);
  if (params.length) statement.bind(params);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

function refreshObjects() {
  if (!state.db) {
    state.objects = { tables: [], queries: [], forms: [], reports: [] };
    renderObjectTree();
    return;
  }
  state.objects.tables = rowsFromExec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_mda_%' ORDER BY name").map(r => r.name);
  for (const type of ['query', 'form', 'report']) {
    state.objects[type === 'query' ? 'queries' : `${type}s`] = rowsFromExec('SELECT name, source, settings FROM _mda_objects WHERE type=? ORDER BY name', [type]);
  }
  renderObjectTree();
}

function renderObjectTree(filter = '') {
  const needle = filter.toLowerCase();
  const groups = [
    ['Tables', state.objects.tables.map(name => ({ name, type: 'table' })), '▦'],
    ['Queries', state.objects.queries.map(item => ({ ...item, type: 'query' })), '⌘'],
    ['Forms', state.objects.forms.map(item => ({ ...item, type: 'form' })), '▣'],
    ['Reports', state.objects.reports.map(item => ({ ...item, type: 'report' })), '▥']
  ];
  $('#objectTree').innerHTML = groups.map(([title, items, icon]) => {
    const visible = items.filter(item => item.name.toLowerCase().includes(needle));
    return `<section class="object-group"><div class="object-group-title"><span>▾</span>${title}<span>(${visible.length})</span></div>${visible.map(item => `<button class="object-row ${state.selectedObject?.type === item.type && state.selectedObject?.name === item.name ? 'selected' : ''}" data-object-type="${item.type}" data-object-name="${escapeHtml(item.name)}"><span class="object-icon">${icon}</span><span>${escapeHtml(item.name)}</span></button>`).join('')}</section>`;
  }).join('');
}

function updateFileInfo() {
  if (!$('#backstage').classList.contains('hidden')) renderBackstage(state.backstagePage);
}

let backstageCloseTimer;
function closeBackstage() {
  const backstage = $('#backstage');
  if (backstage.classList.contains('hidden') || backstage.classList.contains('closing')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    backstage.classList.add('hidden');
    return;
  }
  backstage.classList.add('closing');
  backstageCloseTimer = window.setTimeout(() => {
    backstage.classList.add('hidden');
    backstage.classList.remove('closing');
  }, 170);
}

function showBackstage(page = 'info') {
  clearTimeout(backstageCloseTimer);
  $('#backstage').classList.remove('hidden', 'closing');
  renderBackstage(page);
}

async function renderBackstage(page = 'info') {
  state.backstagePage = page;
  $$('[data-file-page]').forEach(button => button.classList.toggle('active', button.dataset.filePage === page));
  const content = $('#backstageContent');
  const row = (icon, title, description, action) => `<div class="file-action-row"><span>${icon}</span><div><strong>${title}</strong><p>${description}</p></div><button class="secondary-button" data-action="${action}">Open</button></div>`;
  const recentRows = recent => recent.length ? recent.map(item => `<div class="recent-row"><button data-recent-path="${escapeHtml(item.path)}" ${item.available ? '' : 'disabled'}><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.path)}${item.available ? '' : ' · Unavailable'}</small></button><button class="recent-remove" data-remove-recent="${escapeHtml(item.path)}" title="Remove from recent">×</button></div>`).join('') : '<p>No recent databases yet. Create one or browse for a local file.</p>';
  if (page === 'home') {
    content.innerHTML = `<div class="file-home"><h1>Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}</h1><section class="home-new"><h2>New</h2><div class="home-templates"><button data-action="new"><span class="template-symbol">▤</span><strong>Blank database</strong></button><button data-action="template-contacts"><span class="template-symbol">♙</span><strong>Contacts</strong></button><button data-action="template-inventory"><span class="template-symbol">▦</span><strong>Inventory</strong></button><button data-action="template-tasks"><span class="template-symbol">☑</span><strong>Tasks</strong></button></div></section><section class="home-recent"><div class="home-recent-header"><h2>Recent databases</h2><button class="secondary-button" data-action="open">Browse files…</button></div><label class="home-search">⌕ <input id="homeRecentSearch" type="search" aria-label="Search recent databases" placeholder="Search recent databases"></label><div id="recentList" class="recent-list">Loading recent files…</div></section><p class="compat-note">Projects use local SQLite files. Access table data can be imported or exported to a new .accdb, but existing Access files cannot be edited in place.</p><p id="buildVersion" class="build-version" aria-label="App version">Version loading…</p></div>`;
    window.desktop.version().then(version => { if (state.backstagePage === 'home' && $('#buildVersion')) $('#buildVersion').textContent = `Macrosoft Access ${version}`; }).catch(() => {});
    try {
      const recent = await window.desktop.recentFiles();
      if (state.backstagePage === 'home') $('#recentList').innerHTML = recentRows(recent);
    } catch (error) { if (state.backstagePage === 'home') $('#recentList').textContent = `Could not load recent files: ${error.message}`; }
  } else if (page === 'info') {
    content.innerHTML = `<h1>Database information</h1><div class="file-info"><img class="file-logo" src="${logoUrl}" alt="Macrosoft Access logo" /><div><h2>${escapeHtml(state.fileName || 'No database open')}</h2><p>${escapeHtml(state.filePath || 'Create or open a database to begin.')}</p></div></div><div class="file-actions">${row('ⓘ', 'Properties', 'Tables, records, file size and storage engine.', 'database-info')}${row('◎', 'Compatibility report', 'See preserved, converted and unsupported Access objects.', 'compatibility-report')}${row('⧉', 'Back up database', 'Save a separate portable snapshot.', 'backup')}${row('✓', 'Check integrity', 'Inspect SQLite pages and indexes.', 'integrity-check')}${row('◫', 'Compact database', 'Reclaim unused storage.', 'compact')}</div><p class="compat-note">Access .mdb/.accdb table data can be imported with mdbtools. Projects use SQLite, not the Microsoft Access engine. Export can create a separate .accdb with table data only.</p>`;
  } else if (page === 'new') {
    content.innerHTML = `<h1>New</h1><p class="page-lede">Start with a blank database or a ready-to-edit local template.</p><div class="template-list">${row('▦', 'Blank database', 'Create your own tables and relationships.', 'new')}${row('♟', 'Contacts', 'People, organisations and contact details.', 'template-contacts')}${row('▤', 'Inventory', 'Products, quantities and stock locations.', 'template-inventory')}${row('✓', 'Tasks', 'Track tasks, owners, priorities and due dates.', 'template-tasks')}</div>`;
  } else if (page === 'open') {
    content.innerHTML = `<h1>Open</h1><p class="page-lede"><button class="primary-button" data-action="open">Browse files…</button></p><h2>Recent databases</h2><div id="recentList" class="recent-list">Loading recent files…</div>`;
    try {
      const recent = await window.desktop.recentFiles();
      if (state.backstagePage !== 'open') return;
      $('#recentList').innerHTML = recentRows(recent);
    } catch (error) { $('#recentList').textContent = `Could not load recent files: ${error.message}`; }
  } else if (page === 'import') {
    content.innerHTML = `<h1>Import</h1><p class="page-lede">Bring data into a local database.</p><div class="file-actions">${row('CSV', 'Text / CSV', 'Create a new table from a header row and records.', 'import-csv')}${row('▦', 'Access .mdb / .accdb', 'Import table data using mdbtools. Objects and VBA are not preserved.', 'import-database')}</div>`;
  } else if (page === 'export') {
    content.innerHTML = `<h1>Export</h1><p class="page-lede">Export the current table, query result or report.</p><div class="file-actions">${row('CSV', 'CSV', 'Export current result data as comma-separated values.', 'export-csv')}${row('PDF', 'PDF', 'Save the active report or document as a PDF.', 'export-pdf')}${row('▦', 'Access .accdb table data', 'Create a new Access 2016 file containing local tables and values only; Java 17+ required.', 'export-access')}${row('⧉', 'Database backup', 'Export a complete SQLite database snapshot.', 'backup')}</div>`;
  } else if (page === 'options') {
    const s = state.settings;
    content.innerHTML = `<h1>Options</h1><p class="page-lede">Application preferences are saved on this Mac.</p><div class="settings-group"><h2>Appearance</h2><label>Theme<select data-setting="theme"><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark</option></select></label><label>Interface density<select data-setting="density"><option value="compact" ${s.density === 'compact' ? 'selected' : ''}>Compact</option><option value="comfortable" ${s.density === 'comfortable' ? 'selected' : ''}>Comfortable</option></select></label></div><div class="settings-group"><h2>Editing</h2><label>Query result limit<select data-setting="rows"><option value="100" ${s.rows === 100 ? 'selected' : ''}>100 rows</option><option value="1000" ${s.rows === 1000 ? 'selected' : ''}>1,000 rows</option><option value="10000" ${s.rows === 10000 ? 'selected' : ''}>10,000 rows</option></select></label><label class="check-setting"><input type="checkbox" data-setting="confirmActions" ${s.confirmActions ? 'checked' : ''}> Confirm SQL that modifies data or schema</label></div><div class="settings-group"><h2>Queries</h2><label>Default SQL dialect<select data-setting="sqlDialect"><option value="sqlite" ${s.sqlDialect !== 'access' ? 'selected' : ''}>SQLite</option><option value="access" ${s.sqlDialect === 'access' ? 'selected' : ''}>Access-style subset</option></select></label><p>Access-style mode translates selected expressions and SELECT TOP. It does not implement the full Access SQL dialect.</p></div><div class="settings-group"><h2>Current database</h2><label>Default table view<select data-db-setting="defaultTableView" ${state.db ? '' : 'disabled'}><option value="datasheet" ${databaseSetting('defaultTableView', 'datasheet') === 'datasheet' ? 'selected' : ''}>Datasheet</option><option value="design" ${databaseSetting('defaultTableView', 'datasheet') === 'design' ? 'selected' : ''}>Design</option></select></label><p>${state.db ? 'Saved inside this database.' : 'Open a database to edit its settings.'}</p></div>`;
  } else if (page === 'help') {
    content.innerHTML = `<h1>Help</h1><div class="file-actions"><h2>Keyboard shortcuts</h2><p>⌘N New database · ⌘O Open · ⌘S Save · ⌘K Search commands · ⌘↵ Run SQL · ⌘, Options</p><h2>Compatibility</h2><p>Macrosoft Access is a local SQLite-based database app. It is not Microsoft Access. Access table-data import requires mdbtools. A separate new .accdb table-data export requires Java 17+. Editing an existing .accdb, VBA, and native Access forms and reports are not available.</p><h2>Data safety</h2><p>Save regularly and keep backups of important databases. SQL commands can change or delete data.</p></div>`;
  }
}

function databaseSetting(key, fallback) {
  if (!state.db) return fallback;
  return rowsFromExec('SELECT value FROM _mda_preferences WHERE key=?', [key])[0]?.value ?? fallback;
}

async function createTemplate(kind) {
  if (!(await newDatabase(true))) return;
  const definitions = {
    contacts: `CREATE TABLE Contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, organisation TEXT, email TEXT, phone TEXT, notes TEXT);`,
    inventory: `CREATE TABLE Products (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT UNIQUE, product_name TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, location TEXT, unit_price REAL);`,
    tasks: `CREATE TABLE Tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, owner TEXT, priority TEXT DEFAULT 'Normal', due_date TEXT, completed INTEGER NOT NULL DEFAULT 0);`
  };
  if (!definitions[kind]) return;
  state.db.run(definitions[kind]);
  state.fileName = `${kind[0].toUpperCase()}${kind.slice(1)}.macrodb`;
  markDirty(); refreshObjects();
  openObject('table', kind === 'contacts' ? 'Contacts' : kind === 'inventory' ? 'Products' : 'Tasks');
  closeBackstage();
  toast(`${kind} template created`);
}

async function newDatabase(fromTemplate = false) {
  if (!(await confirmDiscard())) return false;
  state.db?.close();
  state.db = new SQL.Database();
  registerAccessFunctions(state.db);
  createMetadata();
  state.filePath = null;
  state.fileName = 'Untitled.macrodb';
  state.filter = null;
  state.importReport = null;
  state.tabs = [];
  state.activeTab = null;
  state.selectedObject = null;
  markDirty(true);
  refreshObjects();
  renderTabs();
  showWelcome(false);
  if (!fromTemplate) $('#tableDialog').showModal();
  closeBackstage();
  updateFileInfo();
  setStatus('New database created');
  return true;
}

async function confirmDiscard() {
  if (!state.dirty) return true;
  return window.confirm('This database has unsaved changes. Continue without saving?');
}

let quitInProgress = false;
async function requestQuit() {
  if (quitInProgress) return;
  quitInProgress = true;
  try {
    const answer = await window.desktop.confirmQuit(state.dirty);
    if (answer === 'save') {
      await saveDatabase();
      if (state.dirty) return; // Canceled the save dialog or the write failed.
    } else if (answer !== 'discard') return;
    await window.desktop.finishQuit();
  } catch (error) { toast(`Could not quit safely: ${error.message}`, 'error'); }
  finally { quitInProgress = false; }
}

async function chooseAccessImport() {
  try {
    const filePath = await window.desktop.chooseAccessFile();
    if (filePath) await openDatabase(filePath);
  } catch (error) { toast(`Could not choose Access file: ${error.message}`, 'error'); }
}

async function openDatabase(requestedPath) {
  if (!(await confirmDiscard())) return;
  let file;
  try { file = await window.desktop.openFile(requestedPath); }
  catch (error) { toast(`Could not open file: ${error.message}`, 'error'); return; }
  if (!file) return;
  if (file.access) return importAccessDatabase(file);
  const bytes = new Uint8Array(file.data || []);
  if (new TextDecoder().decode(bytes.slice(0, 16)) !== 'SQLite format 3\0') {
    toast('This is not a SQLite database. Use Import Access for .mdb/.accdb files.', 'error');
    return;
  }
  let incoming;
  try { incoming = new SQL.Database(bytes); }
  catch (error) { toast(`Could not open database: ${error.message}`, 'error'); return; }
  let migrated;
  try { registerAccessFunctions(incoming); migrated = migrateMetadata(incoming); }
  catch (error) {
    incoming.close();
    toast(`Could not open database: ${error.message}`, 'error');
    return;
  }
  state.db?.close();
  state.db = incoming;
  state.filePath = file.path;
  state.fileName = file.name;
  finishOpen(migrated ? 'Database opened. Save to preserve updated project metadata.' : 'Database opened');
  try {
    const json = rowsFromExec("SELECT value FROM _mda_meta WHERE key='import_report'")[0]?.value;
    state.importReport = json ? JSON.parse(json) : null;
  } catch { state.importReport = null; }
  if (migrated) markDirty(true);
}

async function importAccessDatabase(file) {
  setStatus('Importing Access table data…');
  const imported = await window.desktop.importAccess(file.path);
  if (!imported.ok) {
    toast(imported.error, 'error');
    setStatus('Import failed');
    return;
  }
  const incoming = new SQL.Database();
  try {
    registerAccessFunctions(incoming);
    migrateMetadata(incoming);
    let count = 0;
    const details = [];
    const used = new Set();
    incoming.run('SAVEPOINT access_import');
    for (const table of imported.tables) {
      const data = parseCsv(table.csv);
      if (!data.length || !data[0].length) throw new Error(`Table “${table.name}” has no readable column headers.`);
      const headers = uniqueHeaders(data[0]);
      const fields = fieldMapping(headers, table.schema);
      const sourceKeys = parseAccessPrimaryKey(table.schema);
      const normalizedKeys = sourceKeys.map(key => {
        const matches = data[0].map((header, index) => header.toLowerCase() === key.toLowerCase() ? headers[index] : null).filter(Boolean);
        return matches.length === 1 ? matches[0] : null;
      });
      let keys = sourceKeys.length && normalizedKeys.every(Boolean) ? normalizedKeys : [];
      let keyWarning = sourceKeys.length && !keys.length ? 'Source primary key could not be mapped uniquely and was not imported.' : null;
      if (keys.length) {
        const indexes = keys.map(key => headers.indexOf(key));
        const values = new Set();
        for (const row of data.slice(1)) {
          const tuple = indexes.map(index => row[index] ?? null);
          const signature = JSON.stringify(tuple);
          if (tuple.some(value => value === null || value === '') || values.has(signature)) {
            keys = [];
            keyWarning = 'Source primary key has blank or duplicate exported values; imported as plain columns.';
            break;
          }
          values.add(signature);
        }
      }
      const base = String(table.name).replace(/[^\p{L}\p{N}_ ]/gu, '_') || 'ImportedTable';
      let safeName = base;
      let suffix = 2;
      while (used.has(safeName.toLocaleLowerCase()) || safeName.startsWith('_mda_')) safeName = `${base}_${suffix++}`;
      used.add(safeName.toLocaleLowerCase());
      const records = Math.max(0, data.length - 1);
      const createAndFill = () => {
        const keySql = keys.length ? `, PRIMARY KEY (${keys.map(quoteId).join(', ')})` : '';
        incoming.run(`CREATE TABLE ${quoteId(safeName)} (${fields.map(field => `${quoteId(field.name)} ${field.targetType}${keys.includes(field.name) ? ' NOT NULL' : ''}`).join(', ')}${keySql})`);
        if (records) {
          const insert = incoming.prepare(`INSERT INTO ${quoteId(safeName)} VALUES (${headers.map(() => '?').join(',')})`);
          try { for (const row of data.slice(1)) insert.run(headers.map((_, i) => row[i] ?? null)); }
          finally { insert.free(); }
        }
      };
      incoming.run('SAVEPOINT import_table');
      try { createAndFill(); incoming.run('RELEASE import_table'); }
      catch (error) {
        incoming.run('ROLLBACK TO import_table');
        incoming.run('RELEASE import_table');
        if (!keys.length || !/constraint/i.test(error.message)) throw error;
        keys = [];
        keyWarning = `Source primary key could not be recreated in SQLite (${error.message}); table values were imported without a key.`;
        createAndFill();
      }
      count += records;
      details.push({ source: table.name, target: safeName, columns: headers.length, records, fields, primaryKey: keys, warning: [table.schemaWarning, keyWarning].filter(Boolean).join(' ') || null });
    }
    const report = createImportReport(file.name, details, count);
    incoming.run("INSERT INTO _mda_meta(key,value) VALUES('import_report',?)", [JSON.stringify(report)]);
    incoming.run('RELEASE access_import');
    state.db?.close();
    state.db = incoming;
    state.filePath = null;
    state.fileName = file.name.replace(/\.(accdb|mdb)$/i, '.macrodb');
    finishOpen(`Imported ${details.length} tables and ${count} records`);
    state.importReport = report;
    markDirty(true);
    showCompatibilityReport();
    toast('Access data imported. Review the compatibility report, then save.');
  } catch (error) {
    incoming.close();
    toast(`Import failed; your original database is unchanged: ${error.message}`, 'error');
    setStatus('Import failed');
  }
}

function finishOpen(message) {
  state.tabs = [];
  state.activeTab = null;
  state.selectedObject = null;
  state.filter = null;
  markDirty(false);
  refreshObjects();
  renderTabs();
  showWelcome(false);
  closeBackstage();
  updateFileInfo();
  setStatus(message);
}

async function saveDatabase(saveAs = false) {
  if (!ensureDb()) return;
  const data = Array.from(state.db.export());
  let saved;
  try { saved = await window.desktop.saveFile({ filePath: state.filePath, data, saveAs }); }
  catch (error) { toast(`Could not save database: ${error.message}`, 'error'); return; }
  if (!saved) return;
  state.filePath = saved.path;
  state.fileName = saved.name;
  markDirty(false);
  updateFileInfo();
  setStatus(`Saved ${saved.name}`);
  toast('Database saved');
}

function closeDatabase() {
  if (!state.db) return;
  if (state.dirty && !window.confirm('Close without saving changes?')) return;
  state.db.close();
  state.db = null;
  state.filePath = null;
  state.fileName = null;
  state.filter = null;
  state.importReport = null;
  state.tabs = [];
  state.activeTab = null;
  refreshObjects();
  renderTabs();
  showWelcome(true);
  markDirty(false);
  closeBackstage();
  updateFileInfo();
}

function showWelcome(show = true) {
  if (!show && state.db) {
    $('#documentSurface').innerHTML = `<div class="welcome"><img class="welcome-emblem" src="${logoUrl}" alt="Macrosoft Access logo" /><h1>${escapeHtml(state.fileName || 'Untitled database')}</h1><p>Select an object on the left, or use Create to add tables, queries, forms, and reports.</p><div class="welcome-actions"><button class="primary-button" data-action="create-table">Create table</button><button class="secondary-button" data-action="sql-query">Write a query</button></div></div>`;
  } else {
    $('#documentSurface').innerHTML = `<div class="welcome"><img class="welcome-emblem" src="${logoUrl}" alt="Macrosoft Access logo" /><h1>Build a database</h1><p>Create a local database or open an existing project. Your data stays on this Mac.</p><div class="welcome-actions"><button class="primary-button" data-action="new">New blank database</button><button class="secondary-button" data-action="open">Open database</button></div><div class="feature-list"><span>▦ Editable tables</span><span>⌘ Visual and SQL queries</span><span>▣ Forms</span><span>▥ Printable reports</span></div></div>`;
  }
}

function createTable(view = 'datasheet') {
  if (!ensureDb()) return;
  state.newTableView = view;
  $('#tableName').value = nextName('Table', state.objects.tables);
  $('#tableDialog').showModal();
  setTimeout(() => $('#tableName').select(), 0);
}

function nextName(prefix, items) {
  const names = items.map(item => typeof item === 'string' ? item : item.name);
  let number = 1;
  while (names.includes(`${prefix}${number}`)) number++;
  return `${prefix}${number}`;
}

function uniqueTableName(name) {
  const base = String(name).replace(/[^\p{L}\p{N}_ ]/gu, '_') || 'ImportedTable';
  let candidate = base;
  let i = 2;
  while (state.objects.tables.includes(candidate) || rowsFromExec("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [candidate]).length) candidate = `${base}_${i++}`;
  return candidate;
}

function submitTable(event) {
  event.preventDefault();
  const name = $('#tableName').value.trim();
  const fields = $('#tableFields').value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!name || !fields.length) return toast('Enter a table name and at least one field.', 'error');
  if (!fields.every(field => /^[\p{L}_][\p{L}\p{N}_ ]*\s+(INTEGER|REAL|TEXT|BLOB|NUMERIC|DATE|DATETIME|BOOLEAN)(\s+.*)?$/iu.test(field))) {
    return toast('Each field needs a name and supported SQLite type.', 'error');
  }
  try {
    state.db.run(`CREATE TABLE ${quoteId(name)} (${fields.map(field => {
      const firstSpace = field.indexOf(' ');
      return `${quoteId(field.slice(0, firstSpace))} ${field.slice(firstSpace + 1)}`;
    }).join(', ')})`);
    $('#tableDialog').close();
    markDirty();
    refreshObjects();
    openObject('table', name);
    if (state.newTableView === 'design') setTableView('design');
    toast(`Table “${name}” created`);
  } catch (error) { toast(error.message, 'error'); }
}

function getColumns(table) {
  return rowsFromExec(`PRAGMA table_info(${quoteId(table)})`);
}

function openObject(type, name) {
  if (!ensureDb()) return;
  state.selectedObject = { type, name };
  const id = `${type}:${name}`;
  if (!state.tabs.some(tab => tab.id === id)) state.tabs.push({ id, type, name, view: type === 'table' ? databaseSetting('defaultTableView', 'datasheet') : undefined });
  state.activeTab = id;
  state.formIndex = 0;
  renderObjectTree($('#objectSearch').value);
  renderTabs();
  renderActiveTab();
}

function updateContextualRibbon() {
  const type = state.tabs.find(tab => tab.id === state.activeTab)?.type;
  const pages = { table: ['table-fields', 'table-design'], query: ['query-tools'], queryDesign: ['query-tools'], form: ['form-tools'], report: ['report-tools'] }[type] || [];
  $$('.ribbon-tab.contextual').forEach(tab => tab.classList.toggle('hidden', !pages.includes(tab.dataset.tab)));
  $('#contextRibbonLabel').classList.toggle('hidden', !pages.length);
  $('#contextRibbonLabel').textContent = type === 'table' ? 'TABLE TOOLS' : type === 'query' || type === 'queryDesign' ? 'QUERY TOOLS' : type === 'form' ? 'FORM TOOLS' : 'REPORT TOOLS';
  if ($('.ribbon-tab.active.contextual.hidden')) {
    $$('.ribbon-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === 'home'));
    $$('.ribbon-page').forEach(page => page.classList.toggle('active', page.dataset.page === 'home'));
  }
  if (type === 'table' && $('.ribbon-tab.active')?.dataset.tab === 'home') {
    const page = state.tabs.find(tab => tab.id === state.activeTab)?.view === 'design' ? 'table-design' : 'table-fields';
    $$('.ribbon-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === page));
    $$('.ribbon-page').forEach(ribbon => ribbon.classList.toggle('active', ribbon.dataset.page === page));
  }
}

function renderTabs() {
  updateContextualRibbon();
  $('#documentTabs').innerHTML = state.tabs.map(tab => `<button class="document-tab ${state.activeTab === tab.id ? 'active' : ''}" data-tab-id="${escapeHtml(tab.id)}" role="tab"><span>${tab.type === 'table' ? '▦' : tab.type === 'query' ? '⌘' : tab.type === 'form' ? '▣' : '▥'}</span><span class="tab-name">${escapeHtml(tab.name)}</span><span class="tab-close" data-close-tab="${escapeHtml(tab.id)}">×</span></button>`).join('');
  renderViewControls();
}

function closeTab(id) {
  state.tabs = state.tabs.filter(tab => tab.id !== id);
  if (state.activeTab === id) state.activeTab = state.tabs.at(-1)?.id || null;
  renderTabs();
  if (state.activeTab) renderActiveTab(); else showWelcome(!state.db);
}

function renderActiveTab() {
  const tab = state.tabs.find(item => item.id === state.activeTab);
  if (!tab) return showWelcome(!state.db);
  if (tab.type === 'table') tab.view === 'design' ? renderTableDesign(tab.name) : renderDatasheet(tab.name);
  else if (tab.type === 'query') renderQuery(tab.name);
  else if (tab.type === 'form') tab.view === 'design' ? renderFormDesign(tab.name) : renderForm(tab.name);
  else if (tab.type === 'report') tab.view === 'design' ? renderReportDesign(tab.name) : renderReport(tab.name);
  else if (tab.type === 'queryDesign') renderQueryDesigner();
  else if (tab.type === 'relationships') showRelationships();
  else if (tab.type === 'databaseInfo') showDatabaseInfo();
  else if (tab.type === 'compatibility') showCompatibilityReport();
  renderViewControls();
}

function availableViews(tab) {
  if (tab?.type === 'table') return [['datasheet', 'Datasheet View'], ['design', 'Table Design View']];
  if (tab?.type === 'form') return [['form', 'Form View'], ['design', 'Form Design View']];
  if (tab?.type === 'report') return [['report', 'Report View'], ['design', 'Report Design View']];
  if (tab?.type === 'query') return [['sql', 'SQL View']];
  if (tab?.type === 'queryDesign') return [['queryDesign', 'Query Design View']];
  return [];
}

function renderViewControls() {
  const tab = state.tabs.find(item => item.id === state.activeTab);
  const views = availableViews(tab);
  const status = $('#viewStatus');
  if (!views.length) status.textContent = 'No document view';
  else if (views.length === 1) status.textContent = views[0][1];
  else status.innerHTML = `<label for="activeViewSelect">View</label> <select id="activeViewSelect" aria-label="Document view">${views.map(([value, label]) => `<option value="${value}" ${tab.view === value || !tab.view && value === views[0][0] ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
  $('#homeViewLabel').textContent = views.length > 1 ? views.find(([value]) => value === (tab.view || views[0][0]))?.[1].replace(' View', '') || 'View' : 'View';
  $('[data-action="view"]').disabled = views.length < 2;
}

function setActiveView(view) {
  const tab = state.tabs.find(item => item.id === state.activeTab);
  if (!availableViews(tab).some(([value]) => value === view)) return;
  tab.view = view;
  renderActiveTab();
}

function setTableView(view) { setActiveView(view); }

function switchView() {
  const tab = state.tabs.find(item => item.id === state.activeTab);
  const views = availableViews(tab);
  if (views.length < 2) return;
  const next = (views.findIndex(([value]) => value === (tab.view || views[0][0])) + 1) % views.length;
  setActiveView(views[next][0]);
}

function renderTableDesign(table) {
  const columns = getColumns(table);
  const indexes = rowsFromExec(`PRAGMA index_list(${quoteId(table)})`);
  $('#documentSurface').innerHTML = `<div class="design-view" data-design-table="${escapeHtml(table)}"><div class="design-toolbar"><button class="tool-button" data-action="create-index">⌘ Create Index</button><button class="tool-button" data-action="view">▦ Datasheet View</button><span style="flex:1"></span><strong>${escapeHtml(table)}</strong></div><table class="schema-grid"><thead><tr><th></th><th>Field Name</th><th>Data Type</th><th>Required</th><th>Default Value</th></tr></thead><tbody>${columns.map(c => `<tr><td>${c.pk ? '◆' : ''}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.type || 'ANY')}</td><td>${c.notnull ? 'Yes' : 'No'}</td><td>${escapeHtml(c.dflt_value || '')}</td></tr>`).join('')}</tbody></table><section class="add-field-panel"><h3>Add a field</h3><div class="add-field-controls"><label>Field name<input id="newFieldName" maxlength="120" placeholder="NewField"></label><label>Data type<select id="newFieldType"><option>TEXT</option><option>INTEGER</option><option>REAL</option><option>NUMERIC</option><option>DATE</option><option>DATETIME</option><option>BOOLEAN</option><option>BLOB</option></select></label><label>Default value<input id="newFieldDefault" placeholder="Optional"></label><label class="inline-check"><input type="checkbox" id="newFieldRequired"> Required</label><button class="tool-button primary" data-action="commit-field">Add field</button></div><p>Existing field types and constraints cannot be changed here. SQLite requires a table rebuild for those changes.</p></section><dl class="schema-properties"><h3>Table Properties</h3><dt>Table name</dt><dd>${escapeHtml(table)}</dd><dt>Fields</dt><dd>${columns.length}</dd><dt>Indexes</dt><dd>${indexes.map(i => escapeHtml(i.name)).join(', ') || 'None'}</dd><dt>Storage engine</dt><dd>SQLite</dd><dt>Schema SQL</dt><dd><code>${escapeHtml(rowsFromExec("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [table])[0]?.sql || '')}</code></dd></dl></div>`;
  setStatus('Table Design View', `${columns.length} fields`);
}

function addField() {
  const tab = state.tabs.find(item => item.id === state.activeTab);
  if (tab?.type !== 'table') return toast('Open a table to add a field.', 'error');
  setTableView('design');
  $('#newFieldName')?.focus();
}

function quickAddField(type) {
  const tab = state.tabs.find(item => item.id === state.activeTab);
  if (tab?.type !== 'table' || !['TEXT', 'INTEGER', 'DATE', 'BOOLEAN'].includes(type)) return;
  const columns = getColumns(tab.name);
  let number = 1;
  while (columns.some(column => column.name.toLowerCase() === `field${number}`)) number++;
  const name = `Field${number}`;
  try {
    state.db.run(`ALTER TABLE ${quoteId(tab.name)} ADD COLUMN ${quoteId(name)} ${type}`);
    markDirty(); renderActiveTab(); toast(`${name} added (${type}). Review the schema in Table Design View.`);
  } catch (error) { toast(`Could not add field: ${error.message}`, 'error'); }
}

function commitField() {
  const table = $('.design-view')?.dataset.designTable;
  if (!table) return;
  const name = $('#newFieldName').value.trim();
  const type = $('#newFieldType').value;
  const defaultValue = $('#newFieldDefault').value;
  const required = $('#newFieldRequired').checked;
  if (!/^[\p{L}_][\p{L}\p{N}_ ]*$/u.test(name)) return toast('Enter a valid field name (letters, numbers, spaces and underscores).', 'error');
  if (getColumns(table).some(column => column.name.toLowerCase() === name.toLowerCase())) return toast('A field with this name already exists.', 'error');
  const defaultSql = defaultValue !== '' ? ` DEFAULT '${defaultValue.replaceAll("'", "''")}'` : '';
  try {
    state.db.run(`ALTER TABLE ${quoteId(table)} ADD COLUMN ${quoteId(name)} ${type}${required ? ' NOT NULL' : ''}${defaultSql}`);
    markDirty(); renderTableDesign(table); renderViewControls(); toast(`Field “${name}” added`);
    $('#newFieldName').focus();
  } catch (error) { toast(`Could not add field: ${error.message}`, 'error'); }
}

function createIndex() {
  const table = $('.design-view')?.dataset.designTable || $('.datasheet')?.dataset.table || state.tabs.find(tab => tab.id === state.activeTab && tab.type === 'table')?.name;
  if (!table) return;
  const fields = getColumns(table).map(c => c.name);
  const field = window.prompt(`Field to index:\n${fields.join(', ')}`, fields[0]);
  if (!fields.includes(field)) return;
  const unique = window.confirm('Should this index require unique values?');
  const indexName = `idx_${table.replace(/\W/g, '_')}_${field.replace(/\W/g, '_')}`;
  try {
    state.db.run(`CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${quoteId(indexName)} ON ${quoteId(table)}(${quoteId(field)})`);
    markDirty(); renderActiveTab(); toast(`Index “${indexName}” created`);
  } catch (error) { toast(error.message, 'error'); }
}

function renderDatasheet(table) {
  try {
    const columns = getColumns(table);
    const where = state.filter?.table === table ? ` WHERE CAST(${quoteId(state.filter.field)} AS TEXT) LIKE ?` : '';
    const params = where ? [`%${state.filter.term}%`] : [];
    const rows = rowsFromExec(`SELECT rowid AS __rowid__, * FROM ${quoteId(table)}${where} LIMIT ${Number(state.settings.rows) || 1000}`, params);
    state.lastResults = { name: table, columns: columns.map(c => c.name), rows };
    $('#documentSurface').innerHTML = `<div class="datasheet-wrap"><table class="datasheet" data-table="${escapeHtml(table)}"><thead><tr><th class="row-selector"></th>${columns.map(c => `<th title="${escapeHtml(c.type || 'ANY')}">${escapeHtml(c.name)}${c.pk ? ' 🔑' : ''}</th>`).join('')}<th><button class="datasheet-add-field" data-action="add-field" title="Open Table Design to add a field">Click to Add ▾</button></th></tr></thead><tbody>${rows.map((row, index) => `<tr data-rowid="${escapeHtml(row.__rowid__)}"><td class="row-selector">${index + 1}</td>${columns.map(c => `<td><input class="cell-input" data-column="${escapeHtml(c.name)}" value="${escapeHtml(row[c.name])}" aria-label="${escapeHtml(c.name)}, row ${index + 1}"></td>`).join('')}<td></td></tr>`).join('')}<tr class="new-row" data-new-row><td class="row-selector">＊</td>${columns.map(c => `<td><input class="cell-input" data-column="${escapeHtml(c.name)}" placeholder="${c.pk ? '(AutoNumber)' : '(New)'}" aria-label="New ${escapeHtml(c.name)}"></td>`).join('')}<td></td></tr></tbody></table></div>`;
    setStatus(state.filter?.table === table ? `Filtered: ${state.filter.field} contains “${state.filter.term}”` : 'Datasheet View', `${rows.length} record${rows.length === 1 ? '' : 's'}`);
  } catch (error) { showError(error); }
}

function updateCell(input) {
  const row = input.closest('tr');
  const table = input.closest('table').dataset.table;
  if (row.matches('.new-row')) {
    const values = Object.fromEntries($$('.cell-input', row).map(field => [field.dataset.column, field.value]));
    const columns = getColumns(table);
    const required = columns.filter(c => c.notnull && !c.dflt_value && !c.pk);
    if (required.some(c => !values[c.name]?.trim())) {
      setStatus(`Fill required fields: ${required.map(c => c.name).join(', ')}`);
      return;
    }
    const entries = Object.entries(values).filter(([, value]) => value !== '');
    try {
      if (entries.length) state.db.run(`INSERT INTO ${quoteId(table)} (${entries.map(([name]) => quoteId(name)).join(',')}) VALUES (${entries.map(() => '?').join(',')})`, entries.map(([, value]) => value));
      else state.db.run(`INSERT INTO ${quoteId(table)} DEFAULT VALUES`);
      markDirty(); renderDatasheet(table); setStatus('Record added');
    } catch (error) { toast(error.message, 'error'); }
    return;
  }
  try {
    state.db.run(`UPDATE ${quoteId(table)} SET ${quoteId(input.dataset.column)}=? WHERE rowid=?`, [input.value || null, row.dataset.rowid]);
    markDirty();
    setStatus('Record updated');
  } catch (error) { toast(error.message, 'error'); renderDatasheet(table); }
}

function addRecord(table) {
  if (!table) return;
  const inputs = $$('.datasheet .new-row .cell-input');
  const preferred = inputs.find(input => !getColumns(table).find(c => c.name === input.dataset.column)?.pk) || inputs[0];
  preferred?.focus();
  setStatus('Enter values in the new-record row');
}

function deleteSelectedRecord() {
  const selected = $('.datasheet tr.selected');
  if (!selected) return toast('Select a record first.', 'error');
  const table = $('.datasheet').dataset.table;
  if (!window.confirm('Delete the selected record?')) return;
  state.db.run(`DELETE FROM ${quoteId(table)} WHERE rowid=?`, [selected.dataset.rowid]);
  markDirty();
  renderDatasheet(table);
}

function renderSqlWorkspace(title, sql = 'SELECT *\nFROM ' + (state.objects.tables[0] ? quoteId(state.objects.tables[0]) : 'table_name') + '\nLIMIT 100;', dialect = state.settings.sqlDialect) {
  const id = `query:${title}`;
  let tab = state.tabs.find(item => item.id === id);
  if (!tab) {
    tab = { id, type: 'query', name: title, transient: title === 'SQL Query', dialect: dialect === 'access' ? 'access' : 'sqlite' };
    state.tabs.push(tab);
  }
  if (!tab.dialect) tab.dialect = dialect === 'access' ? 'access' : 'sqlite';
  state.activeTab = id;
  renderTabs();
  $('#documentSurface').innerHTML = `<div class="sql-workspace"><section class="editor-pane"><div class="local-toolbar"><button class="tool-button primary" data-action="run-query">▶ Run</button><button class="tool-button" data-action="save-query">▣ Save</button><button class="tool-button" data-action="query-design">⚒ Design</button><button class="tool-button" data-action="preview-sql">⌕ Preview SQL</button><span style="flex:1"></span><label for="queryDialect">Dialect</label><select id="queryDialect" data-query-dialect aria-label="Query dialect"><option value="sqlite" ${tab.dialect !== 'access' ? 'selected' : ''}>SQLite</option><option value="access" ${tab.dialect === 'access' ? 'selected' : ''}>Access-style subset</option></select></div><textarea id="sqlEditor" class="sql-editor" spellcheck="false" aria-label="SQL editor">${escapeHtml(sql)}</textarea></section><section id="queryResults" class="results-pane"><div class="message-panel">Press Run or ⌘↵ to execute the query. Access-style mode supports selected expressions and SELECT TOP, not the complete Access SQL dialect.</div></section></div>`;
  setStatus(tab.dialect === 'access' ? 'Access-style SQL View' : 'SQLite SQL View');
}

function renderQuery(name) {
  if (name === 'SQL Query') return renderSqlWorkspace(name);
  const item = state.objects.queries.find(q => q.name === name);
  let settings = {};
  try { settings = JSON.parse(item?.settings || '{}'); } catch { /* Legacy query */ }
  renderSqlWorkspace(name, item?.source || 'SELECT 1;', settings.dialect || 'sqlite');
}

function runQuery() {
  const editor = $('#sqlEditor');
  if (!editor) {
    if ($('#queryCanvas')) buildVisualQuery();
    return;
  }
  const source = editor.value.trim();
  if (!source) return;
  const started = performance.now();
  try {
    const sql = $('#queryDialect')?.value === 'access' ? translateAccessSql(source) : source;
    const isAction = /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE|VACUUM)\b/i.test(sql);
    if (isAction && state.settings.confirmActions && !window.confirm('This query may change data or schema. Run it?')) return;
    const resultSets = state.db.exec(sql);
    const elapsed = Math.round(performance.now() - started);
    if (!resultSets.length) {
      $('#queryResults').innerHTML = `<div class="message-panel">Command completed successfully in ${elapsed} ms.\n${state.db.getRowsModified()} row(s) affected.</div>`;
      markDirty();
      refreshObjects();
      setStatus('Query completed');
      return;
    }
    const result = resultSets.at(-1);
    state.lastResults = { name: 'Query Results', columns: result.columns, rows: result.values.map(values => Object.fromEntries(result.columns.map((c, i) => [c, values[i]]))) };
    $('#queryResults').innerHTML = resultTableHtml(result.columns, result.values);
    setStatus(`Query completed in ${elapsed} ms`, `${result.values.length} record${result.values.length === 1 ? '' : 's'}`);
  } catch (error) {
    $('#queryResults').innerHTML = `<div class="message-panel">Error: ${escapeHtml(error.message)}</div>`;
    setStatus('Query error');
  }
}

function resultTableHtml(columns, values) {
  return `<div class="datasheet-wrap"><table class="datasheet"><thead><tr><th class="row-selector"></th>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${values.map((row, i) => `<tr><td class="row-selector">${i + 1}</td>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function previewTranslatedSql() {
  const sql = $('#sqlEditor')?.value.trim();
  if (!sql) return;
  try {
    $('#queryResults').innerHTML = `<div class="message-panel">${escapeHtml($('#queryDialect')?.value === 'access' ? translateAccessSql(sql) : sql)}</div>`;
    setStatus('SQL preview; no query executed');
  } catch (error) { toast(error.message, 'error'); }
}

function saveCurrentQuery() {
  if (!$('#sqlEditor')) {
    const generated = $('#designSql')?.textContent;
    if (generated && generated !== 'No fields selected.') renderSqlWorkspace('SQL Query', generated);
    else return toast('Select fields before saving the query.', 'error');
  }
  const current = state.tabs.find(tab => tab.id === state.activeTab);
  $('#queryName').value = current?.name === 'SQL Query' ? nextName('Query', state.objects.queries) : current?.name || nextName('Query', state.objects.queries);
  $('#saveQueryDialog').showModal();
}

function confirmSaveQuery(event) {
  event.preventDefault();
  const name = $('#queryName').value.trim();
  const source = $('#sqlEditor')?.value || '';
  if (!name) return;
  const settings = JSON.stringify({ dialect: $('#queryDialect')?.value === 'access' ? 'access' : 'sqlite' });
  state.db.run(`INSERT INTO _mda_objects(type,name,source,settings) VALUES('query',?,?,?) ON CONFLICT(type,name) DO UPDATE SET source=excluded.source,settings=excluded.settings`, [name, source, settings]);
  $('#saveQueryDialog').close();
  const old = state.tabs.find(tab => tab.id === state.activeTab);
  if (old) { old.name = name; old.id = `query:${name}`; old.transient = false; old.dialect = $('#queryDialect')?.value === 'access' ? 'access' : 'sqlite'; state.activeTab = old.id; }
  markDirty(); refreshObjects(); renderTabs(); toast(`Query “${name}” saved`);
}

function renderQueryDesigner() {
  if (!ensureDb()) return;
  const name = 'Query Design';
  const id = 'query:Query Design';
  if (!state.tabs.some(t => t.id === id)) state.tabs.push({ id, type: 'queryDesign', name });
  state.activeTab = id;
  renderTabs();
  const boxes = state.objects.tables.map(table => `<div class="relation-table"><h3>${escapeHtml(table)}</h3>${getColumns(table).map(c => `<label class="relation-field"><input type="checkbox" data-design-table="${escapeHtml(table)}" data-design-field="${escapeHtml(c.name)}"> ${c.pk ? '<span class="key">◆</span>' : ''}${escapeHtml(c.name)}</label>`).join('')}</div>`).join('');
  $('#documentSurface').innerHTML = `<div class="sql-workspace"><section class="relationship-canvas" id="queryCanvas">${boxes || '<p>Create a table before designing a query.</p>'}</section><section><div class="local-toolbar"><button class="tool-button primary" data-action="build-query">▶ Run selected fields</button><span>Select fields above to generate SQL.</span></div><div id="designSql" class="message-panel">No fields selected.</div></section></div>`;
  setStatus('Query Design View');
}

function buildVisualQuery() {
  const choices = $$('[data-design-field]:checked').map(input => ({ table: input.dataset.designTable, field: input.dataset.designField }));
  if (!choices.length) return toast('Select at least one field.', 'error');
  const tables = [...new Set(choices.map(c => c.table))];
  if (tables.length > 1) return toast('Multi-table visual queries require a relationship. Use SQL View for custom joins.', 'error');
  const sql = `SELECT ${choices.map(c => quoteId(c.field)).join(', ')}\nFROM ${quoteId(tables[0])};`;
  renderSqlWorkspace('SQL Query', sql);
  runQuery();
}

function createForm() {
  if (!ensureDb() || !state.objects.tables.length) return toast('Create a table first.', 'error');
  const table = promptChoice('Create a form for which table?', state.objects.tables);
  if (table) createFormFor(table);
}

function getFormSettings(item) {
  return normalizeFormSettings(item.settings, getColumns(item.source), item.name);
}

function setFormView(view) {
  const tab = state.tabs.find(item => item.id === state.activeTab);
  if (tab?.type !== 'form') return;
  tab.view = view;
  renderActiveTab();
}

function renderForm(name) {
  const item = state.objects.forms.find(f => f.name === name);
  if (!item) return showError(new Error('Form not found'));
  const table = item.source;
  const columns = getColumns(table);
  const settings = getFormSettings(item);
  const rows = rowsFromExec(`SELECT rowid AS __rowid__, * FROM ${quoteId(table)}`);
  state.formIndex = Math.min(state.formIndex, Math.max(0, rows.length - 1));
  const row = rows[state.formIndex] || {};
  const inputs = settings.controls.filter(control => control.visible).map(control => {
    const column = columns.find(c => c.name === control.field);
    const id = `form-${control.field.replace(/[^\p{L}\p{N}_-]/gu, '_')}`;
    const value = row[control.field];
    const required = control.required || (column.notnull && !column.pk);
    const common = `id="${escapeHtml(id)}" data-form-column="${escapeHtml(control.field)}" ${required ? 'required' : ''} ${column.pk ? 'readonly title="Primary key"' : ''}`;
    const input = control.type === 'textarea'
      ? `<textarea ${common} rows="3">${escapeHtml(value)}</textarea>`
      : control.type === 'checkbox'
        ? `<input ${common} type="checkbox" ${value === 1 || value === '1' || value === true ? 'checked' : ''}>`
        : `<input ${common} type="${control.type}" value="${escapeHtml(value)}">`;
    return `<label for="${escapeHtml(id)}">${escapeHtml(control.label)}</label>${input}`;
  }).join('');
  $('#documentSurface').innerHTML = `<div class="form-view" data-form-table="${escapeHtml(table)}" data-rowid="${escapeHtml(row.__rowid__ ?? '')}"><div class="form-header"><div><h2>${escapeHtml(settings.title)}</h2><span>${escapeHtml(table)} · ${escapeHtml(name)}</span></div><div><button class="tool-button" data-action="form-design">⚒ Design View</button> <button class="tool-button primary" data-action="save-form-record">Save record</button></div></div><div class="record-form">${inputs || '<p>No controls are visible. Open Design View to show fields.</p>'}</div><div class="record-nav"><button class="tool-button" data-action="first-record">|‹</button><button class="tool-button" data-action="prev-record">‹</button><span>Record ${rows.length ? state.formIndex + 1 : 0} of ${rows.length}</span><button class="tool-button" data-action="next-record">›</button><button class="tool-button" data-action="last-record">›|</button><button class="tool-button" data-action="new-form-record">＊ New</button></div></div>`;
  setStatus('Form View', `${rows.length} records`);
}

function renderFormDesign(name) {
  const item = state.objects.forms.find(f => f.name === name);
  if (!item) return showError(new Error('Form not found'));
  const settings = getFormSettings(item);
  $('#documentSurface').innerHTML = `<section class="form-designer" data-form-name="${escapeHtml(name)}"><div class="design-toolbar"><strong>Form Design · ${escapeHtml(name)}</strong><span style="flex:1"></span><button class="tool-button" data-action="form-view">▣ Form View</button></div><div class="form-designer-body"><p>Arrange bound controls. Changes are saved to this database when you save the file.</p><label class="form-title-label">Form title <input data-form-title maxlength="120" value="${escapeHtml(settings.title)}"></label><div class="form-control-list" aria-label="Form controls">${settings.controls.map((control, index) => `<div class="form-control-row" data-control-index="${index}" draggable="true"><span class="drag-handle" title="Drag to reorder">⋮⋮</span><label>Caption <input data-control-property="label" value="${escapeHtml(control.label)}" maxlength="120"></label><span class="bound-field">${escapeHtml(control.field)}</span><label>Control <select data-control-property="type">${FORM_CONTROL_TYPES.map(type => `<option value="${type}" ${type === control.type ? 'selected' : ''}>${type}</option>`).join('')}</select></label><label class="inline-check"><input data-control-property="required" type="checkbox" ${control.required ? 'checked' : ''}> Required</label><label class="inline-check"><input data-control-property="visible" type="checkbox" ${control.visible ? 'checked' : ''}> Visible</label><button class="tool-button" data-reorder="up" title="Move up" ${index === 0 ? 'disabled' : ''}>↑</button><button class="tool-button" data-reorder="down" title="Move down" ${index === settings.controls.length - 1 ? 'disabled' : ''}>↓</button></div>`).join('')}</div><p class="compat-note">This designer supports bound text, long text, number, date and checkbox controls. Advanced Access controls, event handlers and subforms are not available yet.</p></div></section>`;
  setStatus('Form Design View', `${settings.controls.length} controls`);
}

function saveFormDesign(name, settings) {
  state.db.run("UPDATE _mda_objects SET settings=? WHERE type='form' AND name=?", [JSON.stringify(settings), name]);
  markDirty(); refreshObjects();
  setStatus('Form design updated. Save the database to keep changes.');
}

function reorderFormControl(name, from, to) {
  const item = state.objects.forms.find(f => f.name === name);
  if (!item) return;
  const settings = getFormSettings(item);
  if (from < 0 || from >= settings.controls.length || to < 0 || to >= settings.controls.length || from === to) return;
  settings.controls.splice(to, 0, settings.controls.splice(from, 1)[0]);
  saveFormDesign(name, settings);
  renderFormDesign(name);
}

function moveFormRecord(where) {
  const tab = state.tabs.find(t => t.id === state.activeTab);
  const item = state.objects.forms.find(f => f.name === tab?.name);
  if (!item) return;
  const count = rowsFromExec(`SELECT COUNT(*) count FROM ${quoteId(item.source)}`)[0].count;
  if (where === 'first') state.formIndex = 0;
  if (where === 'prev') state.formIndex = Math.max(0, state.formIndex - 1);
  if (where === 'next') state.formIndex = Math.min(count - 1, state.formIndex + 1);
  if (where === 'last') state.formIndex = Math.max(0, count - 1);
  renderForm(tab.name);
}

function saveFormRecord() {
  const form = $('.form-view');
  if (!form) return;
  const table = form.dataset.formTable;
  const inputs = $$('[data-form-column]', form);
  const invalid = inputs.find(input => !input.checkValidity());
  if (invalid) { invalid.reportValidity(); return; }
  const primaryKeys = new Set(getColumns(table).filter(column => column.pk).map(column => column.name));
  const values = inputs.map(input => ({ name: input.dataset.formColumn, value: input.type === 'checkbox' ? (input.checked ? 1 : 0) : input.value === '' ? null : input.value }));
  try {
    if (!form.dataset.rowid) {
      const fields = values.filter(item => !(primaryKeys.has(item.name) && item.value === null));
      if (fields.length) state.db.run(`INSERT INTO ${quoteId(table)} (${fields.map(item => quoteId(item.name)).join(',')}) VALUES (${fields.map(() => '?').join(',')})`, fields.map(item => item.value));
      else state.db.run(`INSERT INTO ${quoteId(table)} DEFAULT VALUES`);
      state.formIndex = rowsFromExec(`SELECT COUNT(*) count FROM ${quoteId(table)}`)[0].count - 1;
    } else if (values.length) {
      state.db.run(`UPDATE ${quoteId(table)} SET ${values.map(item => `${quoteId(item.name)}=?`).join(',')} WHERE rowid=?`, [...values.map(item => item.value), form.dataset.rowid]);
    } else return toast('This form has no visible fields to save.', 'error');
    markDirty(); renderActiveTab(); toast('Record saved');
  } catch (error) { toast(`Could not save ${table} record: ${error.message}`, 'error'); }
}

function newFormRecord() {
  const form = $('.form-view');
  if (!form) return;
  form.dataset.rowid = '';
  $$('[data-form-column]', form).forEach(input => { if (input.type === 'checkbox') input.checked = false; else input.value = ''; });
  $$('[data-form-column]', form)[0]?.focus();
}

function createReport() {
  if (!ensureDb() || !state.objects.tables.length) return toast('Create a table first.', 'error');
  const table = promptChoice('Create a report for which table?', state.objects.tables);
  if (table) createReportFor(table);
}

function createReportFor(table) {
  const name = nextName(`${table} Report `, state.objects.reports);
  state.db.run("INSERT INTO _mda_objects(type,name,source) VALUES('report',?,?)", [name, table]);
  markDirty(); refreshObjects(); openObject('report', name);
}

function reportSettings(item) {
  return normalizeReportSettings(item.settings, getColumns(item.source), item.name);
}

function saveReportDesign(name, settings) {
  state.db.run("UPDATE _mda_objects SET settings=? WHERE type='report' AND name=?", [JSON.stringify(settings), name]);
  markDirty(); refreshObjects();
  setStatus('Report design updated. Save the database to keep changes.');
}

function renderReportDesign(name) {
  const item = state.objects.reports.find(report => report.name === name);
  if (!item) return showError(new Error('Report not found'));
  const columns = getColumns(item.source).map(column => column.name);
  const settings = reportSettings(item);
  $('#documentSurface').innerHTML = `<section class="report-designer" data-report-name="${escapeHtml(name)}"><div class="design-toolbar"><strong>Report Design · ${escapeHtml(name)}</strong><span style="flex:1"></span><button class="tool-button" data-action="report-view">▥ Report View</button></div><div class="report-designer-body"><label>Report title<input data-report-property="title" maxlength="120" value="${escapeHtml(settings.title)}"></label><label>Sort by<select data-report-property="sortField"><option value="">Source order</option>${columns.map(column => `<option value="${escapeHtml(column)}" ${settings.sortField === column ? 'selected' : ''}>${escapeHtml(column)}</option>`).join('')}</select></label><label class="inline-check"><input type="checkbox" data-report-property="sortDescending" ${settings.sortDescending ? 'checked' : ''}> Descending</label><h3>Columns</h3><p>Select columns and use the arrows to set their order.</p><div class="report-column-list">${columns.map(column => `<div class="report-column-row" data-report-column="${escapeHtml(column)}"><label class="inline-check"><input type="checkbox" data-report-visible ${settings.columns.includes(column) ? 'checked' : ''}> ${escapeHtml(column)}</label><button class="tool-button" data-report-move="up" aria-label="Move ${escapeHtml(column)} up">↑</button><button class="tool-button" data-report-move="down" aria-label="Move ${escapeHtml(column)} down">↓</button></div>`).join('')}</div><p class="compat-note">Layouts apply to local reports only. This is not an Access report designer: grouping, calculated controls, sections and imported Access reports are not supported.</p></div></section>`;
  // Visible columns appear first, in saved display order. Hidden fields remain selectable.
  const list = $('.report-column-list');
  [...settings.columns, ...columns.filter(column => !settings.columns.includes(column))].forEach(column => {
    const row = $$('.report-column-row', list).find(element => element.dataset.reportColumn === column);
    if (row) list.append(row);
  });
  setStatus('Report Design View', `${settings.columns.length} visible columns`);
}

function renderReport(name) {
  const item = state.objects.reports.find(r => r.name === name);
  if (!item) return showError(new Error('Report not found'));
  const settings = reportSettings(item);
  const columns = settings.columns;
  const order = settings.sortField ? ` ORDER BY ${quoteId(settings.sortField)} ${settings.sortDescending ? 'DESC' : 'ASC'}` : '';
  const rows = rowsFromExec(`SELECT * FROM ${quoteId(item.source)}${order} LIMIT 500`);
  state.lastResults = { name, columns, rows };
  $('#documentSurface').innerHTML = `<article class="report-view"><header class="report-header"><h1>${escapeHtml(settings.title)}</h1><div class="report-meta">${escapeHtml(item.source)} · Generated ${new Date().toLocaleString()} · First 500 records</div><button class="tool-button" data-action="report-design">⚒ Design View</button></header>${columns.length ? `<table class="report-table"><thead><tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(c => `<td>${escapeHtml(row[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p>No columns selected. Open Design View to choose report columns.</p>'}</article>`;
  setStatus('Report View', `${rows.length} records`);
}

function showRelationships() {
  if (!ensureDb()) return;
  const id = 'tool:relationships';
  if (!state.tabs.some(t => t.id === id)) state.tabs.push({ id, type: 'relationships', name: 'Relationships' });
  state.activeTab = id;
  renderTabs();
  const relations = rowsFromExec('SELECT * FROM _mda_relationships');
  $('#documentSurface').innerHTML = `<div class="local-toolbar"><button class="tool-button primary" data-action="add-relationship">＋ Add relationship</button><span>${relations.length} relationship${relations.length === 1 ? '' : 's'}</span></div><div class="relationship-canvas">${state.objects.tables.map(table => `<div class="relation-table"><h3>${escapeHtml(table)}</h3>${getColumns(table).map(c => `<div class="relation-field">${c.pk ? '<span class="key">◆</span>' : ''}${escapeHtml(c.name)} <small>${escapeHtml(c.type)}</small></div>`).join('')}</div>`).join('')}<div class="message-panel">${relations.map(r => `${escapeHtml(r.from_table)}.${escapeHtml(r.from_field)} → ${escapeHtml(r.to_table)}.${escapeHtml(r.to_field)}`).join('\n') || 'No relationships defined.'}</div></div>`;
  setStatus('Relationships');
}

function addRelationship() {
  const format = 'child_table.child_field = parent_table.parent_field';
  const value = window.prompt(`Enter relationship as:\n${format}`);
  if (!value) return;
  const match = value.match(/^\s*([^.=]+)\.([^.=]+)\s*=\s*([^.=]+)\.([^.=]+)\s*$/);
  if (!match) return toast(`Use the format ${format}`, 'error');
  const [, fromTable, fromField, toTable, toField] = match.map(s => s.trim());
  if (!state.objects.tables.includes(fromTable) || !state.objects.tables.includes(toTable)) return toast('A table name was not found.', 'error');
  try {
    state.db.run('INSERT INTO _mda_relationships(from_table,from_field,to_table,to_field) VALUES(?,?,?,?)', [fromTable, fromField, toTable, toField]);
    markDirty(); showRelationships();
  } catch (error) { toast(error.message, 'error'); }
}

function promptChoice(message, choices) {
  const entered = window.prompt(`${message}\n\n${choices.join('\n')}`, choices[0] || '');
  return choices.includes(entered) ? entered : null;
}

function filterRecords() {
  const tab = state.tabs.find(item => item.id === state.activeTab);
  if (tab?.type !== 'table') return toast('Open a table to filter records.', 'error');
  const fields = getColumns(tab.name).map(c => c.name);
  const field = window.prompt(`Filter which field?\n${fields.join(', ')}`, fields[0]);
  if (!fields.includes(field)) return;
  const term = window.prompt(`Show records where “${field}” contains:`, '');
  if (term === null) return;
  state.filter = { table: tab.name, field, term };
  renderDatasheet(tab.name);
}

function clearFilter() {
  state.filter = null;
  renderActiveTab();
}

function findRecord() {
  const tab = state.tabs.find(item => item.id === state.activeTab);
  if (tab?.type === 'form') {
    const source = state.objects.forms.find(item => item.name === tab.name)?.source;
    if (!source) return;
    const term = window.prompt('Find text in form records:');
    if (!term) return;
    const fields = getColumns(source).map(item => item.name);
    const match = rowsFromExec(`SELECT * FROM ${quoteId(source)}`).findIndex(row => fields.some(field => String(row[field] ?? '').toLowerCase().includes(term.toLowerCase())));
    if (match < 0) return toast('No matching record.', 'error');
    state.formIndex = match; renderForm(tab.name); return;
  }
  const table = $('.datasheet[data-table]');
  if (!table) return toast('Open a table to find records.', 'error');
  const term = window.prompt('Find text in visible records:');
  if (!term) return;
  const row = $$('.datasheet tbody tr:not(.new-row)').find(item => item.textContent.toLowerCase().includes(term.toLowerCase()) || $$('.cell-input', item).some(input => input.value.toLowerCase().includes(term.toLowerCase())));
  if (!row) return toast('No matching record in the current view.', 'error');
  row.scrollIntoView({ block: 'center' });
  row.classList.add('selected');
  row.querySelector('.cell-input')?.focus();
}

function renameObject(type, name) {
  if (!ensureDb()) return;
  const replacement = window.prompt(`Rename ${type} “${name}” to:`, name)?.trim();
  if (!replacement || replacement === name) return;
  try {
    if (type === 'table') {
      state.db.run(`ALTER TABLE ${quoteId(name)} RENAME TO ${quoteId(replacement)}`);
      state.db.run("UPDATE _mda_objects SET source=? WHERE type IN ('form','report') AND source=?", [replacement, name]);
      state.db.run('UPDATE _mda_relationships SET from_table=? WHERE from_table=?', [replacement, name]);
      state.db.run('UPDATE _mda_relationships SET to_table=? WHERE to_table=?', [replacement, name]);
    } else state.db.run('UPDATE _mda_objects SET name=? WHERE type=? AND name=?', [replacement, type, name]);
    const tab = state.tabs.find(item => item.id === `${type}:${name}`);
    if (tab) { tab.id = `${type}:${replacement}`; tab.name = replacement; state.activeTab = tab.id; }
    markDirty(); refreshObjects(); renderTabs(); renderActiveTab();
  } catch (error) { toast(error.message, 'error'); }
}

function deleteObject(type, name) {
  if (!ensureDb() || !window.confirm(`Permanently delete ${type} “${name}”? This cannot be undone.`)) return;
  try {
    if (type === 'table') state.db.run(`DROP TABLE ${quoteId(name)}`);
    else state.db.run('DELETE FROM _mda_objects WHERE type=? AND name=?', [type, name]);
    closeTab(`${type}:${name}`);
    state.selectedObject = null;
    markDirty(); refreshObjects();
    toast(`${type} deleted`);
  } catch (error) { toast(error.message, 'error'); }
}

function handleObjectContext(action) {
  const selected = state.selectedObject;
  if (!selected) return;
  const { type, name } = selected;
  if (action === 'open') openObject(type, name);
  if (action === 'design' && ['table', 'form', 'report'].includes(type)) { openObject(type, name); setActiveView('design'); }
  if (action === 'rename') renameObject(type, name);
  if (action === 'delete') deleteObject(type, name);
  if (action === 'export' && type === 'table') { openObject(type, name); exportCsv(); }
  if (action === 'form' && type === 'table') createFormFor(name);
  if (action === 'report' && type === 'table') createReportFor(name);
  $('#contextMenu').classList.add('hidden');
}

function createFormFor(table) {
  const name = nextName(`${table} Form `, state.objects.forms);
  const settings = defaultFormSettings(getColumns(table), name);
  state.db.run("INSERT INTO _mda_objects(type,name,source,settings) VALUES('form',?,?,?)", [name, table, JSON.stringify(settings)]);
  markDirty(); refreshObjects(); openObject('form', name);
}

function deleteCurrent() {
  const tab = state.tabs.find(t => t.id === state.activeTab);
  if (!tab) return;
  if (tab.type === 'table') return deleteSelectedRecord();
  if (!['query', 'form', 'report'].includes(tab.type) || tab.transient) return;
  deleteObject(tab.type, tab.name);
}

async function importCsv() {
  if (!ensureDb()) return;
  const file = await window.desktop.importCsv();
  if (!file) return;
  const data = parseCsv(file.text);
  if (!data.length || !data[0].length) return toast('The CSV file is empty.', 'error');
  const headers = data[0].map((header, index) => header.trim() || `field_${index + 1}`);
  const table = uniqueTableName(file.name);
  try {
    state.db.run('SAVEPOINT csv_import');
    state.db.run(`CREATE TABLE ${quoteId(table)} (${headers.map(h => `${quoteId(h)} TEXT`).join(', ')})`);
    const insert = state.db.prepare(`INSERT INTO ${quoteId(table)} VALUES (${headers.map(() => '?').join(',')})`);
    try { for (const row of data.slice(1)) insert.run(headers.map((_, index) => row[index] ?? null)); }
    finally { insert.free(); }
    state.db.run('RELEASE csv_import');
    markDirty(); refreshObjects(); openObject('table', table);
    toast(`Imported ${Math.max(0, data.length - 1)} rows into “${table}”`);
  } catch (error) {
    try { state.db.run('ROLLBACK TO csv_import; RELEASE csv_import'); } catch { /* No transaction to roll back. */ }
    toast(error.message, 'error');
  }
}

function exportCsv() {
  if (!state.lastResults) return toast('Open a table, query, or report first.', 'error');
  const { name, columns, rows } = state.lastResults;
  const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [columns.map(csvCell).join(','), ...rows.map(row => columns.map(c => csvCell(row[c])).join(','))].join('\n');
  window.desktop.exportCsv({ name, csv }).then(ok => ok && toast('CSV exported'));
}

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function showCompatibilityReport() {
  if (!ensureDb()) return;
  const id = 'tool:compatibility';
  if (!state.tabs.some(tab => tab.id === id)) state.tabs.push({ id, type: 'compatibility', name: 'Compatibility Report' });
  state.activeTab = id;
  renderTabs();
  const report = state.importReport;
  if (!report) {
    $('#documentSurface').innerHTML = `<div class="database-dashboard"><h1>Compatibility report</h1><p>No Microsoft Access file has been imported into this database.</p><button class="primary-button" data-action="import-database">Import .mdb or .accdb data</button><p class="compat-note">Native projects use SQLite. Access forms, macros, reports, VBA and native .accdb editing are not supported.</p></div>`;
    setStatus('No conversion report available');
    return;
  }
  const list = (items) => `<ul class="compat-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  $('#documentSurface').innerHTML = `<article class="database-dashboard compatibility-report"><h1>Import compatibility report</h1><p>Source: <strong>${escapeHtml(report.sourceName)}</strong> · ${escapeHtml(new Date(report.importedAt).toLocaleString())}</p><div class="summary-strip"><div class="summary-item"><strong>${Number(report.tableCount) || 0}</strong><span>Tables converted</span></div><div class="summary-item"><strong>${Number(report.recordCount) || 0}</strong><span>Rows imported</span></div></div><section class="compat-warning" role="status">${escapeHtml(report.warning)}</section><h2>Imported tables</h2><table class="schema-grid"><thead><tr><th>Source</th><th>Local table</th><th>Columns</th><th>Rows</th></tr></thead><tbody>${(report.tables || []).map(table => `<tr><td>${escapeHtml(table.source)}</td><td>${escapeHtml(table.target)}</td><td>${Number(table.columns) || 0}</td><td>${Number(table.records) || 0}</td></tr>`).join('')}</tbody></table>${(report.tables || []).map(table => `<details class="compat-fields"><summary>${escapeHtml(table.target)}: field mappings</summary>${table.warning ? `<p>${escapeHtml(table.warning)}</p>` : ''}${table.primaryKey?.length ? `<p>Local primary key: ${escapeHtml(table.primaryKey.join(', '))}</p>` : ''}<ul>${(table.fields || []).map(field => `<li>${escapeHtml(field.name)}: ${escapeHtml(field.sourceType || 'Unknown')} → ${escapeHtml(field.targetType || 'TEXT')}</li>`).join('')}</ul></details>`).join('')}<h2>Preserved</h2>${list(report.preserved || [])}<h2>Converted</h2>${list(report.converted || [])}<h2>Not imported</h2>${list(report.unsupported || [])}<p class="compat-note">Project metadata version: ${METADATA_VERSION}. The Access source file was not modified.</p></article>`;
  setStatus('Import compatibility report', `${report.tableCount} tables · ${report.recordCount} records`);
}

function showDatabaseInfo() {
  if (!ensureDb()) return;
  const id = 'tool:database-info';
  if (!state.tabs.some(t => t.id === id)) state.tabs.push({ id, type: 'databaseInfo', name: 'Database Information' });
  state.activeTab = id; renderTabs();
  const counts = Object.fromEntries(['tables', 'queries', 'forms', 'reports'].map(key => [key, state.objects[key].length]));
  const records = state.objects.tables.reduce((sum, table) => sum + Number(rowsFromExec(`SELECT COUNT(*) count FROM ${quoteId(table)}`)[0].count), 0);
  const bytes = state.db.export().length;
  $('#documentSurface').innerHTML = `<div class="database-dashboard"><h1>${escapeHtml(state.fileName || 'Untitled database')}</h1><p>${escapeHtml(state.filePath || 'Not saved yet')}</p><div class="summary-strip"><div class="summary-item"><strong>${counts.tables}</strong><span>Tables</span></div><div class="summary-item"><strong>${records}</strong><span>Records</span></div><div class="summary-item"><strong>${counts.queries}</strong><span>Queries</span></div><div class="summary-item"><strong>${counts.forms + counts.reports}</strong><span>Forms & reports</span></div><div class="summary-item"><strong>${formatBytes(bytes)}</strong><span>Database size</span></div></div><h2>Database tools</h2><div class="tool-list"><div class="tool-row"><span>✓</span><strong>Integrity check</strong><p>Check pages, indexes and database structure for errors.</p><button class="tool-button" data-action="integrity-check">Run</button></div><div class="tool-row"><span>◫</span><strong>Compact database</strong><p>Rebuild the file and reclaim unused storage.</p><button class="tool-button" data-action="compact">Compact</button></div><div class="tool-row"><span>⧉</span><strong>Backup</strong><p>Create a timestamped, portable database snapshot.</p><button class="tool-button" data-action="backup">Back Up</button></div><div class="tool-row"><span>⌘</span><strong>Relationships</strong><p>Inspect tables and define logical relationships.</p><button class="tool-button" data-action="relationships">Open</button></div></div></div>`;
  setStatus('Database Information');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function integrityCheck() {
  if (!ensureDb()) return;
  const result = rowsFromExec('PRAGMA integrity_check').map(row => Object.values(row)[0]);
  const ok = result.length === 1 && result[0] === 'ok';
  toast(ok ? 'Integrity check passed. No errors found.' : `Integrity issues: ${result.join('; ')}`, ok ? '' : 'error');
  setStatus(ok ? 'Database is healthy' : 'Integrity errors found');
}

async function backupDatabase() {
  if (!ensureDb()) return;
  const file = await window.desktop.backupFile({ name: (state.fileName || 'Database').replace(/\.[^.]+$/, ''), data: Array.from(state.db.export()) });
  if (file) toast(`Backup created: ${file}`);
}

async function exportAccessTables() {
  if (!ensureDb()) return;
  if (!window.confirm('Create a new .accdb containing table data only? Forms, queries, reports, relationships, constraints and VBA will NOT be exported. The original and local project will stay unchanged.')) return;
  try {
    const tables = state.objects.tables.map(name => ({ name, columns: getColumns(name), rows: rowsFromExec(`SELECT * FROM ${quoteId(name)}`) }));
    if (!tables.length) return toast('Create a table before exporting to Access.', 'error');
    const payload = accessExportPayload(tables);
    const file = await window.desktop.exportAccess({ name: (state.fileName || 'Database').replace(/\.[^.]+$/, ''), payload });
    if (file) {
      setStatus('Access table-data export completed');
      toast(`Created ${file}. Verify all tables and rows in Microsoft Access.`);
    }
  } catch (error) { toast(`Access export failed: ${error.message}`, 'error'); }
}

async function exportPdf() {
  const tab = state.tabs.find(t => t.id === state.activeTab);
  if (!tab) return toast('Open a report or document to export.', 'error');
  $('#backstage').classList.add('hidden');
  const file = await window.desktop.exportPdf(tab.name);
  if (file) toast('PDF exported');
}

function compactDatabase() {
  if (!ensureDb()) return;
  try { state.db.run('VACUUM'); markDirty(); toast('Database compacted'); } catch (error) { toast(error.message, 'error'); }
}

function showError(error) {
  $('#documentSurface').innerHTML = `<div class="message-panel">Error: ${escapeHtml(error.message)}</div>`;
  setStatus('Error');
}

async function copyCell() {
  const input = document.activeElement?.matches('.cell-input') ? document.activeElement : $('.datasheet tr.selected .cell-input');
  if (!input) return toast('Select a cell to copy.', 'error');
  await window.desktop.writeClipboard(input.value);
  toast('Cell copied');
}

async function pasteCell() {
  const input = document.activeElement?.matches('.cell-input') ? document.activeElement : $('.datasheet tr.selected .cell-input');
  if (!input) return toast('Select a cell to paste into.', 'error');
  input.value = await window.desktop.readClipboard();
  input.dispatchEvent(new Event('change', { bubbles: true }));
  toast('Cell pasted');
}

async function performAction(action) {
  const actions = {
    new: () => newDatabase(), open: () => openDatabase(), save: () => saveDatabase(false), 'save-as': () => saveDatabase(true),
    'template-contacts': () => createTemplate('contacts'), 'template-inventory': () => createTemplate('inventory'), 'template-tasks': () => createTemplate('tasks'),
    options: () => showBackstage('options'), 'import-database': chooseAccessImport,
    'close-database': closeDatabase, 'close-file': closeBackstage, 'request-quit': requestQuit,
    'create-table': () => createTable(), 'create-table-design': () => createTable('design'), 'new-record': () => addRecord($('.datasheet')?.dataset.table),
    'delete-record': deleteSelectedRecord, delete: deleteCurrent, refresh: renderActiveTab,
    'sql-query': () => { if (ensureDb()) renderSqlWorkspace('SQL Query'); },
    'run-query': runQuery, 'save-query': saveCurrentQuery, 'preview-sql': previewTranslatedSql, 'query-design': renderQueryDesigner,
    'build-query': buildVisualQuery, 'create-form': createForm, 'create-report': createReport,
    'form-design': () => setFormView('design'), 'form-view': () => setFormView('form'),
    'report-design': () => setActiveView('design'), 'report-view': () => setActiveView('report'),
    'save-form-record': saveFormRecord, 'new-form-record': newFormRecord,
    'first-record': () => moveFormRecord('first'), 'prev-record': () => moveFormRecord('prev'),
    'next-record': () => moveFormRecord('next'), 'last-record': () => moveFormRecord('last'),
    relationships: showRelationships, 'add-relationship': addRelationship, compact: compactDatabase,
    'database-info': showDatabaseInfo, 'compatibility-report': showCompatibilityReport,
    'integrity-check': integrityCheck, backup: backupDatabase,
    'add-field': addField, 'commit-field': commitField, 'create-index': createIndex,
    'import-csv': importCsv, 'export-csv': exportCsv, 'export-pdf': exportPdf, 'export-access': exportAccessTables,
    print: () => window.desktop.print(), 'command-palette': openCommandPalette, view: switchView,
    'datasheet-view': () => setTableView('datasheet'), 'design-view': () => setTableView('design'),
    'filter-records': filterRecords, 'clear-filter': clearFilter, 'find-record': findRecord,
    find: () => $('#objectSearch').focus(),
    'sort-asc': () => sortDatasheet(true), 'sort-desc': () => sortDatasheet(false),
    'save-record': () => $('.form-view') ? saveFormRecord(false) : toast('Changes are saved as you edit.'),
    copy: copyCell, paste: pasteCell
  };
  if (actions[action]) await actions[action]();
}

const paletteCommands = [
  ['New database', 'new', 'File'], ['Open database', 'open', 'File'],
  ['Save database', 'save', 'File'], ['Save As', 'save-as', 'File'], ['Options', 'options', 'File'],
  ['Contacts template', 'template-contacts', 'New'], ['Inventory template', 'template-inventory', 'New'], ['Tasks template', 'template-tasks', 'New'],
  ['Create table', 'create-table', 'Create'], ['Import CSV', 'import-csv', 'External Data'],
  ['Export CSV', 'export-csv', 'External Data'], ['Export PDF', 'export-pdf', 'External Data'], ['Export Access table data', 'export-access', 'External Data'],
  ['SQL query', 'sql-query', 'Create'], ['Visual query designer', 'query-design', 'Create'],
  ['Create form', 'create-form', 'Create'], ['Form Design View', 'form-design', 'Form Tools'], ['Form View', 'form-view', 'Form Tools'], ['Create report', 'create-report', 'Create'],
  ['Switch view', 'view', 'Home'], ['Add field', 'add-field', 'Design'],
  ['Create index', 'create-index', 'Design'], ['Filter records', 'filter-records', 'Home'], ['Clear filter', 'clear-filter', 'Home'],
  ['Relationships', 'relationships', 'Database Tools'],
  ['Database information', 'database-info', 'Database Tools'], ['Compatibility report', 'compatibility-report', 'Database Tools'], ['Integrity check', 'integrity-check', 'Database Tools'],
  ['Compact database', 'compact', 'Database Tools'], ['Back up database', 'backup', 'Database Tools']
];

function openCommandPalette() {
  $('#commandInput').value = '';
  state.commandSelection = 0;
  renderCommandResults();
  $('#commandPalette').showModal();
  $('#commandInput').focus();
}

function matchingCommands() {
  const search = $('#commandInput').value.trim().toLowerCase();
  const commands = paletteCommands.map(([label, action, group]) => ({ label, action, group, symbol: '⌘' }));
  const objects = ['tables', 'queries', 'forms', 'reports'].flatMap(group => state.objects[group].map(item => ({
    label: typeof item === 'string' ? item : item.name,
    type: group.slice(0, -1), group: group[0].toUpperCase() + group.slice(1), symbol: group === 'tables' ? '▦' : group === 'queries' ? '⌘' : group === 'forms' ? '▣' : '▥'
  })));
  return [...commands, ...objects].filter(item => !search || `${item.label} ${item.group}`.toLowerCase().includes(search)).slice(0, 30);
}

function renderCommandResults() {
  const matches = matchingCommands();
  state.commandSelection = Math.min(state.commandSelection, Math.max(0, matches.length - 1));
  $('#commandResults').innerHTML = matches.length ? matches.map((item, index) => `<button class="command-result ${index === state.commandSelection ? 'active' : ''}" data-command-result="${index}"><span>${item.symbol}</span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.group)}</small></button>`).join('') : '<div class="message-panel">No matching commands or objects.</div>';
}

function runCommandResult(index) {
  const item = matchingCommands()[index];
  if (!item) return;
  $('#commandPalette').close();
  if (item.action) performAction(item.action);
  else openObject(item.type, item.label);
}

$('#commandInput').addEventListener('input', () => { state.commandSelection = 0; renderCommandResults(); });
$('#commandInput').addEventListener('keydown', event => {
  if (event.key === 'ArrowDown') { event.preventDefault(); state.commandSelection++; renderCommandResults(); }
  if (event.key === 'ArrowUp') { event.preventDefault(); state.commandSelection = Math.max(0, state.commandSelection - 1); renderCommandResults(); }
  if (event.key === 'Enter') { event.preventDefault(); runCommandResult(state.commandSelection); }
});
$('#commandResults').addEventListener('click', event => {
  const button = event.target.closest('[data-command-result]');
  if (button) runCommandResult(Number(button.dataset.commandResult));
});

function sortDatasheet(ascending) {
  const table = $('.datasheet[data-table]');
  if (!table) return;
  const firstColumn = getColumns(table.dataset.table)[0]?.name;
  if (!firstColumn) return;
  const rows = rowsFromExec(`SELECT rowid AS __rowid__, * FROM ${quoteId(table.dataset.table)} ORDER BY ${quoteId(firstColumn)} ${ascending ? 'ASC' : 'DESC'} LIMIT 1000`);
  const columns = getColumns(table.dataset.table);
  table.querySelector('tbody').innerHTML = rows.map((row, index) => `<tr data-rowid="${escapeHtml(row.__rowid__)}"><td class="row-selector">${index + 1}</td>${columns.map(c => `<td><input class="cell-input" data-column="${escapeHtml(c.name)}" value="${escapeHtml(row[c.name])}"></td>`).join('')}<td></td></tr>`).join('') + `<tr class="new-row" data-new-row><td class="row-selector">＊</td>${columns.map(c => `<td><input class="cell-input" data-column="${escapeHtml(c.name)}" placeholder="${c.pk ? '(AutoNumber)' : '(New)'}"></td>`).join('')}<td></td></tr>`;
}

// Ribbon and delegated workspace interactions
document.addEventListener('click', event => {
  const ribbonTab = event.target.closest('[data-tab]');
  if (ribbonTab) {
    if (ribbonTab.dataset.tab === 'file') showBackstage(state.db ? 'info' : 'home');
    else {
      $$('.ribbon-tab').forEach(t => t.classList.toggle('active', t === ribbonTab));
      $$('.ribbon-page').forEach(p => p.classList.toggle('active', p.dataset.page === ribbonTab.dataset.tab));
    }
  }
  const page = event.target.closest('[data-file-page]')?.dataset.filePage;
  if (page) renderBackstage(page);
  const recent = event.target.closest('[data-recent-path]')?.dataset.recentPath;
  if (recent) openDatabase(recent);
  const removed = event.target.closest('[data-remove-recent]')?.dataset.removeRecent;
  if (removed) window.desktop.removeRecent(removed).then(() => renderBackstage(state.backstagePage));
  const contextAction = event.target.closest('[data-context-action]')?.dataset.contextAction;
  if (contextAction) handleObjectContext(contextAction);
  else if (!event.target.closest('#contextMenu')) $('#contextMenu').classList.add('hidden');
  const move = event.target.closest('[data-reorder]');
  if (move) {
    const designer = move.closest('.form-designer');
    const from = Number(move.closest('[data-control-index]').dataset.controlIndex);
    reorderFormControl(designer.dataset.formName, from, from + (move.dataset.reorder === 'up' ? -1 : 1));
  }
  const reportMove = event.target.closest('[data-report-move]');
  if (reportMove) {
    const row = reportMove.closest('.report-column-row');
    const neighbor = reportMove.dataset.reportMove === 'up' ? row.previousElementSibling : row.nextElementSibling;
    if (neighbor) {
      if (reportMove.dataset.reportMove === 'up') neighbor.before(row); else neighbor.after(row);
      const designer = row.closest('.report-designer');
      const item = state.objects.reports.find(report => report.name === designer.dataset.reportName);
      const settings = reportSettings(item);
      settings.columns = $$('.report-column-row', designer).filter(entry => entry.querySelector('[data-report-visible]').checked).map(entry => entry.dataset.reportColumn);
      saveReportDesign(item.name, settings);
    }
  }
  const quickField = event.target.closest('[data-quick-field]');
  if (quickField) quickAddField(quickField.dataset.quickField);
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action) performAction(action);
  const object = event.target.closest('[data-object-type]');
  if (object) openObject(object.dataset.objectType, object.dataset.objectName);
  const close = event.target.closest('[data-close-tab]');
  if (close) { event.stopPropagation(); closeTab(close.dataset.closeTab); return; }
  const tab = event.target.closest('[data-tab-id]');
  if (tab) { state.activeTab = tab.dataset.tabId; renderTabs(); renderActiveTab(); }
  const row = event.target.closest('.datasheet tbody tr:not(.new-row)');
  if (row) { $$('.datasheet tr.selected').forEach(r => r.classList.remove('selected')); row.classList.add('selected'); }
  if (event.target.closest('[data-new-row]')) addRecord($('.datasheet')?.dataset.table);
});

document.addEventListener('contextmenu', event => {
  const object = event.target.closest('[data-object-type]');
  if (!object) return;
  event.preventDefault();
  state.selectedObject = { type: object.dataset.objectType, name: object.dataset.objectName };
  renderObjectTree($('#objectSearch').value);
  const menu = $('#contextMenu');
  const item = (label, action) => `<button role="menuitem" data-context-action="${action}">${label}</button>`;
  menu.innerHTML = item('Open', 'open') + (['table', 'form', 'report'].includes(state.selectedObject.type) ? item('Design View', 'design') : '') + (state.selectedObject.type === 'table' ? item('Create Form', 'form') + item('Create Report', 'report') + item('Export CSV', 'export') : '') + '<hr>' + item('Rename…', 'rename') + item('Delete…', 'delete');
  menu.classList.remove('hidden');
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 185)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 10)}px`;
  menu.querySelector('button')?.focus();
});

document.addEventListener('dragstart', event => {
  const row = event.target.closest('.form-control-row');
  if (!row || !event.dataTransfer) return;
  event.dataTransfer.setData('text/plain', row.dataset.controlIndex);
  event.dataTransfer.effectAllowed = 'move';
});
document.addEventListener('dragover', event => {
  if (event.target.closest('.form-control-row')) event.preventDefault();
});
document.addEventListener('drop', event => {
  const row = event.target.closest('.form-control-row');
  const designer = row?.closest('.form-designer');
  if (!designer || !event.dataTransfer) return;
  event.preventDefault();
  const from = Number(event.dataTransfer.getData('text/plain'));
  if (Number.isInteger(from)) reorderFormControl(designer.dataset.formName, from, Number(row.dataset.controlIndex));
});

document.addEventListener('change', event => {
  const designer = event.target.closest('.form-designer');
  if (designer && (event.target.matches('[data-form-title]') || event.target.matches('[data-control-property]'))) {
    const item = state.objects.forms.find(form => form.name === designer.dataset.formName);
    if (!item) return;
    const settings = getFormSettings(item);
    if (event.target.matches('[data-form-title]')) settings.title = event.target.value.trim() || item.name;
    else {
      const row = event.target.closest('[data-control-index]');
      const key = event.target.dataset.controlProperty;
      settings.controls[Number(row.dataset.controlIndex)][key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    }
    saveFormDesign(item.name, settings);
  }
  const reportDesigner = event.target.closest('.report-designer');
  if (reportDesigner && (event.target.matches('[data-report-property]') || event.target.matches('[data-report-visible]'))) {
    const item = state.objects.reports.find(report => report.name === reportDesigner.dataset.reportName);
    if (!item) return;
    const settings = reportSettings(item);
    if (event.target.matches('[data-report-visible]')) settings.columns = $$('.report-column-row', reportDesigner).filter(row => row.querySelector('[data-report-visible]').checked).map(row => row.dataset.reportColumn);
    else settings[event.target.dataset.reportProperty] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    saveReportDesign(item.name, settings);
  }
  if (event.target.matches('#activeViewSelect')) setActiveView(event.target.value);
  if (event.target.matches('[data-query-dialect]')) {
    const tab = state.tabs.find(item => item.id === state.activeTab);
    if (tab) tab.dialect = event.target.value;
    setStatus(event.target.value === 'access' ? 'Access-style SQL subset selected' : 'SQLite SQL selected');
  }
  if (event.target.matches('[data-setting]')) {
    const { setting } = event.target.dataset;
    state.settings[setting] = event.target.type === 'checkbox' ? event.target.checked : setting === 'rows' ? Number(event.target.value) : event.target.value;
    localStorage.setItem('macrosoft-access-settings', JSON.stringify(state.settings));
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.dataset.density = state.settings.density;
    setStatus('Options saved');
  }
  if (event.target.matches('[data-db-setting]') && state.db) {
    state.db.run('INSERT INTO _mda_preferences(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [event.target.dataset.dbSetting, event.target.value]);
    markDirty(); setStatus('Database option changed. Save the database to keep it.');
  }
  if (event.target.matches('.cell-input')) updateCell(event.target);
  if (event.target.matches('[data-design-field]')) {
    const selected = $$('[data-design-field]:checked');
    const tables = [...new Set(selected.map(i => i.dataset.designTable))];
    const sql = selected.length ? `SELECT ${selected.map(i => `${quoteId(i.dataset.designTable)}.${quoteId(i.dataset.designField)}`).join(', ')}\nFROM ${tables.map(quoteId).join(', ')};` : 'No fields selected.';
    $('#designSql').textContent = sql;
  }
});

$('#objectSearch').addEventListener('input', event => renderObjectTree(event.target.value));
document.addEventListener('input', event => {
  if (event.target.id === 'homeRecentSearch') {
    const term = event.target.value.trim().toLocaleLowerCase();
    $$('.recent-row', $('#recentList')).forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase().includes(term); });
  }
});
$('#collapseNav').addEventListener('click', () => {
  $('.navigation-pane').classList.toggle('collapsed');
  $('#collapseNav').textContent = $('.navigation-pane').classList.contains('collapsed') ? '»' : '«';
});
$('#zoomRange').addEventListener('input', event => {
  const zoom = Number(event.target.value);
  $('#zoomLabel').textContent = `${zoom}%`;
  $('#documentSurface').style.zoom = zoom / 100;
});
$('#tableForm').addEventListener('submit', submitTable);
$('#confirmTable').addEventListener('click', submitTable);
$('#confirmSaveQuery').addEventListener('click', confirmSaveQuery);

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveDatabase(false); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); openDatabase(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); newDatabase(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommandPalette(); }
  if ((event.metaKey || event.ctrlKey) && event.key === ',') { event.preventDefault(); showBackstage('options'); }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && $('#sqlEditor')) { event.preventDefault(); runQuery(); }
  if (event.key === 'Escape') { closeBackstage(); $('#contextMenu').classList.add('hidden'); }
});

window.desktop.onCommand(command => performAction(command));
refreshObjects();
updateFileInfo();
setStatus('Ready');
renderViewControls();
showBackstage('home');
