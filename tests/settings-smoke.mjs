// Run on a fresh Electron instance with --remote-debugging-port=9225.
import assert from 'node:assert/strict';
const port = process.env.SMOKE_PORT || 9225;
let page;
for (let i = 0; i < 50; i++) {
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
  await evaluate('document.querySelector("[data-file-page=options]").click()');
  for (const [setting, value] of [['theme', 'dark'], ['density', 'comfortable'], ['navigationPane', 'collapsed'], ['rows', '100'], ['sqlDialect', 'access']]) {
    await evaluate(`(() => { const select=document.querySelector('[data-setting=${setting}]'); select.value='${value}'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  }
  await evaluate(`(() => { const checkbox=document.querySelector('[data-setting=confirmActions]'); checkbox.checked=false; checkbox.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
  assert.equal(await evaluate('document.documentElement.dataset.density'), 'comfortable');
  assert.equal(await evaluate('document.querySelector("#navigationPane").classList.contains("collapsed")'), true);
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("macrosoft-access-settings")).rows'), 100);
  await evaluate('location.reload()');
  await evaluate('new Promise(resolve => { const check=() => document.querySelector(".home-templates") && document.documentElement.dataset.theme === "dark" ? resolve(true) : setTimeout(check,50); check(); })');
  assert.equal(await evaluate('document.querySelector("#navigationPane").classList.contains("collapsed")'), true);
  await evaluate('document.querySelector("#collapseNav").click()');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("macrosoft-access-settings")).navigationPane'), 'expanded');
  await evaluate('document.querySelector(".home-templates [data-action=new]").click()');
  await evaluate(`(() => { document.querySelector('#tableName').value='Customers'; document.querySelector('#tableFields').value='id INTEGER PRIMARY KEY AUTOINCREMENT\\nname TEXT'; document.querySelector('#confirmTable').click(); })()`);
  await evaluate('document.querySelector("[data-action=sql-query]").click()');
  assert.equal(await evaluate('document.querySelector("#queryDialect").value'), 'access');
  await evaluate(`(() => { const editor=document.querySelector('#sqlEditor'); editor.value='SELECT 99 AS draft'; editor.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-object-name=Customers]').click(); })()`);
  await evaluate(`document.querySelector('[data-tab-id="query:SQL Query"]').click()`);
  assert.equal(await evaluate('document.querySelector("#sqlEditor").value'), 'SELECT 99 AS draft');
  await evaluate(`(() => { window.confirm=()=>{throw new Error('Unexpected confirmation')}; document.querySelector('#sqlEditor').value="WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<150) INSERT INTO Customers(name) SELECT 'Name ' || n FROM seq"; document.querySelector('[data-action=run-query]').click(); })()`);
  assert.equal(await evaluate('document.querySelector("#queryResults")?.textContent.includes("Command completed successfully")'), true);
  await evaluate(`(() => { document.querySelector('#sqlEditor').value='SELECT * FROM Customers ORDER BY id'; document.querySelector('[data-action=run-query]').click(); })()`);
  assert.equal(await evaluate('document.querySelectorAll("#queryResults tbody tr").length'), 100);
  assert.equal(await evaluate('document.querySelector("#sqlEditor").value'), 'SELECT * FROM Customers ORDER BY id');
  assert.equal(await evaluate('document.querySelector(".result-limit-note")?.textContent.includes("100 of 150")'), true);
  await evaluate('document.querySelector("[data-object-name=Customers]").click()');
  assert.equal(await evaluate('document.querySelectorAll(".datasheet tr[data-rowid]").length'), 100);
  await evaluate('document.querySelector("[data-file-page=options]").click()');
  await evaluate(`(() => { const select=document.querySelector('[data-setting=rows]'); select.value='1000'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await evaluate(`(() => { const select=document.querySelector('[data-db-setting=defaultTableView]'); select.value='design'; select.dispatchEvent(new Event('change',{bubbles:true})); const checkbox=document.querySelector('[data-setting=confirmActions]'); checkbox.checked=true; checkbox.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("macrosoft-access-settings")).rows'), 1000);
  await evaluate('document.querySelector("[data-action=close-file]").click()');
  await evaluate(`document.querySelector('[data-tab-id="query:SQL Query"]').click()`);
  assert.equal(await evaluate('document.querySelector("#sqlEditor").value'), 'SELECT * FROM Customers ORDER BY id');
  await evaluate('document.querySelector("[data-action=run-query]").click()');
  assert.equal(await evaluate('document.querySelectorAll("#queryResults tbody tr").length'), 150);
  assert.equal(await evaluate('document.querySelector(".result-limit-note") === null'), true);
  await evaluate(`(() => { window.confirm=()=>{throw new Error('Unexpected confirmation')}; document.querySelector('#sqlEditor').value="SELECT 'DELETE' AS message"; document.querySelector('[data-action=run-query]').click(); })()`);
  assert.equal(await evaluate('document.querySelector("#queryResults tbody td:last-child")?.textContent'), 'DELETE');
  await evaluate(`(() => { window.confirm=()=>false; document.querySelector('#sqlEditor').value="INSERT INTO Customers(name) VALUES('Should not exist')"; document.querySelector('[data-action=run-query]').click(); })()`);
  await evaluate(`(() => { document.querySelector('#sqlEditor').value='SELECT COUNT(*) FROM Customers'; document.querySelector('[data-action=run-query]').click(); })()`);
  assert.equal(await evaluate('document.querySelector("#queryResults tbody td:last-child")?.textContent'), '150');
  await evaluate('document.querySelector("[data-action=query-design]").click()');
  await evaluate(`(() => { const field=document.querySelector('[data-design-field=name]'); field.checked=true; field.dispatchEvent(new Event('change',{bubbles:true})); document.querySelector('[data-action=build-query]').click(); })()`);
  assert.equal(await evaluate('document.querySelector("#sqlEditor").value.includes("SELECT \\\"name\\\"")'), true);
  await evaluate(`document.querySelector('[data-close-tab="table:Customers"]').click()`);
  await evaluate('document.querySelector("[data-object-name=Customers]").click()');
  assert.equal(await evaluate('document.querySelector(".design-view") !== null'), true);
  await evaluate(`document.querySelector('[data-close-tab="query:SQL Query"]').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-tab-id="query:SQL Query"]') !== null`), true);
  await evaluate(`(() => { window.confirm=()=>true; document.querySelector('[data-close-tab="query:SQL Query"]').click(); })()`);
  assert.equal(await evaluate(`document.querySelector('[data-tab-id="query:SQL Query"]') === null`), true);
  console.log('PASS: persisted options, capped results, query drafts and safe tab close, table-view default');
} finally { socket.close(); }
