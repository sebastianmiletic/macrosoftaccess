import assert from 'node:assert/strict';
import { createImportReport, uniqueHeaders } from '../src/compatibility.js';

assert.deepEqual(uniqueHeaders(['ID', 'id', '', 'ID_2', 'name', 'NAME']), ['ID', 'id_2', 'field_3', 'ID_2_2', 'name', 'NAME_2']);
const report = createImportReport('Example.accdb', [{ source: 'People', target: 'People', columns: 3, records: 2 }], 2);
assert.equal(report.tableCount, 1);
assert.equal(report.recordCount, 2);
assert.ok(report.unsupported.includes('Saving or round-tripping .accdb/.mdb'));
assert.ok(report.converted.some(item => item.includes('SQLite affinities')));
assert.equal(JSON.parse(JSON.stringify(report)).tables[0].source, 'People');
console.log('PASS: Access import header normalization and honest conversion report');
