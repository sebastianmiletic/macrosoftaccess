import { tokenizeSql } from './access-sql.js';

// A warning policy, not a SQL parser or sandbox. Ignore comments and literals
// so a harmless SELECT containing "DELETE" does not ask for confirmation.
export function inspectSql(source) {
  const tokens = tokenizeSql(String(source)).filter(token => token.kind !== 'space' && token.kind !== 'comment');
  const word = token => token?.kind === 'word' ? token.text.toUpperCase() : '';
  const identifier = token => {
    if (token?.kind === 'word') return word(token);
    if (token?.kind !== 'quoted') return '';
    const value = token.text;
    if (value.startsWith("'")) return ''; // A string literal is not an identifier.
    return value.slice(1, -1).toUpperCase();
  };
  const actionWords = new Set(['INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'CREATE', 'ALTER', 'DROP', 'VACUUM', 'REINDEX', 'ANALYZE', 'ATTACH', 'DETACH']);
  let mutates = tokens.some(token => actionWords.has(word(token)));
  let changesForeignKeys = false;
  for (let index = 0; index < tokens.length; index++) {
    if (word(tokens[index]) !== 'PRAGMA') continue;
    let next = index + 1;
    if (['MAIN', 'TEMP'].includes(identifier(tokens[next])) && tokens[next + 1]?.text === '.') next += 2;
    if (identifier(tokens[next]) !== 'FOREIGN_KEYS') {
      if (tokens[next + 1]?.text === '=') mutates = true;
      continue;
    }
    if (tokens[next + 1]?.text === '=' || tokens[next + 1]?.text === '(') changesForeignKeys = true;
  }
  return { mutates, changesForeignKeys };
}
