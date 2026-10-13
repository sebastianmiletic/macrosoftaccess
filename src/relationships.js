// SQLite foreign-key settings are per connection. sql.js export() recreates the
// connection, so callers must restore enforcement after every export.
export function enableForeignKeys(db) {
  db.run('PRAGMA foreign_keys=ON');
  if (db.exec('PRAGMA foreign_keys')[0]?.values[0][0] !== 1) {
    throw new Error('Foreign-key checks could not be enabled (is a transaction still open?).');
  }
}

export function exportEnforcingForeignKeys(db, restoreFunctions = () => {}) {
  try { return db.export(); }
  finally {
    enableForeignKeys(db);
    restoreFunctions(db);
  }
}

export function foreignKeyViolations(db) {
  const result = db.exec('PRAGMA foreign_key_check')[0];
  return result?.values.map(values => Object.fromEntries(result.columns.map((name, index) => [name, values[index]]))) || [];
}

export function declaredRelationships(db, tables) {
  return tables.flatMap(table => {
    const result = db.exec(`PRAGMA foreign_key_list("${table.replaceAll('"', '""')}")`)[0];
    if (!result) return [];
    const keys = result.values.map(values => Object.fromEntries(result.columns.map((name, index) => [name, values[index]])));
    return keys.map(key => ({ fromTable: table, fromField: key.from, toTable: key.table, toField: key.to || '(primary key)', id: key.id, sequence: key.seq }));
  });
}
