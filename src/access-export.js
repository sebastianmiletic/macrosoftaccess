// Lossy, explicit table-only exchange format for the separately packaged
// Jackcess writer. It is NOT a serialization of the Macrosoft project.
const base64 = value => {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
};

export function accessExportPayload(tables) {
  const lines = ['MDA-TABLES-2', String(tables.length)];
  for (const table of tables) {
    if (!table.columns?.length) throw new Error(`Table “${table.name}” has no fields.`);
    lines.push(base64(table.name), String(table.columns.length));
    for (const column of table.columns) {
      const affinity = String(column.type || '').toUpperCase();
      if (/BLOB/.test(affinity)) throw new Error(`Table “${table.name}” has a BLOB field. Attachments cannot be exported safely.`);
      const target = /^(INTEGER|INT|SMALLINT|TINYINT|BOOLEAN)$/.test(affinity) ? 'INTEGER'
        : /^(REAL|FLOAT|DOUBLE)$/.test(affinity) ? 'REAL'
          : /^(DATE|DATETIME|TIMESTAMP)$/.test(affinity) ? 'DATETIME' : 'TEXT';
      lines.push(base64(column.name), target);
    }
    const primaryKeys = table.columns.filter(column => Number(column.pk) > 0).sort((left, right) => Number(left.pk) - Number(right.pk));
    lines.push(String(primaryKeys.length), ...primaryKeys.map(column => base64(column.name)));
    lines.push(String(table.rows.length));
    for (const row of table.rows) {
      for (const column of table.columns) {
        const value = row[column.name];
        if (value instanceof Uint8Array) throw new Error(`Binary value in “${table.name}.${column.name}” cannot be exported.`);
        lines.push(value === null || value === undefined ? 'N' : `V${base64(value)}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}
