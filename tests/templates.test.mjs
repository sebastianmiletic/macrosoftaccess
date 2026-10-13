import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { templates, featuredTemplates } from '../src/templates.js';

const SQL = await initSqlJs();
assert.equal(templates.length, 8);
assert.equal(featuredTemplates.length, 7);
assert.equal(new Set(templates.map(item => item.kind)).size, templates.length);
const sampleRows = {
  contacts: `INSERT INTO Contacts (name) VALUES ('Alex');`,
  assets: `INSERT INTO Assets (name) VALUES ('Laptop');`,
  students: `INSERT INTO Students (first_name, last_name) VALUES ('Alex', 'Smith');`,
  events: `INSERT INTO Events (name) VALUES ('Launch');`,
  tasks: `INSERT INTO Tasks (title) VALUES ('Plan');`,
  nutrition: `INSERT INTO Meals (meal_date, name) VALUES ('2026-10-14', 'Breakfast');`,
  charity: `INSERT INTO Donations (donor_id, donated_date, amount) VALUES (1, '2026-10-14', 25);`,
  inventory: `INSERT INTO Products (product_name) VALUES ('Widget');`
};
for (const template of templates) {
  assert(template.title && template.description && template.icon && template.table);
  const db = new SQL.Database();
  db.run('BEGIN');
  db.exec(template.sql);
  db.run('COMMIT');
  const names = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.flat();
  assert(names.includes(template.table), `${template.kind} primary table missing`);
  assert(names.every(name => !name.startsWith('_mda_')), 'Template must not create app metadata');
  db.run(sampleRows[template.kind]);
  assert.equal(db.exec(`SELECT count(*) FROM "${template.table}"`)[0].values[0][0], 1);
  assert.equal(db.exec('PRAGMA integrity_check')[0].values[0][0], 'ok');
  db.close();
}
console.log('PASS: eight local templates create valid SQLite tables with writable records');
