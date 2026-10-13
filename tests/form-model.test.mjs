import assert from 'node:assert/strict';
import { defaultFormSettings, normalizeFormSettings } from '../src/form-model.js';

const columns = [
  { name: 'id', type: 'INTEGER', pk: 1, notnull: 0 },
  { name: 'name', type: 'TEXT', pk: 0, notnull: 1 },
  { name: 'active', type: 'BOOLEAN', pk: 0, notnull: 0 }
];
const defaults = defaultFormSettings(columns, 'People Form');
assert.deepEqual(defaults.controls.map(control => control.type), ['text', 'text', 'checkbox']);
assert.equal(defaults.controls[1].required, true);
assert.equal(normalizeFormSettings('{}', columns, 'People Form').controls.length, 3);
const customized = normalizeFormSettings({ version: 1, title: 'People', controls: [
  { field: 'name', label: 'Full Name', type: 'textarea', visible: true, required: true },
  { field: 'missing', label: 'Deleted', type: 'text' },
  { field: 'name', label: 'Duplicate', type: 'text' }
] }, columns, 'People Form');
assert.equal(customized.title, 'People');
assert.deepEqual(customized.controls.map(control => control.field), ['name', 'id', 'active']);
assert.equal(customized.controls[0].type, 'textarea');
console.log('PASS: form settings defaults, migration fallback and field validation');
