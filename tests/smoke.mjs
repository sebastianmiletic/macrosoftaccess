// Run against a launched Electron app with --remote-debugging-port=9225.
import assert from 'node:assert/strict';

const port = process.env.SMOKE_PORT || 9225;
const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
const page = pages.find(item => item.type === 'page' && item.title.includes('Macrosoft'));
assert(page, 'Application page not found');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (!pending.has(message.id)) return;
  const [resolve, reject] = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else if (message.result.exceptionDetails) reject(new Error(message.result.exceptionDetails.exception?.description || message.result.exceptionDetails.text));
  else resolve(message.result.result?.value);
};
async function evaluate(expression) {
  const id = ++nextId;
  const promise = new Promise((resolve, reject) => pending.set(id, [resolve, reject]));
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  return promise;
}

try {
  assert.equal(await evaluate('document.title'), 'Macrosoft Access');
  assert.equal(await evaluate('document.querySelector(".app-mark")?.naturalWidth > 0'), true);
  await evaluate('document.querySelector("[data-action=new]").click()');
  assert.equal(await evaluate('document.querySelector("#tableDialog").open'), true);
  await evaluate(`(() => { document.querySelector('#tableName').value = 'Customers'; document.querySelector('#tableFields').value = 'id INTEGER PRIMARY KEY AUTOINCREMENT\\nname TEXT NOT NULL\\nemail TEXT'; document.querySelector('#confirmTable').click(); })()`);
  assert.equal(await evaluate('document.querySelector(".document-tab .tab-name")?.textContent'), 'Customers');
  assert.equal(await evaluate('document.querySelector("[data-tab=table-fields]").classList.contains("hidden")'), false);
  await evaluate('document.querySelector("[data-tab=table-fields]").click()');
  assert.equal(await evaluate('document.querySelector("[data-page=table-fields]").classList.contains("active")'), true);
  await evaluate('document.querySelector("[data-tab=home]").click()');
  await evaluate('document.querySelector("[data-action=new-record]").click()');
  await evaluate(`(() => { const input = document.querySelector('.datasheet tbody tr.new-row input[data-column=name]'); input.value = 'Alex Smith'; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  assert.equal(await evaluate('document.querySelector(".datasheet tbody tr:not(.new-row) input[data-column=name]")?.value'), 'Alex Smith');
  await evaluate('document.querySelector("[data-action=view]").click()');
  assert.equal(await evaluate('document.querySelector(".design-view") !== null'), true);
  await evaluate('document.querySelector("[data-action=view]").click()');
  assert.equal(await evaluate('document.querySelector(".datasheet") !== null'), true);
  await evaluate('document.querySelector("[data-action=sql-query]").click()');
  await evaluate(`(() => { document.querySelector('#sqlEditor').value = 'SELECT name FROM Customers'; document.querySelector('[data-action=run-query]').click(); })()`);
  assert.equal(await evaluate('document.querySelector("#queryResults tbody td:last-child")?.textContent'), 'Alex Smith');
  await evaluate(`(() => { document.querySelector('#sqlEditor').value = "SELECT value FROM _mda_meta WHERE key='schema_version'"; document.querySelector('[data-action=run-query]').click(); })()`);
  assert.equal(await evaluate('document.querySelector("#queryResults tbody td:last-child")?.textContent'), '1');
  await evaluate('document.querySelector("[data-action=compatibility-report]").click()');
  assert.equal(await evaluate('document.querySelector("#documentSurface h1")?.textContent'), 'Compatibility report');
  await evaluate('document.querySelector("[data-action=command-palette]").click()');
  assert.equal(await evaluate('document.querySelector("#commandPalette").open'), true);
  await evaluate('document.querySelector("#commandPalette").close()');
  await evaluate('document.querySelector("[data-tab=file]").click()');
  assert.equal(await evaluate('document.querySelector("#backstageContent h1")?.textContent'), 'Database information');
  await evaluate('document.querySelector("[data-file-page=options]").click()');
  assert.equal(await evaluate('document.querySelector("#backstageContent h1")?.textContent'), 'Options');
  await evaluate(`(() => { const select = document.querySelector('[data-setting=theme]'); select.value = 'dark'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
  await evaluate(`(() => { const select = document.querySelector('[data-db-setting=defaultTableView]'); select.value = 'design'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await evaluate('document.querySelector("[data-file-page=new]").click()');
  assert.equal(await evaluate('document.querySelectorAll("[data-action^=template-]").length'), 3);
  console.log('PASS: app boot, CRUD, design view, SQL, command palette, File pages, templates and settings');
} finally { socket.close(); }
