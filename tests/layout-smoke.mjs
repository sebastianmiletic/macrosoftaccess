// Run against a fresh Electron instance with --remote-debugging-port=9225.
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  const callbacks = pending.get(data.id);
  if (!callbacks) return;
  pending.delete(data.id);
  if (data.error || data.result?.exceptionDetails) callbacks[1](new Error(data.result?.exceptionDetails?.exception?.description || data.error?.message));
  else callbacks[0](data.result);
};
function call(method, params) {
  const current = ++id;
  const promise = new Promise((resolve, reject) => pending.set(current, [resolve, reject]));
  socket.send(JSON.stringify({ id: current, method, params }));
  return promise;
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return result.result?.value;
}
try {
  assert.equal(await evaluate('document.querySelector(".file-home") !== null'), true);
  await evaluate('document.querySelector(".home-templates [data-action=new]").click()');
  await evaluate(`(() => { document.querySelector('#tableName').value='Customers'; document.querySelector('#tableFields').value='ID INTEGER PRIMARY KEY AUTOINCREMENT\\nName TEXT'; document.querySelector('#confirmTable').click(); })()`);
  assert.equal(await evaluate('document.querySelector("[data-tab=table-fields]").classList.contains("active")'), true);
  assert.equal(await evaluate('document.querySelector("#contextRibbonLabel").classList.contains("hidden")'), false);
  assert.equal(await evaluate('document.querySelector("#contextRibbonLabel").getBoundingClientRect().right <= document.querySelector(".document-title").getBoundingClientRect().left'), true);
  assert.equal(await evaluate('document.querySelector(".ribbon-tabs .title-search") !== null'), true);
  assert.equal(await evaluate('document.querySelector(".datasheet-position")?.textContent'), '0 of 0');
  assert.equal(await evaluate('document.querySelector("[data-record-nav=first]").disabled'), true);
  await evaluate(`(() => { const input=document.querySelector('.new-row [data-column=Name]'); input.value='Ada'; input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await evaluate(`(() => { const input=document.querySelector('.new-row [data-column=Name]'); input.value='Grace'; input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  assert.equal(await evaluate('document.querySelector(".datasheet-position")?.textContent'), '2 of 2');
  await evaluate('document.querySelector("[data-record-nav=first]").click()');
  assert.equal(await evaluate('document.querySelector(".datasheet-position")?.textContent'), '1 of 2');
  await evaluate('document.querySelector("[data-record-nav=next]").click()');
  assert.equal(await evaluate('document.querySelector(".datasheet tr.selected [data-column=Name]")?.value'), 'Grace');
  await evaluate(`(() => { const input=document.querySelector('#datasheetSearch'); input.value='Ada'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  assert.equal(await evaluate('document.querySelector(".datasheet-position")?.textContent'), '1 of 2');
  await evaluate('document.querySelector("[data-tab=home]").click()');
  await evaluate('document.querySelector("[data-action=sort-desc]").click()');
  assert.equal(await evaluate('document.querySelector(".datasheet-position")?.textContent'), '2 of 2');
  assert.equal(await evaluate('document.querySelector(".datasheet tr.selected [data-column=Name]")?.value'), 'Ada');
  await evaluate('document.querySelector("[data-tab=table-fields]").click()');
  const initial = await evaluate('document.querySelector("#navigationPane").getBoundingClientRect().width');
  const width = await evaluate('innerWidth');
  assert(initial / width < 0.14, `Navigation uses too much of the window: ${initial}/${width}`);
  assert(initial >= 122);
  await evaluate('document.querySelector("[data-toggle-object-group=Tables]").click()');
  assert.equal(await evaluate('document.querySelector("[data-object-name=Customers]") === null'), true);
  assert.equal(await evaluate('document.querySelector("[data-toggle-object-group=Tables]").getAttribute("aria-expanded")'), 'false');
  await evaluate('document.querySelector("[data-toggle-object-group=Tables]").click()');
  assert.equal(await evaluate('document.querySelector("[data-object-name=Customers]") !== null'), true);
  await evaluate(`(() => { const h=document.querySelector('#navResizeHandle'); h.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})); })()`);
  assert.equal(await evaluate('document.querySelector("#navigationPane").getBoundingClientRect().width'), initial + 16);
  assert.equal(await evaluate('Number(localStorage.getItem("macrosoft-access-nav-width"))'), initial + 16);
  await evaluate('document.querySelector("#collapseNav").click()');
  assert.equal(await evaluate('document.querySelector("#navigationPane").getBoundingClientRect().width'), 34);
  await evaluate('document.querySelector("#collapseNav").click()');
  await evaluate('new Promise(resolve => { const poll=() => document.querySelector("#backstage").classList.contains("hidden") ? resolve(true) : setTimeout(poll, 20); poll(); })');
  if (process.env.LAYOUT_SCREENSHOT) {
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(process.env.LAYOUT_SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }
  await evaluate('document.querySelector("[data-tab=help]").click()');
  assert.equal(await evaluate('document.querySelector(".ribbon-page[data-page=help]").classList.contains("active")'), true);
  assert.equal(await evaluate('document.querySelector(".ribbon-page[data-page=help] [data-action=help]") !== null'), true);
  await evaluate('document.querySelector(".ribbon-page[data-page=help] [data-action=help]").click()');
  assert.equal(await evaluate('document.querySelector("#backstageContent h1")?.textContent'), 'Help');
  await evaluate('document.querySelector("[data-action=close-file]").click()');
  await evaluate('new Promise(resolve => { const poll=() => document.querySelector("#backstage").classList.contains("hidden") ? resolve(true) : setTimeout(poll, 20); poll(); })');
  await call('Emulation.setDeviceMetricsOverride', { width: 980, height: 650, deviceScaleFactor: 1, mobile: false });
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.equal(await evaluate('document.querySelector("#contextRibbonLabel").getBoundingClientRect().right <= document.querySelector(".document-title").getBoundingClientRect().left'), true);
  assert.equal(await evaluate('document.querySelector(".document-area").getBoundingClientRect().width > 500'), true);
  if (process.env.LAYOUT_SCREENSHOT_COMPACT) {
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(process.env.LAYOUT_SCREENSHOT_COMPACT, Buffer.from(shot.data, 'base64'));
  }
  console.log('PASS: Access-style ribbon placement, adjustable navigation, group collapse, Help and compact window layout');
} finally { socket.close(); }
