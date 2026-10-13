export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'light',
  density: 'compact',
  confirmActions: true,
  rows: 1000,
  sqlDialect: 'sqlite',
  navigationPane: 'expanded'
});

export function normalizeSettings(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    theme: ['light', 'dark'].includes(input.theme) ? input.theme : DEFAULT_SETTINGS.theme,
    density: ['compact', 'comfortable'].includes(input.density) ? input.density : DEFAULT_SETTINGS.density,
    confirmActions: typeof input.confirmActions === 'boolean' ? input.confirmActions : DEFAULT_SETTINGS.confirmActions,
    rows: [100, 1000, 10000].includes(input.rows) ? input.rows : DEFAULT_SETTINGS.rows,
    sqlDialect: ['sqlite', 'access'].includes(input.sqlDialect) ? input.sqlDialect : DEFAULT_SETTINGS.sqlDialect,
    navigationPane: ['expanded', 'collapsed'].includes(input.navigationPane) ? input.navigationPane : DEFAULT_SETTINGS.navigationPane
  };
}
