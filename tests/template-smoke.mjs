// Run on a fresh instance with --remote-debugging-port=9225.
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
async function command(method, params = {}) {
  const current = ++id;
  const promise = new Promise((resolve, reject) => pending.set(current, [resolve, reject]));
  socket.send(JSON.stringify({ id: current, method, params }));
  return promise;
}
async function evaluate(expression) { return command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); }
try {
  await evaluate('new Promise((resolve, reject) => { const start=Date.now(); const poll=() => { if (document.querySelector(".home-more")) return resolve(true); if (Date.now()-start>10000) return reject(new Error("Home did not appear")); setTimeout(poll,50); }; poll(); })');
  await evaluate('document.querySelector("[data-tab=file]").click()');
  await evaluate('document.querySelector(".home-more").click()');
  assert.equal(await evaluate('document.querySelector("#backstageContent h1")?.textContent'), 'New');
  assert.equal(await evaluate('document.querySelectorAll(".template-list [data-action^=template-]").length'), 12);
  await command('Emulation.setDeviceMetricsOverride', { width: 650, height: 780, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.equal(await evaluate('document.querySelector("#templateSearch").getBoundingClientRect().right <= innerWidth'), true);
  await command('Emulation.clearDeviceMetricsOverride');
  await evaluate(`(() => { const input=document.querySelector('#templateSearch'); input.value='library'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  assert.equal(await evaluate('document.querySelectorAll(".template-list [data-template-search]:not([hidden])").length'), 1);
  await evaluate(`(() => { const input=document.querySelector('#templateSearch'); input.value='no matching templates'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  assert.equal(await evaluate('document.querySelector("#templateNoResults").hidden'), false);
  await evaluate(`(() => { const input=document.querySelector('#templateSearch'); input.value=''; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await evaluate('document.querySelector("[data-action=template-contacts]").click()');
  assert.equal(await evaluate('document.querySelector(".document-tab .tab-name")?.textContent'), 'Contacts');
  assert.equal(await evaluate('document.querySelector(".datasheet th:nth-child(3)")?.textContent'), 'name');
  await evaluate('document.querySelector("[data-tab=file]").click()');
  await evaluate('document.querySelector("[data-file-page=options]").click()');
  await evaluate(`(() => { const select = document.querySelector('[data-db-setting=defaultTableView]'); select.value = 'design'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  assert.equal(await evaluate('document.querySelector("[data-db-setting=defaultTableView]")?.value'), 'design');
  await evaluate('document.querySelector("[data-action=close-file]").click()');
  await evaluate('document.querySelector("[data-object-name=Contacts]").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 125, clientY: 250 }))');
  assert.equal(await evaluate('document.querySelector("#contextMenu").classList.contains("hidden")'), false);
  await evaluate('document.querySelector("[data-context-action=design]").click()');
  assert.equal(await evaluate('document.querySelector(".design-view") !== null'), true);
  console.log('PASS: Contacts template, database options, object context menu, design view');
} finally { socket.close(); }
