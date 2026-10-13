import assert from 'node:assert/strict';
import { parseAccessSchema, parseAccessPrimaryKey, mapAccessType, fieldMapping } from '../src/access-schema.js';

const schema = `CREATE TABLE \`Asset Items\`
 (
  \`Asset No\` varchar,
  \`Acquired\` DateTime,
  \`Cost\` REAL,
  \`Warranty\` INTEGER,
  \`Price\` DECIMAL(19,4),
  PRIMARY KEY (\`Asset No\`)
);`;
assert.equal(parseAccessSchema(schema).get('cost'), 'REAL');
assert.deepEqual(parseAccessPrimaryKey(schema), ['Asset No']);
assert.deepEqual(parseAccessPrimaryKey('CREATE TABLE `T` (\n`A` INTEGER,\n, PRIMARY KEY (`A`, `B`)\n);'), ['A', 'B']);
assert.deepEqual(parseAccessPrimaryKey('CREATE TABLE `T` (\n, PRIMARY KEY (A); DROP TABLE X\n);'), []);
assert.equal(mapAccessType('DateTime'), 'TEXT');
assert.equal(mapAccessType('DECIMAL(19,4)'), 'TEXT');
assert.deepEqual(fieldMapping(['Asset No', 'Acquired', 'Cost', 'Warranty', 'Price'], schema).map(field => field.targetType), ['TEXT', 'TEXT', 'REAL', 'INTEGER', 'TEXT']);
assert.equal(fieldMapping(['Missing'], '').at(0).sourceType, null);
console.log('PASS: mdb-schema column parsing, safe Access type mapping and fallback');
