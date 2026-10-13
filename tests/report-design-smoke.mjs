// Run on a fresh Electron instance with --remote-debugging-port=9225.
import assert from 'node:assert/strict';
const port = process.env.SMOKE_PORT || 9225;
const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
const page = pages.find(item => item.type === 'page' && item.title.includes('Macrosoft'));
assert(page);
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
socket.onmessage = event => {
  const data = JSON.parse(event.data);
  const callback = pending.get(data.id);
  if (!callback) return;
  pending.delete(data.id);
  const [resolve, reject] = callback;
  if (data.error || data.result?.exceptionDetails) reject(new Error(data.result?.exceptionDetails?.exception?.description || data.error?.message));
  else resolve(data.result.result?.value);
};
async function evaluate(expression) {
  const current = ++id;
  const promise = new Promise((resolve, reject) => pending.set(current, [resolve, reject]));
  socket.send(JSON.stringify({ id: current, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
  return promise;
}
try {
  await evaluate('document.querySelector("[data-action=new]").click()');
  await evaluate(`(() => { document.querySelector('#tableName').value='Sales'; document.querySelector('#tableFields').value='id INTEGER PRIMARY KEY AUTOINCREMENT\\nname TEXT'; document.querySelector('#confirmTable').click(); })()`);
  assert.equal(await evaluate('document.querySelector("#activeViewSelect")?.value'), 'datasheet');
  await evaluate(`(() => { const select=document.querySelector('#activeViewSelect'); select.value='design'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  assert.equal(await evaluate('document.querySelector(".design-view") !== null'), true);
  await evaluate(`(() => { document.querySelector('#newFieldName').value='total'; document.querySelector('#newFieldType').value='REAL'; document.querySelector('#newFieldDefault').value='0'; document.querySelector('[data-action=commit-field]').click(); })()`);
  assert.equal(await evaluate('document.querySelector(".schema-grid")?.textContent.includes("total")'), true);
  await evaluate(`(() => { document.querySelector('[data-object-name=Sales]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:120,clientY:260})); document.querySelector('[data-context-action=report]').click(); })()`);
  assert.equal(await evaluate('document.querySelector("#activeViewSelect")?.value'), 'report');
  await evaluate(`(() => { const select=document.querySelector('#activeViewSelect'); select.value='design'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  assert.equal(await evaluate('document.querySelector(".report-designer") !== null'), true);
  await evaluate(`(() => { const title=document.querySelector('[data-report-property=title]'); title.value='Quarterly Sales'; title.dispatchEvent(new Event('change',{bubbles:true})); const sort=document.querySelector('[data-report-property=sortField]'); sort.value='total'; sort.dispatchEvent(new Event('change',{bubbles:true})); const hidden=Array.from(document.querySelectorAll('[data-report-column]')).find(row=>row.dataset.reportColumn==='id').querySelector('[data-report-visible]'); hidden.checked=false; hidden.dispatchEvent(new Event('change',{bubbles:true})); const total=Array.from(document.querySelectorAll('[data-report-column]')).find(row=>row.dataset.reportColumn==='total'); total.querySelector('[data-report-move=up]').click(); })()`);
  await evaluate('document.querySelector("[data-action=report-view]").click()');
  assert.equal(await evaluate('document.querySelector(".report-header h1")?.textContent'), 'Quarterly Sales');
  assert.equal(await evaluate('document.querySelectorAll(".report-table th").length'), 2);
  assert.equal(await evaluate('document.querySelector(".report-table th")?.textContent'), 'total');
  assert.equal(await evaluate('document.querySelector("#activeViewSelect")?.value'), 'report');
  await evaluate(`(() => { document.querySelectorAll('[data-close-tab]')[1].click(); Array.from(document.querySelectorAll('[data-object-type=report]')).find(row => row.dataset.objectName?.startsWith('Sales Report')).click(); })()`);
  assert.equal(await evaluate('document.querySelector(".report-header h1")?.textContent'), 'Quarterly Sales');
  console.log('PASS: explicit table and report view controls, inline field creation, saved report design');
} finally { socket.close(); }
