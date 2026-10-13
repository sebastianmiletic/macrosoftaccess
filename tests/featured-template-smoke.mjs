// Run on a fresh Electron instance; TEMPLATE_KIND selects a featured starter schema.
import assert from 'node:assert/strict';
const kind = process.env.TEMPLATE_KIND || 'assets';
const expected = {
  assets: { table: 'Assets', count: 3, field: 'name', value: 'Laptop' },
  students: { table: 'Students', count: 3, field: 'first_name', value: 'Alex' },
  events: { table: 'Events', count: 3, field: 'name', value: 'Meeting' },
  nutrition: { table: 'Meals', count: 3, field: 'name', value: 'Breakfast' },
  charity: { table: 'Donations', count: 3, field: 'amount', value: '25' }
}[kind];
assert(expected, `Unknown template ${kind}`);
const page = await (async () => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const pages = await fetch(`http://127.0.0.1:${process.env.SMOKE_PORT || 9225}/json/list`).then(response => response.json());
    const found = pages.find(item => item.type === 'page' && item.title.includes('Macrosoft'));
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Application page not found');
})();
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
  await evaluate('new Promise((resolve, reject) => { const start=Date.now(); const poll=() => { if (document.querySelector(".home-templates")) return resolve(true); if (Date.now()-start>10000) return reject(new Error("Home did not appear")); setTimeout(poll,50); }; poll(); })');
  assert.equal(await evaluate('document.querySelectorAll(".home-templates [data-action]").length'), 8);
  await evaluate(`document.querySelector('[data-action=template-${kind}]').click()`);
  assert.equal(await evaluate('document.querySelector(".document-tab .tab-name")?.textContent'), expected.table);
  assert.equal(await evaluate('document.querySelectorAll("[data-object-type=table]").length'), expected.count);
  assert.equal(await evaluate(`document.querySelector('.datasheet th') !== null`), true);
  // Templates supply real writable fields, rather than just matching the screenshot.
  if (kind === 'assets' || kind === 'events') {
    await evaluate(`(() => { const input=document.querySelector('.datasheet tbody tr.new-row input[data-column=${expected.field}]'); input.value=${JSON.stringify(expected.value)}; input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    assert.equal(await evaluate(`document.querySelector('.datasheet tbody tr:not(.new-row) input[data-column=${expected.field}]')?.value`), expected.value);
  }
  console.log(`PASS: ${kind} local template opens with ${expected.count} tables${kind === 'assets' || kind === 'events' ? ' and writable records' : ''}`);
} finally { socket.close(); }
