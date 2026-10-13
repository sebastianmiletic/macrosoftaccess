// A conversion record, not a claim of Access format compatibility.
export function createImportReport(sourceName, tables, rows) {
  return {
    schemaVersion: 1,
    sourceName,
    importedAt: new Date().toISOString(),
    tableCount: tables.length,
    recordCount: rows,
    tables: tables.map(table => ({ source: table.source, target: table.target, columns: table.columns, records: table.records, fields: table.fields || [], primaryKey: table.primaryKey || [], warning: table.warning || null })),
    preserved: ['Table names (except collisions)', 'Column names (except duplicate or empty headers)', 'Readable row values', 'Readable primary keys when column names and values map without collisions; inspect each table below'],
    converted: ['Integer and floating-point columns use SQLite affinities when mdb-schema exposes them', 'Currency, decimal, text and locale-dependent dates remain TEXT to avoid silent precision or date changes', 'Access AutoNumber rules, non-primary-key indexes, validation and field display formats are not recreated'],
    unsupported: ['Access queries', 'Forms and reports', 'Macros and VBA modules', 'Relationships and indexes', 'Attachments and OLE semantics', 'Password-protected or unsupported databases', 'Editing existing .accdb/.mdb files in place or preserving Access object definitions'],
    warning: 'The original Access file is unchanged. Type mapping is best effort; compare critical records, nulls, dates and numeric precision with Access before relying on converted data.'
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
