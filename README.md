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
- Access-inspired start screen with Home, New, Open, searchable recent files and working Blank, Contacts, Inventory and Tasks templates; additional File pages for Info, Import, Export, Options and Help.
- Local application settings (light/dark theme, density, query result limit, action confirmation) and a per-database default table view.
- Local SQLite-backed `.macrodb`, `.sqlite` and `.db` files; create, open, save and save-as. Internal project metadata is versioned and rejects newer unsupported versions.
- Tables: compact datasheet and contextual Fields ribbon with working Short Text, Number, Date & Time, Yes/No and More Fields actions; explicit Datasheet/Design switcher; add fields with type/default/required options in Design View, indexes, record editing and sorting. SQLite does not enforce all Access type semantics; existing field changes still require manual migration.
- Queries: SQLite SQL editor, saved queries, results grid, basic single-table visual field picker, confirmation for action SQL. Optional Access-style SQL subset with `SELECT TOP`, `&` concatenation, `Left`, `Right`, `Mid`, `Nz`, `IIf`, `InStr`, `Date`, `Now` and `Len`; the original SQL and its dialect are saved with each query.
- Generated single-record forms with a saved Design View (caption, control type, visibility, required setting, ordering), record entry/navigation. Reports have a saved Design View for title, column visibility/order and sorting plus a printable preview and PDF export; grouping and calculated controls are not supported.
- Relationship diagram with **metadata-only** relationship declarations, not enforced foreign keys. For enforced constraints, create SQLite foreign keys using SQL.
- CSV import/export; best-effort `.mdb` and `.accdb` **table data import** using `mdbtools`, with a saved conversion report. Optional **new `.accdb` table-data export** using Java 17+ and a packaged Jackcess writer; generated files are actual Access 2016 databases, but local project objects, field constraints, relationships and unsupported values do not round-trip.
- Backup snapshot, integrity check and compact (`VACUUM`).

## Visual parity boundaries

The start screen and table workspace follow the placement and density of the supplied Access screenshots, with original Macrosoft branding. This is not a pixel-identical Windows Access UI or a complete toolbar inventory. Controls appear only where a local implementation exists; unsupported Access controls are not shown as working buttons. Editing an existing `.accdb` in place, VBA and full ACE/Jet objects remain outside this build.

## Access format limitations

Native projects are SQLite databases. On a Mac, Access files are imported using `mdbtools` when installed:

```bash
brew install mdbtools
```

The **External Data → Import Access** command accepts `.mdb` and `.accdb` files and creates a new editable local database from their tables. `mdbtools` must be installed separately. Import has been smoke-tested with public `mdbtools/mdbtestdata` `.mdb` and `.accdb` fixtures; other Access databases may contain unsupported data or objects.

**External Data → Access tables** exports a **new, genuine Access 2016 `.accdb`** containing supported local table names, columns and row values. Java 17+ must be installed (`java -version`). The bundled Apache-licensed Jackcess writer maps SQLite INTEGER to Access 32-bit Long, REAL to Double, declared DATE/DATETIME/TIMESTAMP fields containing unambiguous ISO strings to Access Date/Time, and other non-binary fields to Long Text. Primary keys are exported when defined locally. Out-of-range integers, ambiguous dates, duplicate keys and binary data abort export instead of silently corrupting records. The writer refuses to overwrite an existing file. Always verify the resulting file in Microsoft Access. This is **Export**, not Save or Save As: local projects still use `.macrodb`; Access forms, queries, reports, VBA, non-primary-key indexes, relationships, AutoNumber and formatting are not transferred.

When `mdb-schema` can inspect a table, integer and floating-point fields are mapped to SQLite `INTEGER` or `REAL`; currency, decimal, date/time and text fields remain `TEXT` to avoid changing precision or interpreting locale-specific dates. If inspection fails, columns default to `TEXT`. Readable primary keys are retained when their names and existing values map without collisions; AutoNumber semantics are not. Duplicate and blank headers are renamed for SQLite; the compatibility report records target table names, field mappings and key warnings. Import leaves the original file untouched. It does **not** preserve Access forms, reports, macros, VBA, attachment semantics, query definitions, indexes, relationships, validation rules or every Access field type. It cannot edit or round-trip an existing `.accdb` file in place. Microsoft's proprietary Access engine is not provided for macOS. Imported data is saved into a new `.macrodb`, `.sqlite` or `.db` file.

Access-style SQL is **not** the complete ACE/Jet dialect: crosstabs, parameter prompts, VBA calls, Access wildcards, many date/format functions and pass-through queries are not implemented. Use Preview SQL to inspect the translated SQLite statement before running it.

## Roadmap status

| Area | Status |
| --- | --- |
| P1 database files, basic tables, SQLite SQL, CSV exchange, backup | Working baseline |
| Expanded ribbon, File pages, native menus, recent files, templates and settings | Working baseline |
| P1 full table designer, true foreign-key editor, multi-table visual QBE, undo | Not implemented |
| P2 free-placement form designer, bound lookup controls, subforms and events | Not implemented; basic bound form layout editing is available |
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
# On another fresh test instance:
node tests/form-smoke.mjs
node tests/report-design-smoke.mjs
npm run build:access-writer && node tests/access-export-integration.mjs
# Optional real-format integration test, with a fixture from mdbtools/mdbtestdata:
ACCESS_FIXTURE=/path/to/ASampleDatabase.accdb node tests/access-import-smoke.mjs
```
