// Optional integration test. Set ACCESS_FIXTURE to a real .accdb file readable by
// mdbtools (for example ASampleDatabase.accdb from mdbtools/mdbtestdata).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const fixture = process.env.ACCESS_FIXTURE;
assert(fixture && fs.existsSync(fixture), 'Set ACCESS_FIXTURE to an existing .accdb test file');
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
  await evaluate(`(() => { const button=document.createElement('button'); button.dataset.recentPath=${JSON.stringify(fixture)}; button.textContent='Open fixture'; document.body.append(button); button.click(); })()`);
  const heading = await evaluate(`new Promise((resolve, reject) => { const started=Date.now(); const poll=() => { const heading=document.querySelector('#documentSurface h1')?.textContent; if (heading === 'Import compatibility report') return resolve(heading); if (Date.now()-started > 15000) return reject(new Error(document.querySelector('#statusText')?.textContent || 'Import timed out')); setTimeout(poll, 100); }; poll(); })`);
  assert.equal(heading, 'Import compatibility report');
  const report = await evaluate('document.querySelector(".compatibility-report")?.textContent');
  const isMdb = fixture.toLowerCase().endsWith('.mdb');
  assert(report.includes(isMdb ? 'DateTest' : 'Asset Items'));
  assert(report.includes(isMdb ? 'IDCol: INTEGER → INTEGER' : 'Cost: REAL → REAL'));
  assert(report.includes(isMdb ? 'DateTimeCol: DateTime → TEXT' : 'Warranty: INTEGER → INTEGER'));
  if (!isMdb) assert(report.includes('Local primary key: Asset No'));
  const sql = isMdb ? 'SELECT typeof(IDCol), typeof(DateTimeCol) FROM DateTest LIMIT 1' : 'SELECT typeof(Cost), typeof(Warranty) FROM "Asset Items" LIMIT 1';
  await evaluate(`(() => { document.querySelector('[data-action=sql-query]').click(); document.querySelector('#sqlEditor').value=${JSON.stringify(sql)}; document.querySelector('[data-action=run-query]').click(); })()`);
  assert.equal(await evaluate('document.querySelector("#queryResults tbody td:nth-child(2)")?.textContent'), isMdb ? 'integer' : 'real');
  assert.equal(await evaluate('document.querySelector("#queryResults tbody td:nth-child(3)")?.textContent'), isMdb ? 'text' : 'integer');
  console.log(`PASS: real ${isMdb ? '.mdb' : '.accdb'} imported, compatibility report shown, field types mapped`);
} finally { socket.close(); }
