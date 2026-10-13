# Macrosoft Access

A local-first visual relational database workbench for **macOS only**. Linux support is a future goal, not a current capability. **This is an independent application, not Microsoft Access or a complete Access clone.** See the [feature and compatibility inventory](docs/FEATURE_MATRIX.md) for implemented and missing workflows.

## Run locally

```bash
npm install
npm run dev
```

Build the renderer and open it as an Electron app:

```bash
npm run build
npm start
```

Build a distributable Apple Silicon app and DMG:

```bash
npm run dist:mac
```

The installer will be in `release/`. The app icon and UI logo are generated from the image supplied in Downloads (`assets/logo-source.jpeg`), with its white JPEG background removed. The app is signed on machines with a suitable signing identity, but **not notarised**. The `.app` in `release/mac-arm64/` can be opened directly.

## Implemented features

- Native macOS window frame, expanded menus, open/save panels, keyboard shortcuts, ribbon, object navigation, right-click object menus, document tabs, command palette, status bar and zoom.
- User-supplied logo in the title bar, welcome screen, File view and macOS app icon; familiar red ribbon styling, contextual object tabs, stateful button feedback and opening/closing transitions (disabled by reduced-motion settings).
- File pages for Info, New, Open, Import, Export, Options and Help; recent files and Contacts, Inventory and Tasks templates.
- Local application settings (light/dark theme, density, query result limit, action confirmation) and a per-database default table view.
- Local SQLite-backed `.macrodb`, `.sqlite` and `.db` files; create, open, save and save-as. Internal project metadata is versioned and rejects newer unsupported versions.
- Tables: create fields using SQLite types and constraints, inspect schema, add fields, add indexes, edit cells and records, sort and delete records.
- Queries: SQLite SQL editor, saved queries, results grid, basic single-table visual field picker, confirmation for action SQL.
- Generated single-record forms and read-only printable tabular reports, PDF export.
- Relationship diagram with **metadata-only** relationship declarations, not enforced foreign keys. For enforced constraints, create SQLite foreign keys using SQL.
- CSV import/export; best-effort `.mdb` and `.accdb` **table data import** using `mdbtools`, with a saved conversion report listing imported tables, row counts and known losses.
- Backup snapshot, integrity check and compact (`VACUUM`).

## Access format limitations

Native projects are SQLite databases. On a Mac, Access files are imported using `mdbtools` when installed:

```bash
brew install mdbtools
```

The **External Data → Import Access** command accepts `.mdb` and `.accdb` files and creates a new editable local database from their tables. `mdbtools` must be installed separately. No representative Access fixture was available for automated import testing, so import compatibility varies by file.

Imported columns are stored as SQLite `TEXT`, not their original Access types. Duplicate and blank headers are renamed for SQLite; the compatibility report records the target table names. Import leaves the original file untouched. It does **not** preserve Access forms, reports, macros, VBA, attachment semantics, query definitions, indexes, relationships, validation rules or every Access field type. It cannot save or round-trip `.accdb` files. Microsoft's proprietary Access engine is not provided for macOS. Imported data is saved into a new `.macrodb`, `.sqlite` or `.db` file.

## Roadmap status

| Area | Status |
| --- | --- |
| P1 database files, basic tables, SQLite SQL, CSV exchange, backup | Working baseline |
| Expanded ribbon, File pages, native menus, recent files, templates and settings | Working baseline |
| P1 full table designer, true foreign-key editor, multi-table visual QBE, undo | Not implemented |
| P2 drag-and-drop form designer, bound lookup controls, subforms and events | Not implemented |
| P3 paginated report designer, charting, visual macros and scripting | Not implemented |
| P4 full Access compatibility, external connections, notarisation | Not implemented |

Do not rely on this app as the only copy of important data. Back up project files, and test compatibility with representative databases before production use.

## Tests

`npm run check` runs metadata and compatibility unit tests and builds the renderer. A browser-level smoke test is available using a launched Electron instance with remote debugging enabled:

```bash
./node_modules/.bin/electron --remote-debugging-port=9225 .
# In another terminal:
node tests/smoke.mjs
# On a separate fresh test instance:
node tests/template-smoke.mjs
```
