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

// mdb-schema prints a PRIMARY KEY clause on a separate line. The parser
// accepts only a comma-separated list of backtick-quoted field names.
export function parseAccessPrimaryKey(source) {
  const line = String(source || '').split(/\r?\n/).find(value => /^\s*,?\s*PRIMARY KEY\s*\(/i.test(value));
  const clause = line?.match(/^\s*,?\s*PRIMARY KEY\s*\((.*)\)\s*,?\s*$/i)?.[1];
  if (!clause) return [];
  const names = [];
  const matcher = /\s*`((?:``|[^`])+)`\s*(,|$)/gy;
  let position = 0;
  while (position < clause.length) {
    matcher.lastIndex = position;
    const match = matcher.exec(clause);
    if (!match) return [];
    names.push(match[1].replaceAll('``', '`'));
    position = matcher.lastIndex;
    if (!match[2] && position !== clause.length) return [];
  }
  return names;
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
