# select * from everything

sql, all the way down. by [Harshpreet Singh](https://harshpreet.com) ([harshpreet.com](https://harshpreet.com)).

an open-source book that draws SQL and the database underneath it. 18 parts, 198 chapters, from your first `SELECT` to the bytes on disk. every query runs on a real postgres in your browser, and every page, tuple and WAL record in the figures was captured from a real server. free, forever.

**read it at [sql.harshpreet.com](https://sql.harshpreet.com)**

## what's different

- **figures, not walls of text.** step a query clause by clause and watch the table shrink. update a row twice and watch the old versions pile up on the page. race two transactions into a lost update, then fix it three ways. crash the server and watch the WAL put the data back.
- **queries that run.** every sql block runs right in the page, on [PGlite](https://pglite.dev): postgres 18.6 compiled to WebAssembly, no server. the output you see before you press run is the real output, checked against that same engine on every build.
- **internals captured, not drawn.** the pages, tuples, locks, buffers and WAL records in the figures come from `tools/pgtrace`, which runs a scenario on a real postgres 18.6 and writes down what pageinspect, pg_locks, pg_buffercache and pg_walinspect said after every step.
- **the standard vs postgres.** what SQL promises and what postgres actually does are kept apart, every time.
- **one voice.** lowercase, casual, dense. like a friend explaining the database with a whiteboard.

## what's inside

| part | |
| --- | --- |
| 01 start here | what a database actually is, the real postgres running in the page, your first query |
| 02 one table | SELECT, WHERE, NULL, ORDER BY and GROUP BY |
| 03 joins and subqueries | every join, semi and anti joins, subqueries, set operations, CTEs |
| 04 windows, grouping and recursion | window functions, grouping sets, recursive CTEs |
| 05 changing data | INSERT, UPDATE, DELETE, upserts, MERGE, bulk loads, functions and triggers |
| 06 types and values | numbers, text, time, json, arrays and ranges |
| 07 schema design | keys, constraints, normal forms, the patterns that keep data honest |
| 08 indexes, from the outside | what an index is for, which queries it helps, what it costs |
| 09 how a query runs | parse, plan, execute, EXPLAIN, scans, joins, sorts |
| 10 the optimizer | row estimates, the cost model, and how it gets them wrong |
| 11 transactions and isolation | ACID, the anomalies, the isolation levels, what postgres gives you at each |
| 12 pages and the buffer pool | files, 8 KB pages, tuple headers, TOAST, the cache in front of the disk |
| 13 inside indexes | b+trees page by page, hash, GIN, GiST, BRIN, LSM trees |
| 14 MVCC and vacuum | why an UPDATE writes a new row, who sees which version, vacuum |
| 15 locks and concurrency control | serializability, two-phase locking, the lock manager, SSI |
| 16 WAL and recovery | write-ahead logging, LSNs, checkpoints, crash recovery, replication |
| 17 scale and distribution | pools, partitions, replicas, shards |
| 18 deep dives and interviews | one row traced end to end, other engines, a toy database you build |

written against **postgres 18.6** (PGlite 0.5.12 in the browser).

## run it

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # static site in out/, with full-text search
```

needs node 22.12+ and pnpm 10. the in-browser engine comes from `node_modules` (`pnpm sql-assets` copies it into `public/sql/`; `dev` and `build` do that for you). the native checks (`pnpm pgtrace`, `pnpm sql-check --engine=native`) need postgres 18 binaries: [Postgres.app](https://postgresapp.com) on a mac, the PGDG `postgresql-18` package on linux, or `PG_BIN=/path/to/bin`. they start their own throwaway server and never touch yours.

## write for it

start with [CONTRIBUTING.md](./CONTRIBUTING.md). the rules of the house:

- [DESIGN.md](./DESIGN.md): how everything looks (and what each colour means)
- [AUTHORING.md](./AUTHORING.md): how it reads, every component, every code-block flag, every check

## how it's built

```
content/<part>/<chapter>.mdx            the chapters
content/<part>/<chapter>.golden.json    the real output of every sql block, written by sql-check
content/<part>/traces/                  pgtrace scenarios and their captures
datasets/                               the databases chapters run against (shop, school, bank, org, events, lab)
src/content/curriculum.ts               the book's order, titles and blurbs
src/components/db/                      database figures: pages, version chains, b-trees, WAL, sessions
src/components/figures/                 the shared figure kit and one-off figures
src/lib/sql/ + public/sql/              run sql in the browser (PGlite in a web worker)
tools/pgtrace/                          real postgres → step-by-step json for the internals figures
tools/descent/                          captures the home page's "one query, all the way down"
scripts/                                check.mjs (structure + voice), sql-check.mjs (runs every block), sql-assets.mjs
```

next.js 16 (static export), mdx, tailwind 4, shiki, codemirror. set in Crimson Pro, Cormorant Garamond and JetBrains Mono.

## license

MIT for the code and the content. the fonts (Crimson Pro, Cormorant Garamond, JetBrains Mono) are under the SIL Open Font License. the in-browser postgres (PGlite, and the PostgreSQL inside it) is listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

PostgreSQL and Postgres are trademarks of the PostgreSQL Community Association of Canada, used here only to name the software. this project isn't affiliated with the PostgreSQL Global Development Group, with ElectricSQL, or with the authors of the books it references.
