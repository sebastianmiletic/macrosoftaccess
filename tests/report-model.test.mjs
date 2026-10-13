import assert from 'node:assert/strict';
import { normalizeReportSettings } from '../src/report-model.js';
const fields = ['Id', 'Name', 'Total'];
assert.deepEqual(normalizeReportSettings('{}', fields, 'Sales'), { title: 'Sales', columns: fields, sortField: '', sortDescending: false });
assert.deepEqual(normalizeReportSettings('{"title":"  Quarterly  ","columns":["Total","Name","Total","Removed"],"sortField":"Total","sortDescending":true}', fields, 'Sales'), { title: 'Quarterly', columns: ['Total', 'Name'], sortField: 'Total', sortDescending: true });
assert.equal(normalizeReportSettings('{broken', fields, 'Sales').title, 'Sales');
assert.equal(normalizeReportSettings({ sortField: 'Deleted' }, fields, 'Sales').sortField, '');
console.log('PASS: report layouts, saved field order, safe sorting and legacy fallback');
