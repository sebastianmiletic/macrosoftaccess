// A deliberately limited Access SQL adapter. Save the original query text and
// transform only syntax that can be translated without rewriting quoted data.
const functions = new Map([
  ['left', 'MDA_Left'], ['right', 'MDA_Right'], ['mid', 'MDA_Mid'],
  ['nz', 'MDA_Nz'], ['iif', 'MDA_IIf'], ['instr', 'MDA_InStr'],
  ['date', 'MDA_Date'], ['now', 'MDA_Now'], ['len', 'length']
]);

function tokenize(input) {
  const result = [];
  let i = 0;
  while (i < input.length) {
    const start = i;
    const ch = input[i];
    if (/\s/.test(ch)) { while (i < input.length && /\s/.test(input[i])) i++; result.push({ kind: 'space', text: input.slice(start, i) }); continue; }
    if (ch === '-' && input[i + 1] === '-') { i += 2; while (i < input.length && input[i] !== '\n') i++; result.push({ kind: 'comment', text: input.slice(start, i) }); continue; }
    if (ch === '/' && input[i + 1] === '*') { i += 2; while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i++; i = Math.min(input.length, i + 2); result.push({ kind: 'comment', text: input.slice(start, i) }); continue; }
    if (ch === "'" || ch === '"' || ch === '`') {
      i++;
      while (i < input.length) {
        if (input[i] === ch) { if (input[i + 1] === ch) i += 2; else { i++; break; } }
        else i++;
      }
      result.push({ kind: 'quoted', text: input.slice(start, i) }); continue;
    }
    if (ch === '[') {
      i++;
      while (i < input.length) {
        if (input[i] === ']') { if (input[i + 1] === ']') i += 2; else { i++; break; } }
        else i++;
      }
      result.push({ kind: 'quoted', text: input.slice(start, i) }); continue;
    }
    if (/[A-Za-z_]/.test(ch)) { i++; while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) i++; result.push({ kind: 'word', text: input.slice(start, i) }); continue; }
    if (/[0-9]/.test(ch)) { i++; while (i < input.length && /[0-9]/.test(input[i])) i++; result.push({ kind: 'number', text: input.slice(start, i) }); continue; }
    i++;
    result.push({ kind: 'punctuation', text: ch });
  }
  return result;
}

export function translateAccessSql(source) {
  const tokens = tokenize(String(source));
  const meaningful = tokens.map((token, index) => token.kind === 'space' || token.kind === 'comment' ? -1 : index).filter(index => index >= 0);
  const first = meaningful[0];
  let top = null;
  if (first !== undefined && tokens[first].text.toUpperCase() === 'SELECT') {
    let position = 1;
    if (tokens[meaningful[position]]?.text.toUpperCase() === 'DISTINCT') position++;
    const topToken = tokens[meaningful[position]];
    const numberToken = tokens[meaningful[position + 1]];
    if (topToken?.text.toUpperCase() === 'TOP') {
      if (numberToken?.kind !== 'number' || !/^\d+$/.test(numberToken.text)) throw new Error('Only SELECT TOP with an integer count is supported.');
      top = Number(numberToken.text);
      if (!Number.isSafeInteger(top) || top < 0) throw new Error('Invalid SELECT TOP value.');
      tokens[meaningful[position]].text = '';
      tokens[meaningful[position + 1]].text = '';
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === 'punctuation' && token.text === '&') token.text = '||';
    if (token.kind !== 'word') continue;
    const functionName = functions.get(token.text.toLowerCase());
    if (!functionName) continue;
    let next = i + 1;
    while (tokens[next]?.kind === 'space' || tokens[next]?.kind === 'comment') next++;
    if (tokens[next]?.text === '(') {
      token.text = functionName;
      if (functionName === 'MDA_Nz') {
        let depth = 1;
        let hasComma = false;
        for (let position = next + 1; position < tokens.length && depth; position++) {
          if (tokens[position].kind === 'quoted' || tokens[position].kind === 'comment') continue;
          if (tokens[position].text === '(') depth++;
          else if (tokens[position].text === ')') depth--;
          else if (tokens[position].text === ',' && depth === 1) hasComma = true;
        }
        if (!hasComma) token.text = 'MDA_Nz1';
      }
    }
  }
  let translated = tokens.map(token => token.text).join('');
  if (top !== null) {
    const significant = tokens.filter(token => token.kind !== 'space' && token.kind !== 'comment' && token.text);
    if (significant.some((token, index) => token.text === ';' && index < significant.length - 1)) throw new Error('SELECT TOP supports one statement at a time.');
    const lastToken = tokens.findLast(token => token.kind !== 'space');
    if (lastToken?.kind === 'comment' && lastToken.text.startsWith('--')) throw new Error('Place a newline after the final SQL comment before using TOP.');
    if (/\bLIMIT\b/i.test(tokens.filter(token => token.kind === 'word').map(token => token.text).join(' '))) throw new Error('Use either Access TOP or SQLite LIMIT, not both.');
    translated = translated.trimEnd().replace(/;\s*$/, '').trimEnd() + ` LIMIT ${top};`;
  }
  return translated;
}

export function registerAccessFunctions(db) {
  const text = value => value == null ? '' : String(value);
  db.create_function('MDA_Left', (value, length) => value == null ? null : text(value).slice(0, Math.max(0, Number(length) || 0)));
  db.create_function('MDA_Right', (value, length) => {
    if (value == null) return null;
    const count = Math.max(0, Number(length) || 0);
    return count ? text(value).slice(-count) : '';
  });
  db.create_function('MDA_Mid', (value, start, length) => value == null ? null : text(value).substr(Math.max(0, (Number(start) || 1) - 1), length == null ? undefined : Math.max(0, Number(length))));
  db.create_function('MDA_Nz', (value, fallback) => value == null ? fallback : value);
  db.create_function('MDA_Nz1', value => value == null ? '' : value);
  db.create_function('MDA_IIf', (condition, yes, no) => condition ? yes : no);
  db.create_function('MDA_InStr', (haystack, needle) => haystack == null || needle == null ? null : text(haystack).indexOf(text(needle)) + 1);
  db.create_function('MDA_Date', () => new Date().toLocaleDateString('en-CA'));
  db.create_function('MDA_Now', () => new Date().toISOString());
}
