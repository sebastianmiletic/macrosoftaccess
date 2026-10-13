import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { templates, featuredTemplates } from '../src/templates.js';
import { enableForeignKeys, declaredRelationships, foreignKeyViolations } from '../src/relationships.js';

const SQL = await initSqlJs();
assert.equal(templates.length, 12);
assert.equal(featuredTemplates.length, 7);
assert.equal(new Set(templates.map(item => item.kind)).size, templates.length);
const sampleRows = {
  contacts: `INSERT INTO Contacts (name) VALUES ('Alex');`,
  assets: `INSERT INTO Assets (name) VALUES ('Laptop');`,
  students: `INSERT INTO Students (first_name, last_name) VALUES ('Alex', 'Smith');`,
  events: `INSERT INTO Events (name) VALUES ('Launch');`,
  tasks: `INSERT INTO Tasks (title) VALUES ('Plan');`,
  nutrition: `INSERT INTO Meals (meal_date, name) VALUES ('2026-10-14', 'Breakfast');`,
  charity: `INSERT INTO Donors (name) VALUES ('Pat'); INSERT INTO Donations (donor_id, donated_date, amount) VALUES (1, '2026-10-14', 25);`,
  inventory: `INSERT INTO Products (product_name) VALUES ('Widget');`,
  projects: `INSERT INTO Projects (name) VALUES ('Website');`,
  library: `INSERT INTO Books (title) VALUES ('Guide');`,
  finance: `INSERT INTO Accounts (name) VALUES ('Checking');`,
  support: `INSERT INTO Tickets (customer_id, subject) VALUES (1, 'Help');`
};
for (const template of templates) {
  assert(template.title && template.description && template.icon && template.table);
  const db = new SQL.Database();
  db.run('BEGIN');
  db.exec(template.sql);
  db.run('COMMIT');
  enableForeignKeys(db);
  const names = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.flat();
  assert(names.includes(template.table), `${template.kind} primary table missing`);
  assert(names.every(name => !name.startsWith('_mda_')), 'Template must not create app metadata');
  if (template.kind === 'support') db.run("INSERT INTO Customers (name) VALUES ('Alex')");
  db.run(sampleRows[template.kind]);
  assert.equal(db.exec(`SELECT count(*) FROM "${template.table}"`)[0].values[0][0], 1);
  assert.equal(db.exec('PRAGMA integrity_check')[0].values[0][0], 'ok');
  assert.equal(foreignKeyViolations(db).length, 0);
  if (['assets', 'students', 'events', 'nutrition', 'charity', 'projects', 'library', 'finance', 'support'].includes(template.kind)) {
    assert(declaredRelationships(db, names).length > 0, `${template.kind} should declare references`);
  }
  db.close();
}
console.log('PASS: twelve local templates create valid SQLite tables with writable records');
