// Report layouts belong to Macrosoft metadata, never to imported Access objects.
export function normalizeReportSettings(raw, columns, name) {
  let saved = {};
  try { saved = typeof raw === 'string' ? JSON.parse(raw) : raw || {}; } catch { /* Older report */ }
  const available = columns.map(column => typeof column === 'string' ? column : column.name);
  const selected = Array.isArray(saved.columns) ? saved.columns : available;
  const unique = [...new Set(selected.filter(column => available.includes(column)))];
  const title = typeof saved.title === 'string' && saved.title.trim() ? saved.title.trim().slice(0, 120) : name;
  const sortField = available.includes(saved.sortField) ? saved.sortField : '';
  return { title, columns: unique, sortField, sortDescending: saved.sortDescending === true };
}
