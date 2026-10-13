import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings.js';

assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
assert.deepEqual(normalizeSettings([]), DEFAULT_SETTINGS);
assert.deepEqual(normalizeSettings({ theme: 'dark', density: 'comfortable', confirmActions: false, rows: 100, sqlDialect: 'access', navigationPane: 'collapsed' }), {
  theme: 'dark', density: 'comfortable', confirmActions: false, rows: 100, sqlDialect: 'access', navigationPane: 'collapsed'
});
assert.deepEqual(normalizeSettings({ theme: '<script>', density: {}, rows: Infinity, confirmActions: 'false', sqlDialect: 'fake', navigationPane: 'hidden', extra: true }), DEFAULT_SETTINGS);
assert.equal(normalizeSettings({ rows: 10000 }).rows, 10000);
assert.equal(normalizeSettings({ rows: 100000000 }).rows, DEFAULT_SETTINGS.rows);
assert.equal(normalizeSettings({ theme: 'dark' }).navigationPane, 'expanded', 'older preferences migrate');
console.log('PASS: app preferences normalize invalid values and migrate safely');
