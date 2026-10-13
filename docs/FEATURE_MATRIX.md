# Feature and compatibility inventory

This is an implementation tracker, not a statement of parity with any Microsoft Access release. **Supported** means exercised in this app; **partial** means a limited workflow exists; **not implemented** means no working equivalent. Microsoft Access remains a Windows product with version-dependent behaviour.

| Area | Status | Current implementation / gap |
| --- | --- | --- |
| macOS shell and startup | Partial | Native window, menus, ribbon-style controls, tabs, search, templates and recent files. No exact Access visual parity, recovery or startup form. |
| Project persistence | Partial | Local SQLite files, atomic save, backups, versioned private metadata. No crash recovery, concurrent locking or migration preview. |
| Tables and datasheets | Partial | Create/edit records, basic schema, add fields and indexes. No full Access type matrix, validation designer, multi-cell selection or undo. |
| Relationships | Partial | Visual metadata relationships; not enforced by SQLite unless defined explicitly in SQL. |
| Queries | Partial | SQLite SQL editor and single-table field picker. No Access SQL compatibility layer, complete QBE, query history or query debugger. |
| Forms | Partial | Generated bound single-record editor with saved form title, captions, bound field visibility/required settings, text/long text/number/date/checkbox controls, reorder by drag or keyboard-accessible buttons. No free-placement designer, subforms, lookup controls, macros or events. |
| Reports | Partial | Tabular report preview, print and PDF. No group pagination, layout designer or charts. |
| Macros and scripting | Not implemented | No VBA interpreter, Access object model, macro builder or trusted script runtime. |
| Import/export | Partial | CSV import/export; mdbtools `.mdb/.accdb` table data import with schema-informed SQLite integer/real mapping and conversion report. No round-trip `.accdb`, Access query/form/report conversion, linked sources, Excel or ODBC. |
| Compatibility inspection | Partial | Conversion report lists imported tables, row counts and known unsupported families. Cannot inventory every unsupported Access object from the file. |
| Settings and accessibility | Partial | Persisted theme/density/query limit and database table view, visible focus and reduced-motion support. No complete preference catalogue or audited VoiceOver support. |
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
| `.mdb`, `.accdb` | Table-data import through external mdbtools, if readable | No | Partially: table columns and some numeric affinities; forms, reports, macros, VBA, constraints and most schema semantics are not preserved |
| `.csv` | Table import | Export CSV | No |
| `.accde`, `.mde`, `.accdr`, `.laccdb`, `.ldb`, `.xlsx` | No | No | No |

The imported Access source file is never intentionally modified. Always compare critical imported data with the original. Integration tests have been run against `.mdb` and `.accdb` examples from the public `mdbtools/mdbtestdata` repository. Fixtures are downloaded to a local temporary directory and are not included in this repository.
