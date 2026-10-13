// A conversion record, not a claim of Access format compatibility.
export function createImportReport(sourceName, tables, rows) {
  return {
    schemaVersion: 1,
    sourceName,
    importedAt: new Date().toISOString(),
    tableCount: tables.length,
    recordCount: rows,
    tables: tables.map(table => ({ source: table.source, target: table.target, columns: table.columns, records: table.records })),
    preserved: ['Table names (except collisions)', 'Column names (except duplicate or empty headers)', 'Exported table cell text'],
    converted: ['Every imported column is stored as SQLite TEXT; original Access field types and constraints are not retained'],
    unsupported: ['Access queries', 'Forms and reports', 'Macros and VBA modules', 'Relationships and indexes', 'Attachments and OLE semantics', 'Password-protected or unsupported databases', 'Saving or round-tripping .accdb/.mdb'],
    warning: 'The original Access file is unchanged. Compare critical records with Access before relying on converted data.'
  };
}

export function uniqueHeaders(headers) {
  const used = new Set();
  return headers.map((header, index) => {
    const base = String(header ?? '').trim() || `field_${index + 1}`;
    let name = base;
    let suffix = 2;
    while (used.has(name.toLocaleLowerCase())) name = `${base}_${suffix++}`;
    used.add(name.toLocaleLowerCase());
    return name;
  });
}
