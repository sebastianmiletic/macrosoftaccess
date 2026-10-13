# Feature and compatibility inventory

This is an implementation tracker, not a statement of parity with any Microsoft Access release. **Supported** means exercised in this app; **partial** means a limited workflow exists; **not implemented** means no working equivalent. Microsoft Access remains a Windows product with version-dependent behaviour.

| Area | Status | Current implementation / gap |
| --- | --- | --- |
| macOS shell and startup | Partial | Native window, menus, contextual ribbon-style controls, tabs, search, resizable/collapsible navigation and object groups, templates and recent files. Layout tested at normal and compact window widths. No exact Access visual parity or startup form. A native Save/Discard/Cancel close flow is implemented; crash recovery is not. |
| Project persistence | Partial | Local SQLite files, atomic save, backups, versioned private metadata. No crash recovery, concurrent locking or migration preview. |
| Tables and datasheets | Partial | Access-inspired compact datasheet and contextual Fields ribbon with working quick-add text, integer, date and boolean fields; explicit Datasheet/Design views; inline field type/default/required settings. Datasheet record navigation and search work on visible (capped) rows; sorting and filters update the navigator. Existing fields remain read-only; no full Access type matrix, validation designer, multi-cell selection or undo. |
| Relationships | Partial | Visual metadata relationships; not enforced by SQLite unless defined explicitly in SQL. |
| Queries | Partial | SQLite SQL editor, single-table field picker and opt-in, tested Access-style expression/TOP translation with SQL preview. No full ACE/Jet SQL engine, complete QBE, query history or debugger. |
| Forms | Partial | Generated bound single-record editor with saved form title, captions, bound field visibility/required settings, text/long text/number/date/checkbox controls, reorder by drag or keyboard-accessible buttons. No free-placement designer, subforms, lookup controls, macros or events. |
| Reports | Partial | Tabular preview, print/PDF and persisted Design View for title, column visibility/order and sorting. No grouping, pagination controls, calculated controls or charts. |
| Macros and scripting | Not implemented | No VBA interpreter, Access object model, macro builder or trusted script runtime. |
| Import/export | Partial | CSV import/export; mdbtools `.mdb/.accdb` table data import with schema-informed SQLite integer/real mapping and primary keys when valid, plus a conversion report. A separate Java 17+/Jackcess exporter produces new Access 2016 `.accdb` table-data files with primary keys, strict ISO Date/Time typing, and rejection of unsupported numeric/date/binary values. No in-place `.accdb` editing, metadata/object round-trip, Access query/form/report conversion, linked sources, Excel or ODBC. |
| Compatibility inspection | Partial | Conversion report lists imported tables, row counts and known unsupported families. Cannot inventory every unsupported Access object from the file. |
| Settings and accessibility | Partial | Access-inspired start screen with searchable recent local files; persisted theme/density/query limit and database table view, visible focus and reduced-motion support. No exact Windows Access UI, complete preference catalogue or audited VoiceOver support. |
| Platform and distribution | Partial | macOS-only runtime and Apple Silicon DMG; signed where identity is available, not notarised. Linux is not supported yet. |

## Release gates from the expanded specification

- [x] Create, save, reopen and back up a local database (basic workflows).
- [ ] Complete table types, constraints, indexes and enforced relationships.
- [ ] Complete datasheet editing, navigation, undo, sorting, filtering and validation.
- [ ] Full visual and SQL query parity on the same data layer.
- [ ] Fully designed, bound and validated forms.
- [ ] Paginated report designer and consistent PDF engine.
- [ ] Typed import/export with rejected-row reporting and round-trip checks.
- [x] Versioned internal project metadata migration (v1; no user-schema migration preview).
- [ ] Preview and rollback for every destructive operation.
- [x] Offline local core workflows.
- [x] Basic global and database-scoped preferences.
- [x] Report known unsupported Access conversion families instead of silently claiming conversion.
- [ ] Audited keyboard and VoiceOver coverage.
- [ ] Automated conversion, corruption, recovery and crash test suites.

## File format truth table

| Format | Open/read | Modify in original format | Preserve Access objects |
| --- | --- | --- | --- |
| `.macrodb`, `.sqlite`, `.db` | Yes, as SQLite | Yes, save SQLite | Only this app's supported object metadata |
| `.mdb`, `.accdb` | Table-data import through external mdbtools, if readable | **No in-place edit**; optional **new `.accdb` table-data export** requires Java 17+ | Exported files are actual Access 2016 files; table data, readable primary keys and basic type mappings only. Access forms, reports, queries, macros, VBA, AutoNumber and other constraints are not preserved |
| `.csv` | Table import | Export CSV | No |
| `.accde`, `.mde`, `.accdr`, `.laccdb`, `.ldb`, `.xlsx` | No | No | No |

The imported Access source file is never intentionally modified. Export refuses to replace existing files. Always compare critical imported data with the original. Integration tests have been run against `.mdb` and `.accdb` examples from the public `mdbtools/mdbtestdata` repository. Fixtures are downloaded to a local temporary directory and are not included in this repository.
