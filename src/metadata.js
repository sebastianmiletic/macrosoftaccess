// Only our private tables are migrated here. SQLite's user_version belongs to the
// source database, so never overwrite it when opening somebody else's SQLite file.
export const METADATA_VERSION = 1;

export function migrateMetadata(db) {
  const existing = db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_mda_meta'").length > 0;
  let version = 0;
  if (existing) {
    const result = db.exec("SELECT value FROM _mda_meta WHERE key='schema_version'");
    version = Number(result[0]?.values[0]?.[0] || 0);
    if (!Number.isSafeInteger(version) || version < 0 || version > METADATA_VERSION) {
      throw new Error(`Unsupported Macrosoft metadata version: ${version}. This database may require a newer app.`);
    }
  }
  if (version === METADATA_VERSION) return false;
  db.run('BEGIN IMMEDIATE');
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS _mda_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS _mda_objects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT '',
        settings TEXT NOT NULL DEFAULT '{}',
        UNIQUE(type, name)
      );
      CREATE TABLE IF NOT EXISTS _mda_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_table TEXT NOT NULL,
        from_field TEXT NOT NULL,
        to_table TEXT NOT NULL,
        to_field TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS _mda_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO _mda_meta(key, value) VALUES('schema_version', '1')
        ON CONFLICT(key) DO UPDATE SET value=excluded.value;
    `);
    db.run('COMMIT');
    return true;
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}
