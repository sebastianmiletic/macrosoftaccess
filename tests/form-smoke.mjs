// Run on a fresh app with --remote-debugging-port=9225.
import assert from 'node:assert/strict';
const port = process.env.SMOKE_PORT || 9225;
const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
const page = pages.find(item => item.type === 'page' && item.title.includes('Macrosoft'));
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
  await evaluate('document.querySelector("[data-action=new]").click()');
  await evaluate(`(() => { document.querySelector('#tableName').value='People'; document.querySelector('#tableFields').value='id INTEGER PRIMARY KEY AUTOINCREMENT\\nname TEXT NOT NULL\\nactive BOOLEAN'; document.querySelector('#confirmTable').click(); })()`);
  await evaluate(`document.querySelector('[data-object-name=People]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:120,clientY:260}))`);
  await evaluate('document.querySelector("[data-context-action=form]").click()');
  assert.equal(await evaluate('document.querySelector(".form-view") !== null'), true);
  await evaluate('document.querySelector("[data-action=new-form-record]").click()');
  await evaluate(`(() => { document.querySelector('[data-form-column=name]').value='Alex'; document.querySelector('[data-form-column=active]').checked=true; document.querySelector('[data-action=save-form-record]').click(); })()`);
  assert.equal(await evaluate('document.querySelector("[data-form-column=name]")?.value'), 'Alex');
  assert.equal(await evaluate('document.querySelector("[data-form-column=active]")?.checked'), true);
  await evaluate('document.querySelector("[data-action=form-design]").click()');
  assert.equal(await evaluate('document.querySelectorAll(".form-control-row .bound-field")[1]?.textContent'), 'name');
  await evaluate(`(() => { const row=document.querySelector('.form-control-row[data-control-index="1"]'); const caption=row.querySelector('[data-control-property=label]'); caption.value='Full Name'; caption.dispatchEvent(new Event('change',{bubbles:true})); const type=row.querySelector('[data-control-property=type]'); type.value='textarea'; type.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await evaluate('document.querySelector("[data-reorder=up]:not([disabled])").click()');
  assert.equal(await evaluate('document.querySelectorAll(".form-control-row .bound-field")[0]?.textContent'), 'name');
  await evaluate('document.querySelector("[data-action=form-view]").click()');
  assert.equal(await evaluate('document.querySelector(".record-form label")?.textContent'), 'Full Name');
  assert.equal(await evaluate('document.querySelector("[data-form-column=name]")?.tagName'), 'TEXTAREA');
  assert.equal(await evaluate('document.querySelector("[data-form-column=name]")?.value'), 'Alex');
  console.log('PASS: generated form, create record, checkbox, saved design, reorder and runtime binding');
} finally { socket.close(); }
