// Run against a fresh Electron instance with --remote-debugging-port=9225.
import assert from 'node:assert/strict';
const port = process.env.SMOKE_PORT || 9225;
let page;
for (let attempt = 0; attempt < 50; attempt++) {
  page = (await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())).find(item => item.type === 'page' && item.title.includes('Macrosoft'));
  if (page) break;
  await new Promise(resolve => setTimeout(resolve, 100));
}
assert(page, 'Application page not found');
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
  await evaluate('new Promise(resolve => { const check=() => document.querySelector(".home-templates") ? resolve(true) : setTimeout(check,50); check(); })');
  await evaluate('document.querySelector("[data-action=template-assets]").click()');
  await evaluate('document.querySelector("[data-action=relationships]").click()');
  assert.equal(await evaluate('document.querySelectorAll("[data-relationship-kind=enforced]").length'), 2);
  assert.equal(await evaluate('document.querySelectorAll("[data-relationship-kind=diagram]").length'), 0);
  assert.equal(await evaluate('document.querySelector(".relationship-note")?.textContent.includes("visual notes only")'), true);
  await evaluate(`(() => { window.prompt=()=> 'Assets.unknown = Locations.id'; document.querySelector('[data-action=add-relationship]').click(); })()`);
  assert.equal(await evaluate('document.querySelectorAll("[data-relationship-kind=diagram]").length'), 0);
  await evaluate(`(() => { window.prompt=()=> 'Assets.asset_tag = Locations.name'; document.querySelector('[data-action=add-relationship]').click(); })()`);
  assert.equal(await evaluate('document.querySelectorAll("[data-relationship-kind=diagram]").length'), 1);
  assert.equal(await evaluate('document.querySelectorAll("[data-relationship-kind=enforced]").length'), 2);
  await evaluate('document.querySelector("[data-action=database-info]").click()'); // sql.js export resets connection settings unless restored.
  await evaluate('document.querySelector("[data-action=sql-query]").click()');
  await evaluate(`(() => { const dialect=document.querySelector('#queryDialect'); dialect.value='access'; dialect.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('#sqlEditor').value="SELECT Left('Laptop', 3) AS sample"; document.querySelector('[data-action=run-query]').click(); })()`);
  assert.equal(await evaluate('document.querySelector("#queryResults tbody td:last-child")?.textContent'), 'Lap');
  await evaluate('document.querySelector("[data-object-name=Assets]").click()');
  await evaluate(`(() => { const row=document.querySelector('.datasheet .new-row'); row.querySelector('[data-column=location_id]').value='999'; const name=row.querySelector('[data-column=name]'); name.value='Laptop'; name.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  assert.equal(await evaluate('document.querySelectorAll(".datasheet tr[data-rowid]").length'), 0);
  assert.equal(await evaluate('[...document.querySelectorAll(".toast.error")].some(item => item.textContent.includes("FOREIGN KEY"))'), true);
  await evaluate('document.querySelector("[data-object-name=Locations]").click()');
  await evaluate(`(() => { const input=document.querySelector('.datasheet .new-row [data-column=name]'); input.value='Office'; input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  assert.equal(await evaluate('document.querySelectorAll(".datasheet tr[data-rowid]").length'), 1);
  await evaluate('document.querySelector("[data-object-name=Assets]").click()');
  await evaluate(`(() => { const row=document.querySelector('.datasheet .new-row'); row.querySelector('[data-column=location_id]').value='1'; const name=row.querySelector('[data-column=name]'); name.value='Laptop'; name.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  assert.equal(await evaluate('document.querySelectorAll(".datasheet tr[data-rowid]").length'), 1);
  await evaluate('document.querySelector("[data-object-name=Locations]").click()');
  await evaluate(`(() => { window.confirm=()=>true; document.querySelector('[data-action=delete-record]').click(); })()`);
  assert.equal(await evaluate('document.querySelectorAll(".datasheet tr[data-rowid]").length'), 1);
  assert.equal(await evaluate('[...document.querySelectorAll(".toast.error")].some(item => item.textContent.includes("FOREIGN KEY"))'), true);
  await evaluate('document.querySelector("[data-action=integrity-check]").click()');
  assert.equal(await evaluate('document.querySelector(".toast:last-child")?.textContent.includes("foreign-key checks passed")'), true);
  console.log('PASS: declared relationship UI, enforced edits after database info export, safe delete, integrity check');
} finally { socket.close(); }
