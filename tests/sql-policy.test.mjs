import assert from 'node:assert/strict';
import { inspectSql } from '../src/sql-policy.js';

for (const sql of ["SELECT 'DELETE' AS message", 'SELECT "UPDATE" FROM Customers', '/* DROP TABLE */ SELECT 1', '-- INSERT INTO x\nSELECT 1', 'PRAGMA foreign_keys']) {
  assert.deepEqual(inspectSql(sql), { mutates: false, changesForeignKeys: false }, sql);
}
for (const sql of ["INSERT INTO x VALUES('a')", 'WITH c AS (SELECT 1) DELETE FROM x', 'CREATE INDEX i ON x(n)', 'PRAGMA cache_size = 1000', 'ATTACH DATABASE ":memory:" AS aux']) {
  assert.equal(inspectSql(sql).mutates, true, sql);
}
for (const sql of ['PRAGMA foreign_keys=OFF', 'PRAGMA/* comment */foreign_keys(0)', 'PRAGMA main."foreign_keys" = 0', 'PRAGMA [foreign_keys] = ON']) {
  assert.equal(inspectSql(sql).changesForeignKeys, true, sql);
}
console.log('PASS: SQL action warning ignores strings/comments and rejects foreign-key toggles');
