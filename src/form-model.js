export const FORM_CONTROL_TYPES = ['text', 'textarea', 'number', 'date', 'checkbox'];

export function defaultFormSettings(columns, title) {
  return {
    version: 1,
    title,
    controls: columns.map(column => ({
      field: column.name,
      label: column.name.replaceAll('_', ' '),
      type: /BOOL/i.test(column.type) ? 'checkbox' : /INT|REAL|NUMERIC/i.test(column.type) && !column.pk ? 'number' : 'text',
      visible: true,
      required: Boolean(column.notnull && !column.pk)
    }))
  };
}

export function normalizeFormSettings(raw, columns, title) {
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { parsed = null; }
  const defaults = defaultFormSettings(columns, title);
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.controls)) return defaults;
  const validFields = new Set(columns.map(column => column.name));
  const seen = new Set();
  const controls = parsed.controls.filter(control => {
    if (!control || !validFields.has(control.field) || seen.has(control.field)) return false;
    seen.add(control.field);
    return true;
  }).map(control => ({
    field: control.field,
    label: String(control.label ?? control.field).slice(0, 120),
    type: FORM_CONTROL_TYPES.includes(control.type) ? control.type : 'text',
    visible: control.visible !== false,
    required: control.required === true
  }));
  for (const control of defaults.controls) if (!seen.has(control.field)) controls.push(control);
  return { version: 1, title: String(parsed.title || title).slice(0, 120), controls };
}
