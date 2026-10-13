// Parse only the column declarations emitted by mdb-schema's SQLite backend.
// Never execute raw schema SQL from a foreign file.
export function parseAccessSchema(source) {
  const fields = new Map();
  for (const line of String(source || '').split(/\r?\n/)) {
    const match = line.match(/^\s*`((?:``|[^`])+)`\s+([A-Za-z][A-Za-z0-9_]*(?:\([^)]*\))?)/);
    if (match) fields.set(match[1].replaceAll('``', '`').toLocaleLowerCase(), match[2]);
  }
  return fields;
}

export function mapAccessType(sourceType) {
  const type = String(sourceType || '').toUpperCase().replace(/\(.*\)$/, '');
  if (/^(INTEGER|INT|SMALLINT|BIGINT|TINYINT|BYTE|BOOLEAN|BIT|COUNTER)$/.test(type)) return 'INTEGER';
  if (/^(REAL|DOUBLE|FLOAT|SINGLE)$/.test(type)) return 'REAL';
  // Access currency, decimals and dates remain text to avoid losing exact
  // precision or misinterpreting locale-dependent date strings.
  return 'TEXT';
}

export function fieldMapping(headers, schemaSql) {
  const declarations = parseAccessSchema(schemaSql);
  return headers.map(header => {
    const sourceType = declarations.get(String(header).toLocaleLowerCase()) || null;
    return { name: header, sourceType, targetType: mapAccessType(sourceType) };
  });
}
