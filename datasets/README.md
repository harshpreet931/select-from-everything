# datasets

the databases a code block can start from: ```` ```sql run db=shop ````. each one is plain sql that
runs unchanged on the browser engine (PGlite) and on a real postgres 18. the browser builds it from
these files on first use (about a second), keeps a snapshot, and gives every run a fresh copy.

| db | what's in it | rows |
|---|---|---|
| `empty` | nothing. the default when a block doesn't say `db=` | |
| `shop` | customers, products, orders, order_items | 2,000 / 200 / 10,000 / 24,942 |
| `school` | instructors, students, courses, enrollments, prerequisites, enrollments_flat | 8 / 40 / 12 / 164 / 14 / 30 |
| `bank` | accounts, transfers | 1,000 / 20,000 |
| `org` | departments, employees (a ternary tree), oncall | 8 / 300 / 14 |
| `events` | events, march to may 2026, in time order | 25,000 |
| `lab` | accounts, notes; pageinspect, pg_buffercache, pg_visibility, pg_walinspect, amcheck, pg_freespacemap installed; never vacuumed | 3 / 400 |

the edge cases each dataset carries on purpose (NULL emails, the `'Null'` customer, Ada Lovelace at
id 42, the left-handed teapot nobody buys, the missing day in `events`, ...) are listed at the top of
its `data.sql`.

## rules

- `<name>/dataset.json`: `name`, `title`, `blurb`, `files` (run in order, in one transaction),
  `analyze` (`VACUUM (ANALYZE)` after loading: exact statistics, hint bits set), `extensions`,
  `setups`, `maxRowsPerTable`. a `CHECKPOINT` always follows.
- deterministic or nothing: values come from `gen.pick(i, salt, m)` / `gen.u(i, salt)` (hashes of the
  row number), never `random()` or `now()`. only exact arithmetic (no `pow()`), and every
  `INSERT ... SELECT` has an `ORDER BY`, so the rows and their physical order are the same on every
  engine. `sql-assets --check` and the nightly native run catch drift.
- under 30,000 rows per table: `ANALYZE` then samples every row, so `pg_stats` and EXPLAIN costs are
  exact and the same everywhere.
- only primary keys, `UNIQUE` and foreign keys. no secondary indexes: index chapters make their own.
- `<name>/setup/<setup>.sql`: extra state a block asks for with `setup=<setup>` (`lab` has `bloat`).

## changing one

edit the sql, then `pnpm sql-assets` (re-seeds it, updates `src/lib/sql/datasets.gen.json`) and
`pnpm sql-check --update` on every chapter that uses it, and read the golden diffs. datasets are frozen
once chapters depend on them: a change means a book-wide `--update`.
