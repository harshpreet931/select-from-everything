# authoring

how to write a chapter for select * from everything. read [DESIGN.md](./DESIGN.md) and [how it reads](#how-it-reads) first, then open the reference chapters and keep them next to you:

- **reference chapter:** [`content/basics/logical-order.mdx`](./content/basics/logical-order.mdx) (live at `/learn/basics/logical-order`). the surface: runnable queries, a clause stepper, predicts.
- **internals reference:** [`content/mvcc/update-is-insert.mdx`](./content/mvcc/update-is-insert.mdx). the inside: pageinspect, a captured two-session trace, version chains.
- **figures:** the shared kit in [`src/components/figures/kit/`](./src/components/figures/kit/) and the database primitives in [`src/components/db/`](./src/components/db/).

every chapter should be as good as those. if it isn't, it's not done.

---

## the deal

- **less text, more picture.** a chapter is mostly figures, small queries and short paragraphs. if three paragraphs explain something a figure could show, draw the figure.
- **every claim is true.** every runnable query runs on the same postgres the page runs, and its output is checked. every claim about postgres internals comes from a real server (a golden or a captured trace), not memory. numbers are measured or cited, never vibes.
- **finished, not scaffolded.** no "todo", no "coming soon", no stub sections. a short complete chapter beats a long half one.
- **written by a person.** lowercase, casual, information dense. see [how it reads](#how-it-reads).

the engine: **postgres 18.6**. in the browser it's PGlite 0.5.12 (postgres compiled to webassembly, one session). traces and native checks use a real postgres 18.6 server. postgres 19 is at rc1 (ga planned for 2026-11-19): write against 18, and mark 19 things with `<Since v={19} preview />`.

## how it reads

- sentences and headings start lowercase. code stays exactly as written: SQL keywords uppercase in code and when you name them in prose (`SELECT`, `GROUP BY`, `NULL`), identifiers as they are (`customers`, `ctid`). acronyms stay uppercase (MVCC, WAL, LSN, ACID) and people's names stay capitalized (Codd, Stonebraker).
- no em dashes. use a comma, a colon, a period or parentheses. `pnpm check` fails on them.
- no hype words (comprehensive, ultimate, seamless, powerful, robust, leverage, delve and the rest of the list in `scripts/check.mjs`). `pnpm check` warns on them.
- short sentences, one idea each. show it in a figure before you explain it in a paragraph.
- `:)` at most once per page. no other emoji.
- keep **what the standard says** apart from **what postgres does**. say "standard since SQL:1999" or "postgres only" when it matters, and use `<Since />` chips inline.
- the browser engine is a **lab postgres**: one session, no autovacuum, no background writer or checkpointer, no parallel workers, `io_method = sync`, the C collation. when a chapter's point depends on one of those, say so and show native output instead.

---

## files

```
content/<part>/<chapter>.mdx              the chapter (slug must match src/content/curriculum.ts)
content/<part>/<chapter>.golden.json      real output of every sql block, written by `pnpm sql-check --update`
content/<part>/terms.json                 glossary terms this part introduces
content/<part>/traces/<x>.scenario.sql    a scripted multi-session scenario for pgtrace
content/<part>/traces/<x>.pgtrace.json    its captured output (import it into the chapter)
src/components/figures/<part>/*.tsx       bespoke figures for this part
datasets/<db>/                            the sample databases (frozen once chapters use them)
```

the chapter list, titles and blurbs live in `src/content/curriculum.ts`. don't add, remove or rename chapters there. the page renders the title, blurb, breadcrumb (`everything.<part>.<chapter>`) and reading time for you: **don't write a `# heading`**.

## chapter anatomy

```mdx
import { SomeFigure } from "@/components/figures/<part>/SomeFigure";
import trace from "./traces/some-scenario.pgtrace.json";

<InShort>
one or two lines that are the whole idea. bold the 2-3 key terms.
</InShort>

## the picture                            // lowercase h2s, 3 to 7 of them
name the confusion ("you know how ..."), then an analogy mapped in parentheses. then a <Figure>.

## <the mechanism>
a step-through, a diagram, small runnable queries with real output.

<Predict ...> or <Quiz ...>               // at least one per chapter, aimed at the exact misconception

## <the gotcha / the why-not / the edge>
<Gotcha>, <Deep>, <Interview> as they fit.

<Keylines>
- 3 to 6 one-liners. the whole chapter, if you only read this.
</Keylines>
```

target: 600 to 1400 words of prose, 3+ figures, 1+ check (Predict/Quiz). flagship chapters can be longer.

link generously to other chapters with absolute paths: `[the 8 KB page](/learn/storage/the-page)`. every chapter in the curriculum has a page (unwritten ones say "soon"), so links never 404.

---

## the datasets

a runnable block starts from a fresh copy of one of these. pick the one whose story fits.

| db | what's in it | rows |
|---|---|---|
| `empty` | nothing. the default | |
| `shop` | customers, products, orders, order_items | 2,000 / 200 / 10,000 / 24,942 |
| `school` | instructors, students, courses, enrollments, prerequisites, enrollments_flat (unnormalized on purpose) | 8 / 40 / 12 / 164 / 14 / 30 |
| `bank` | accounts, transfers. alice (1) and bob (2) hold 200.00 between them, always | 1,000 / 20,000 |
| `org` | departments, employees (a ternary tree, 6 levels), oncall | 8 / 300 / 14 |
| `events` | product events, march to may 2026, in time order. 2026-04-14 is missing | 25,000 |
| `lab` | accounts, notes, with pageinspect, pg_buffercache, pg_visibility, pg_walinspect, amcheck and pg_freespacemap installed. never vacuumed. `setup=bloat` adds dead tuples | 3 / 400 |

the edge cases are on purpose and listed at the top of each `datasets/<db>/data.sql`: a NULL email, the customer literally named `'Null'`, two different Sam Lees, Zoë vs Zoe, a customer who never orders, Ada Lovelace at id 42 (the home page's customer), the left-handed teapot nobody buys, a student named `Robert'); DROP TABLE students;--`. use them: they are what make an example land.

facts worth knowing: `customers` is relation oid 16385. tables have only their primary key, `UNIQUE` constraints and foreign keys, **no secondary indexes**, so index chapters create their own. statistics are exact (every table is under 30,000 rows, so `ANALYZE` reads all of it), which keeps EXPLAIN costs stable. never edit a dataset to suit one chapter; build what you need in the block, or in a hidden block of a session.

## code blocks

````mdx
```sql run db=shop
SELECT name, city FROM customers WHERE id = 42;
```
````

the flags, space-separated after `sql`:

| flag | meaning |
|---|---|
| `run` | runnable. the page shows its real output (from the golden) and a **run** button that runs it in the browser on a fresh database |
| `db=shop` | which dataset to start from. default `empty` |
| `session=orders` | blocks with the same session form a chain: earlier blocks run first, in page order. only the first block of a session may set `db`, `ext` or `setup` |
| `hidden` | (needs `session`) runs as part of the chain but isn't shown. for setup the reader doesn't need to see |
| `ext=pageinspect` | creates an extension first: pageinspect, pg_buffercache, pg_visibility, pg_walinspect, amcheck, pg_freespacemap, pg_trgm, btree_gist, ltree. anything else (pgrowlocks, pg_stat_statements, postgis...) is `native` |
| `setup=bloat` | runs `datasets/<db>/setup/bloat.sql` first |
| `unordered` | the rows have no guaranteed order: compared as a set, and the page says so. prefer a real `ORDER BY` |
| `volatile` | values change every run (`now()`, `random()`): only the shape is compared |
| `expect=error` | the block is meant to fail. the golden is the error |
| `errors=continue` | keep going after an error, like psql does |
| `rows=10` | show the first 10 rows on the page (the golden still checks them all) |
| `native` | can't run in the browser (two sessions, autovacuum, parallel query, ICU collations...). the golden comes from a real postgres 18.6 server and the page says so. no run button |
| `title="orders.sql"` `{2}` `/amount/` `nolines` | file tab, highlighted lines, highlighted words, no line numbers |

rules `pnpm sql-check` enforces:

- **every multi-row result needs a total `ORDER BY`** (or `unordered`). a table has no order until you ask for one, and a book that forgets that teaches the bug.
- `EXPLAIN ANALYZE` goes with `TIMING OFF` (and usually `SUMMARY OFF`), so the golden doesn't change every run. costs and row counts are stable, timings are not.
- volatile functions (`now()`, `random()` without `setseed`, `gen_random_uuid()`, `uuidv7()`) need `volatile`.
- `string_agg`, `array_agg` and `json_agg` want an inner `ORDER BY`.
- a block that errors must say `expect=error` (or `errors=continue`).
- psql meta-commands (`\d`, `\x`), `COPY ... FROM` and other things the browser can't do can't be `run`. use `native`, or a plain ` ```psql ` / ` ```text ` block for a transcript.

other languages: `psql` and `text` for transcripts, `plan` for a pasted EXPLAIN, `bash`, `json`, `plpgsql`.

### goldens

the real output of every block lives in `content/<part>/<chapter>.golden.json`. you never write it by hand:

```bash
pnpm sql-check --update content/<part>/<chapter>.mdx                   # runs new or changed blocks twice, writes the golden
pnpm sql-check --engine=native --update content/<part>/<chapter>.mdx   # for `native` blocks (needs postgres 18 installed)
```

`--update` refuses output that differs between two runs (unless the block is `volatile`). read the diff of every golden you change. numbers you quote in prose (a ctid, an xmin, a row count, a cost) must come from a golden or a trace, never typed from memory.

---

## components (all global, no import needed)

### text blocks

```mdx
<InShort>the tl;dr. top of every chapter.</InShort>

<Gotcha title="optional short title">the thing that bites people.</Gotcha>
<Interview q="the question, as an interviewer would ask it">the answer that lands. a "bonus point" is welcome.</Interview>
<Docs href="https://www.postgresql.org/docs/18/mvcc.html" title="concurrency control">a pointer into the manual. paraphrase only.</Docs>
<Note title="optional">a neutral aside. rare.</Note>
<Deep title="why the file doesn't shrink">one level deeper. collapsed by default.</Deep>

<Keylines>
- one line each.
</Keylines>

<C k="ref">blue word</C>    colours a word to match a figure (ref | live | dead | meta | hot)
<Since v={17} />            "pg 17+"            <Since std="SQL:2023" />   "SQL:2023"
<Since only />              "postgres only"     <Since v={19} preview />   "postgres 19"
<Defs><dt>term</dt><dd>meaning</dd></Defs>
```

### checks

```mdx
<Predict options={["the 2 customers with no email", "no rows", "an error"]} answer={1}>
```sql
SELECT name FROM customers WHERE email = NULL;
```
<Explain>
why. shown only after they answer.
</Explain>
</Predict>

<Quiz question="where can row_number() not go?" options={["SELECT", "ORDER BY", "WHERE"]} answer={2}>
<Explain>...</Explain>
</Quiz>
```

the snippet inside a Predict is not `run` (that would give the answer away). put a runnable version right after it if watching it run helps.

### layout

```mdx
<Compare>
<Bad label="OFFSET 10000">
```sql run db=events
...
```
</Bad>
<Good label="keyset">
```sql run db=events
...
```
</Good>
</Compare>

<Tabs>
<Tab label="postgres">...</Tab>
<Tab label="the standard">...</Tab>
</Tabs>

<Figure caption={<>what to click, and what to notice. <C k="dead">colour words</C> to match.</>} wide>
...any figure...
</Figure>
```

`<Figure>` draws the soft panel and the caption, and switches its contents to the mono face. `wide` lets it break out a little past the text column (use it for steppers). captions tell the reader what to do and what to look at, in one or two sentences.

### generic figures

| component | use it for |
| --- | --- |
| `<ArrayViz values={[...]} pointers={{0: "lo"}} tones={{2: "hot"}} range={[0,1,"live"]} label="..." />` | slot arrays, a leaf being binary-searched, a strip of records |
| `<Tree>{` indented text `}</Tree>` | plans, lock hierarchies, schemas. **indent 4 spaces per level** (mdx eats 2). `// note`, `#dead` to colour |
| `<Flow stages={[{ label, sub, note }]} />` | pipelines (parse → plan → execute, the commit path) |
| `<Slides><Slide note="...">...</Slide></Slides>` | any sequence of frames with step controls |
| `<Bars data={[{ label, value, tone }]} unit="ms" log />` | numbers to compare (timings, sizes, hit ratios) |

### database figures

all global in mdx (no import). bespoke figures import them from `@/components/db/<File>`. every prop is plain data, and the props and view types live next to each component and in `src/lib/db/views.ts`. **look at every one with real data in the dev gallery: `pnpm dev:poll -p 3124`, then `http://localhost:3124/dev/figures`** (dev only, never built). its source, `src/app/dev/figures/page.dev.tsx`, is the best example of how to feed each primitive.

| component | draws | the reader does |
| --- | --- | --- |
| `<ResultTable columns rows rowTones ghostRows focusRows cursor hotCell group footer caption dense maxRows />` | a result grid like psql's: numbers right-aligned, `null` faint, system columns (`ctid`, `xmin`) in their colours, a ▶ cursor | looks. the workhorse for "here's what came back" |
| `<SqlPanel code lang hot live dead marks file />` / `<Sql code />` | highlighted sql (or a plan, or a psql transcript) with marked lines and token ranges | looks |
| `<ClauseStepper trace={trace} maxRows={14} />` | the query with the active clause lit, and the intermediate table under it: rows struck out as WHERE drops them, groups tinted, removed rows always shown. the query, stages and their notes all come from the capture's `@stages`, read on the server (only the stages reach the browser). `step={n}` picks which `@stages` step of the trace to show (default: the first). groups are tinted from `-- @stage <CLAUSE> group=<col>`; DISTINCT ON is tinted on its own. hand-written: `<ClauseStepper sql={q} stages={...} provenance="drawn by hand" />` | steps FROM → WHERE → … → LIMIT |
| `<SessionLanes sessions steps trace side options runs />` | two or three transactions over time: waits stretch until they wake, COMMIT live, errors with their SQLSTATE in dead, the committed data or versions or locks on the side. `options` + `runs` make "isolation = read committed / repeatable read" style switches | steps, switches the option |
| `<PageView page xact snap layout focus fields />` | an 8 KB heap page to scale: header, line pointers, free space, tuples, lp → tuple arrows; a tuple card with xmin, xmax, ctid, infomask flags | hovers and focuses tuples |
| `<VersionChain trace select="accounts:id=1" lanes field="balance" who="T2" />` | the versions of one row linked by t_ctid, each with the visibility rule that applies to the chosen reader; versions no open snapshot can see turn into dead ghosts. `lanes` puts the trace's sessions beside the chain on one stepper, `field` narrows the cards to one column, `who` picks the first reader | picks "as seen by T1 / T2 / a new transaction", steps |
| `<BTree lab={{ order, rules, presets }} />` or `<BTree trace … />` | a b+tree: the lab inserts, searches and range-scans with splits stepped; the captured form draws a real nbtree with high keys, sibling links and heap TIDs | types keys, steps splits |
| `<PlanTree plan mode="tree" show={["est","actual","buffers"]} />` | an EXPLAIN tree (raw `FORMAT JSON` works), estimates next to actuals, misestimates in dead (only for nodes that ran to completion; nodes under a Limit or the inner side of a semi join get a neutral "stopped early"). `mode="volcano"` steps `next()` calls (plan nodes need `withSim()` from `@/lib/db/sim/volcano`) | hovers, or presses next() |
| `<JoinLab left right on algos kind logical workMem />` | two small tables and a join: nested loop, index nested loop, hash, merge, with cursors, buckets, comparison counters. `logical` draws the filtered cross product | switches algorithm, steps, adds a duplicate, shuffles, slides work_mem |
| `<BufferPool lab={{ frames, policy, workload, ring }} />` or `trace` | buffer frames with usage counts, pins, dirty corners (accent), the clock hand, hits and reads | steps a workload, changes frames and policy |
| `<WalStrip trace mode="log" \| "recovery" \| "aries" />` | WAL records on an LSN ruler, flushed vs not, redo and checkpoint pointers; recovery replays onto pages; aries adds the three textbook passes | steps |
| `<PgStepper trace panels={["lanes", "page:accounts", "chain:accounts:id=1", "btree:accounts_pkey", "pool", "wal", "locks", "plan", "result:T1"]} />` | the "MemoryStepper of databases": a trace's sessions on the left, any panels on the right, what changed lit hot | steps |
| `<HeapFile view />` (or `heapFileFromTrace`) | a table's pages as bars: live, dead, free, plus visibility map bits | looks, or steps |
| `<SnapshotLine snap xact me />`, `<SnapshotLine ring={{ xmin, current }} />` | xids on a line with a snapshot's xmin, xmax and in-progress list; ring mode for wraparound | clicks an xid to get the verdict |
| `<WaitForGraph nodes holds waits cycle />` | who waits for whom, the cycle in dead | looks |
| `<LockTable requests matrix />` | holders and queues per object, and the 8×8 table-lock conflict matrix | hovers the matrix |
| `<HashIndex perBucket keys />` | postgres's hash index: meta page, buckets, overflow pages, one bucket splitting at a time | fills until it splits |

a bespoke figure that draws its own `<table>` adds `FIG_TABLE` (from the kit) to it, or the article's table styles leak in. never put an `h2`/`h3` inside a figure for the same reason. `FIG_TABLE` and `NARR` live in `kit/classes.ts`, so server components can use them too.

`<RunPick runs={...} show? />` is global in MDX: a few captured runs of one query (different data, a setting, an index), and the reader picks which one to see. a run can carry a `plan` (drawn with PlanTree), a `footer`, `hide` columns and a struck-row list. `RunSwitch` is the same component. read captures with `@/lib/db/captured` (`sqlOf`, `resultOf`, `runsOf`, `valueOf`, `planOf`, `stagesOf`, `prov`) instead of writing a reader per part. other pure helpers: `@/lib/db/describe` (the `describe*` sentences), `@/lib/db/locks` (lock modes and the conflict matrix), `fromExplainJson` from `@/lib/db/fromTrace`, and `distinctRange` / `distinctOnKey` in the kit's sql helpers.

the kit (`@/components/figures/kit`) has the pieces these are built from, for bespoke figures: `Row`, `Words`, `Toggle`, `Slider`, `Well`, `Chip`, `Legend`, `Stat`, `Narration`, `Verdict`, `Console`, `Heads`/`Arrow` for svg, `tv`/`tint`/`ring`, `look()` for the colour semantics, `useReducedMotion`, `useWidth`, `fmt`, `bytes`, `lsn`, `tid`, the sql tokenizer and `Provenance`.

which data drives a figure matters (see DESIGN.md): a postgres claim draws a **trace** or a golden. simulators (the BTree and BufferPool labs, JoinLab, HashIndex, volcano, ARIES) are tested against real postgres output in `src/lib/db/sim/*.test.ts` (`pnpm test:sim`), and say "model" in their caption when they simplify.

---

## traces (real engine state for figures)

some figures need state the browser engine can't show: two sessions at once, locks and waits, a crash and the recovery after it, the buffer pool of a running server. those come from `tools/pgtrace`, which runs a scripted scenario on a throwaway postgres 18.6 server and records what the server looked like after every step. the full reference is [`tools/pgtrace/README.md`](./tools/pgtrace/README.md).

```sql
-- content/mvcc/traces/update-twice.scenario.sql
-- @title T1 updates a balance twice while T2, at repeatable read, keeps reading
-- @sessions T1 T2
-- @each xids heap(accounts) btree(accounts_pkey)

-- @setup
CREATE TABLE accounts (id int PRIMARY KEY, owner text NOT NULL, balance numeric(12,2) NOT NULL);
INSERT INTO accounts VALUES (1, 'alice', 100.00), (2, 'bob', 100.00);
VACUUM accounts;

-- @step T2 "T2 opens a repeatable read transaction. no snapshot yet: BEGIN doesn't take one."
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- @step T1 blocks "T1 wants the same row, and waits."
UPDATE accounts SET balance = balance + 10 WHERE id = 1;
```

- header: `@title`, `@sessions T1 T2`, `@session T2 deadlock_timeout=10ms`, `@server k=v`, `@db shop` (load a dataset exactly like the site does), `@ext`, `@checksums`, `@each <probes>`, `@setup`.
- steps: `@step T1 [blocks] [errors=40001] [+probe] [-probe] "note"`, `@step obs "note"` (the observer: VACUUM, CHECKPOINT, a pageinspect query), `@explain T1 [noanalyze]`, `@stages T1` with `-- @stage FROM "note"` blocks (add `group=<col>` to tint runs of equal values), `@probe`, `@crash`, `@restart +log`.
- probes (always captured in this order): `xids locks buffers wal heap(rel) btree(idx) hash(idx) vm(rel) fsm(rel) rows(rel) stats log`.
- a step that blocks or errors must say so (`blocks`, `errors=40001`), and one that says so must do it, or the run fails. that's how the trace stays honest.
- notes are one lowercase sentence each. they become the figure's narration.

```bash
pnpm pgtrace content/mvcc/traces/update-twice.scenario.sql --twice   # writes update-twice.pgtrace.json, fails if two runs differ
pnpm pgtrace content/mvcc --check                                     # re-run and compare with the committed json
```

then import the json in the chapter and hand it to a primitive: `import trace from "./traces/update-twice.pgtrace.json"` and `<VersionChain trace={trace} />` or `<PgStepper trace={trace} panels={["lanes", "page:accounts"]} />`. keep traces small (one or two tiny tables, only the probes you need): `pnpm check` warns above 60 KB.

single-session captures that should match the browser exactly can run on PGlite with `--engine=pglite`. it does what the browser does (seed the dataset, snapshot, open a fresh instance from the snapshot), so oids, checksums and the cold buffer pool match a runnable block. a scenario that stops making progress fails after 180 s with "the engine stalled, run it again" (`PGTRACE_STALL_MS` to tune); run it again. the starter traces are in `content/mvcc/traces/`, `content/transactions/traces/` (lost update in four variants, deadlock) and `content/wal/traces/` (crash recovery).

---

## bespoke figures

the primitives cover a lot. flagship ideas sometimes need their own component. build them in `src/components/figures/<part>/Name.tsx`, on top of the kit (`@/components/figures/kit`) and the primitives (`@/components/db/<File>`, never the index).

rules:

- `"use client"` if it's interactive. import the stepper with `import { useStepper, StepControls } from "@/components/viz/stepper"` (never from `@/components/viz`, that pulls in server code).
- **props must be serialisable.** mdx renders on the server: pass data, not functions. behaviour that depends on an option becomes a data map keyed by the option.
- **colour only from tokens.** css variables `--bg --ink --hi --mute --faint --line --line-2 --well --well-2 --accent` and the five semantic ones; tailwind classes exist for all of them. the default tailwind palette is off on purpose.
- **semantic colours mean one thing, always** (the full map is in DESIGN.md): `ref` = an address or pointer (ctid, index entry → row, child and sibling links, cursors). `live` = visible, matching, committed, durable, correct. `dead` = dead tuples, aborted versions, anomalies, errors, deadlock cycles, bad plans. `meta` = machinery (page and tuple headers, infomask, snapshots, the lock manager, the catalog, WAL headers). `hot` = look here (the current step, row or operator, the record just appended, buffer reads). a **dirty page is not a bug**: it's `accent`, never `dead`. waiting and in-progress are dashed and mute. never colour-code sessions.
- **provenance.** a figure that says what postgres does draws a captured trace, or a simulator that's tested against one, and shows `<Provenance />`. hand-drawn data is only for textbook material and "the standard allows".
- **type:** prose is Crimson Pro, headings Cormorant Garamond, figures JetBrains Mono. narration under a figure is serif. sizes `text-11 … text-18`.
- **controls:** config rows (`key =` in `text-faint`), options as `.word` buttons with `aria-pressed`, actions as `.act` / `.act.solid`, sliders `input[type=range].slider`. name actions as verbs ("run the update", "fill until it splits").
- **frames:** wells with inset hairlines, `rounded-md` inside a figure. no heavy shadows, no gradients, no glow.
- **motion:** only to explain, under ~300ms for ui state, `ease-sfe`. respect `prefers-reduced-motion` (jump to the end state, never autoplay).
- **size:** 360px to ~900px. test both.
- **a11y:** real buttons, `role="img"` + `aria-label` on svgs, `aria-live` narration, never meaning by colour alone.
- **no new dependencies.**

---

## correctness

- run every sql block: `pnpm sql-check content/<part>`. it uses the same PGlite the page uses, so what the golden says is what the reader gets.
- internals claims (page layouts, xmin and xmax, lock modes, WAL records, plans with buffers) come from goldens or pgtrace captures. if you can't capture it, say it's the textbook model.
- version facts: when a feature landed, what changed. check the release notes (https://www.postgresql.org/docs/release/) and, for the standard, https://www.postgresql.org/docs/current/features.html. don't trust memory for anything after postgres 15.
- other engines (mysql, sqlite, duckdb, oracle): only recorded output with the version named, or a citation.
- books, course slides and the manual: refer and **paraphrase**. never reproduce their text.
- when the honest answer is "it depends", say what it depends on.

### lessons from the reference chapters

- **clause stages** (for ClauseStepper): capture them on the browser engine so they match the runnable block exactly: `-- @engine pglite`, `-- @db shop`, explicit `-- @stage FROM "note"` blocks. give every stage a full `ORDER BY`, put the rows a clause removes where the stepper shows them (inside `maxRows`), keep stage columns narrow and the filtered columns first. a stage file over 60 KB means the columns are too wide.
- **figures that only read capture data are server components**, so the json isn't shipped to the browser twice. pass a client figure only the slice it needs.
- **predict options fit on a phone:** under ~30 characters each.
- **captions name sizes and things, not directions.** figures stack on phones, so "the left table" can be the top one.
- **`EXPLAIN (COSTS OFF)`** when the point is a node or `actual rows`: long cost lines get cut off at 880px. keep costs when the chapter is about costs.

- **wide content inside `<Slides>` or a grid:** wrap it in `w-0 min-w-full` so it scrolls inside its frame instead of widening the page.
- **psql transcripts** are recorded from a real psql 18.6 through a pty, against a throwaway server (`startCluster` from `scripts/lib/native-pg.mjs`). `\set VERBOSITY verbose` shows an error's LOCATION.
- **version facts offline:** Postgres.app ships the postgres 18 docs (under `/Applications/Postgres.app/Contents/Versions/18/share/doc`). still cite postgresql.org links in the page.
- **`--engine=native` checks `run` blocks too.** a block whose whole point is that the browser and a server differ will warn there; that's expected, say so in your report.
- **collation:** the browser's database is `datcollate = C`, `datctype = C.UTF-8` (byte-order sorting, but `upper()` and ILIKE know ë). native captures use C / C. PGlite lists ICU collations, but nondeterministic ones (e.g. `und-u-ks-level2`) still compare case-sensitively and `en_US` sorts like C, so case-insensitive and language-sort demos must be `native`.

### internals in the lab engine

the browser engine is one session with nothing else running, which changes a few things internals chapters run into:

- **the next read can prune.** with no other session looking, an old version on a nearly full page is pruned by the very next statement that touches the page. inspect it with `get_raw_page` / `heap_page_items` before re-reading the row, or use `UPDATE … RETURNING` to see both sides at once.
- **`EXPLAIN ANALYZE` really runs the statement.** it creates versions and uses xids, and later blocks in the same session see that.
- **checksums are on**, so the first read after a dataset's `CHECKPOINT` can write `FPI_FOR_HINT` records. WAL measured in a session's first statement is noisy: measure from the second.
- **cross-check internals chapters on a real server:** `pnpm sql-check --engine=native content/<part>/<chapter>.mdx` runs every block on a throwaway postgres 18.6 and tells you which numbers depend on the engine (usually only xids). say so in one line when it matters.
- **when a figure must match a runnable block exactly**, capture it on the same engine: `pgtrace --engine=pglite` with `-- @db <name>`.

- **oids in the browser:** the first object a browser block creates gets oid 24576 (a fresh instance restored from the dataset snapshot). don't promise a specific oid in prose; read it from the golden.
- **`pg_stat_io` on PGlite:** call `pg_stat_force_next_flush()` and run one statement before `pg_stat_reset_shared('io')`, or older counters leak into the numbers.
- **ring buffers never kick in in the browser** (its pool is 128 MB). ring and eviction demos need a native capture with a small `shared_buffers` (`-- @server shared_buffers=2MB`).
- **measured numbers** (timings on this machine, not from postgres) get `<Provenance measured="on this mac (m4 pro), ... see the deep below" />`, the machine and method named.

- **VACUUM VERBOSE in a trace:** `-- @server log_min_messages=info` and a `+log` step. arrange for the vacuumed pages to be dirty already, so its read/write rate is 0 and `--twice` stays stable.
- **`pg_stat_activity` and `pg_buffercache` in run blocks:** filter by `reldatabase` and backend state, because a native server has several databases and backends. in the browser, a session's own pg_stat_activity row is always "active", and there's only a "standalone backend".
- **notices:** a pgtrace step result has no notices; capture them with the log probe.
- **numbers from traces into prose:** an MDX `export const` with small helpers over `@/lib/db/captured` keeps prose numbers tied to the capture.
- **small captures:** `-- @each` with no probes, then `+xids` / `-heap` per step, keeps a multi-session trace under 60 KB. an `obs` step can separate rounds of one scenario (one isolation level per round).
- **`@crash` after `@setup`:** add an `obs CHECKPOINT` before the crash, or the WAL parse after the crash can fail on relations it hasn't seen.
- **error DETAIL lines** in captures name sessions (T1, T2), not pids, because pgtrace normalises them. say so once in the prose when you quote one.
- **lane snapshots under READ COMMITTED:** the xids probe takes a fresh `pg_current_snapshot()` at probe time, so an RC lane's snapshot can move before the session reads anything. word captions to match.
- **EXPLAIN on 18:** `EXPLAIN ANALYZE` prints `Planning: Buffers` even with `SUMMARY OFF`, and plain EXPLAIN prints `Disabled: true` on nodes once an `enable_*` setting is off. `Index Searches` isn't one per distinct value: a new descent happens only when the next value is on another leaf page. PlanTree prints the runtime lines (Heap Blocks, Sort Method with Memory or Disk, hash Buckets/Batches, HashAggregate Batches/Disk Usage, Memoize Hits/Misses) the way text EXPLAIN does.
- **`@explain` can't take a SET:** put the SET in the `@step` before it. `@explain noanalyze` still plans the query, so it calls STABLE and IMMUTABLE functions and moves any counter you read after it: capture counts before the explain step.
- **tricks that worked:** `WITH (fillfactor = 10)` gives a tiny btree several leaf pages for a figure. `set_config('my.lsn', pg_current_wal_insert_lsn()::text, false)` marks a WAL position without writing WAL. EXPLAIN inside a plpgsql function captures a forced-plan sweep in one step. sort RETURNING rows with `WITH x AS (… RETURNING …) SELECT … ORDER BY`.
- **inlining:** a scalar `LANGUAGE sql` function declared VOLATILE is still inlined. VOLATILE only blocks inlining of set-returning functions in FROM. what blocks scalar inlining: SECURITY DEFINER, SET clauses, a body more volatile than its declaration, non-sql languages.
- **native files and transcripts:** a native block that needs a server-side file can write one with `format('COPY … TO %L', current_setting('data_directory') || '/x.csv')`. record psql through a pty with `-P pager=off` and a wide terminal.
- **MDX:** braces in prose break the parse (`'{steel}'`); put them in backticks. `pnpm check` shows the real parse error when `sql-check` only says "crashed".
- **Bars at 390px:** keep labels under about 24 characters, or the bar column collapses.
- **oids in figures:** when a figure must show the same oids as the run blocks, read them from the chapter's own `.golden.json` (an MDX file can import it), not from a trace.
- **parallel captures:** aggregate to one row per process, or use count(*), because per-worker group counts vary from run to run. `+log` on the SET step keeps `debug_print_*` noise out of the next step.
- **PGlite is 32-bit:** it reports `typbyval = f` for int8 and timestamptz, unlike a 64-bit server. don't show that column.
- **shared pieces added in fix pass 4:** `cmpKey` in `@/lib/db/keys` (composite and text keys compare column by column; BTree highlights ranges with it and folds itself to fit, so `collapse`/`pageCollapse` are rarely needed). `<SessionLanes provenance=… sideTitle=…>`, and obs steps (VACUUM, CHECKPOINT) now get their own row. `<XidChip multi>` draws a MultiXact xmax as "multi N". `<Provenance recorded="psql 18.6 through a pty" />` for transcripts. ClauseStepper shows a new table when a stage brings rows the last one didn't (iterations); `drop: []` forces it; stage headers carry column types. PlanTree prints fractional per-loop rows and Gather's Workers Planned/Launched. `--check` and `--twice` ignore VACUUM VERBOSE rates and the system usage line.
- **more MDX traps:** `<@` in prose, and `@>` inside JSX captions, break the parse. backtick them.
- **per-setting captures:** a pgtrace step `SET x; SELECT …` keeps the SELECT's result, which makes a RunPick per setting easy. use `md5(n)::uuid` as a deterministic stand-in for random uuids.
- **ctype:** native clusters are C ctype, so `lower()`, `upper()` and citext fold only ASCII there; the browser is C.UTF-8 and folds ë. locale-named native goldens (de_DE, en_GB, ICU) depend on the machine's locales.
- **ArrayViz** numbers from 0: for 1-based postgres arrays use `indices={false}` plus pointers.
- **Tree syntax:** tone tags go before the note: `label #hot // note`. after `//` they print literally.
- **`Disabled: true`** (18) isn't drawn by PlanTree yet: use a text plan where the point is a disabled node.
- **unmaskable output:** ANALYZE VERBOSE rates and auto_explain durations can't be golden'd. use a recorded transcript with `<Provenance recorded=… />`.
- **cluster-wide settings leak natively:** tablespace options, roles and databases outlive a block on a native server. reset or drop them in the same block.
- **native-only extensions in captures:** `-- @server shared_preload_libraries=pg_stat_statements pg_stat_statements.track=all` works in pgtrace.
- **BRIN "actual rows"** is 10 × the pages marked, not a count. `pg_stats.correlation` and other sampled stats move between runs on tables over 30k rows: `ALTER TABLE … ALTER COLUMN … SET STATISTICS 10000` makes them exact.
- **one implicit transaction:** a multi-statement `db.exec` in a scratch script runs as one transaction, so nothing gets pruned (bottom-up deletion never fires). split statements the way sql-check does.
- **random index builds** (HNSW, IVFFlat) differ per run: mark them `volatile` and pull prose numbers from the golden through exports.
- **an MDX export that throws hides the whole chapter** ("this chapter is still being drawn"), and `pnpm check` still passes. restart `next dev` after fixing it; webpack keeps serving the failed module.
- **MDX allows only `export const`**, not a bare `const`. with `errors=continue`, add `expect=error` only when the last statement fails.
- **roles are cluster-wide:** keep role names unique across a part, or the native check collides. `SHOW search_path` says `public` in PGlite and `"$user", public` natively: use `current_schemas(true)`.
- **RESTRICT fails with 23001** on 18 (not 23503). Bars animate in on scroll, so clipped screenshots of them can look empty.
- **pg_walinspect stops at the flush pointer:** inside an open transaction or a plpgsql function, measure with `set_config` marks across autocommit statements. never-hinted pages log their FPI as `XLOG FPI_FOR_HINT`: run a SELECT before CHECKPOINT when measuring FPIs, and filter by relation with `pg_get_wal_block_info` (`block_fpi_length`).
- **PGlite WAL limits:** pglz only (no lz4/zstd), `full_page_writes` can't be reloaded, `wal_level=replica` (no logical decoding). `pg_buffercache_evict()` reports `buffer_flushed = f` even when it flushed (18.6, native too): show `buffer_evicted` only.
- **recorded native clusters on macOS:** socket paths are limited to 103 bytes, so put socket dirs in /tmp; reset the server log between runs; a hung sync-rep wait needs `pg_cancel_backend`.
- **lock_timeout in a capture:** give it about 2 s (the 500 ms block window plus the next steps' send) and an `obs SELECT pg_sleep(…)` step so the error lands in `woke`. a locks probe right after a COMMIT that wakes a chain can race: `-locks` on that step.
- **pids in obs queries:** map them to sessions with `pg_stat_activity.application_name` (pgtrace sets T1, T2…). `@session Tn log_lock_waits=on` keeps log lines from interleaving.
- **"which lock does X take" in the browser:** a plpgsql helper that runs the statement in a subtransaction, reads pg_locks, then raises, gives a runnable block (see content/locking/table-lock-modes).
- **waits on a prepared transaction:** pgtrace can't see the blocker (it has no pid). use `lock_timeout` with `errors=55P03`. before `@crash`, an `obs CHECKPOINT` also keeps the trace small, because the crash records WAL and buffers (one trace went from 372 KB to 12 KB).
- **code fences don't interpolate in MDX:** for text built from data, use `<SqlPanel code={…} lang="text" />`. `pg_last_wal_replay_lsn()` is non-NULL in PGlite, NULL on a cleanly started native primary.
- **inks without meaning:** for figures with no state to colour, use `hi`, `mute`, `line-2`, never a semantic colour.
- **playwright:** `ElementHandle.click(selector)` ignores the selector and clicks the element's centre; locate first, then click.
- **shared pieces added in fix pass 5:** `<ArrayViz base={1}>` for 1-based arrays. a RunPick run can carry `tone`. `<Provenance />` is global in MDX. PlanTree marks `Disabled: true` nodes, prints "Subplans Removed", and shows "never executed" for loops=0. traceLanes draws `@crash`/`@restart` as "server" rows. a ResultTable "QUERY PLAN" column keeps its indentation. BTree `path` is a walk (descent, then sibling links). a chapter that fails to compile or evaluate now shows the dev error overlay and fails the build. native and pgtrace report txn state `E` after a failed statement inside BEGIN.
- **which block an FPI belongs to:** an obs step with `pg_get_wal_block_info` between two LSNs. a visibility-map page is logged whole (8,192 bytes), which is most of a first heap INSERT record after a checkpoint.
- **clipped screenshots:** `boundingBox()` is viewport-relative, so add `scrollY` when clipping a full-page shot.
- **PgStepper `page:<rel>:<blk>`** draws a block other than 0. pglite captures give the same oids as run blocks (customers 16385), pinned by `pgtrace-oids.test.ts`.
- **plans with a SubPlan, InitPlan or CTE scan:** PlanTree labels them, and shows each "Rows Removed by …" under its own name.
- **after anyone changes `tools/pgtrace`, re-capture** your scenarios with `--twice`, and run `pnpm pgtrace <part> --check` after pulling.
- `only the first block of a session may set db` applies to every block after the first in that session: set `db`, `ext` and `setup` once, on the first block.

- **let postgres say which rows fed a window:** `array_agg(id) OVER w` (or `lag(id)`) in the capture, rather than working frames out in js. the analytics WindowFrame figure is built this way.
- **custom stage names** (`-- @stage anchor`, `-- @stage "iteration 1"`) work; ClauseStepper just lights no clause for them. postgres's recursive working table can't be captured directly, so recursive-ctes captures each round as the full query `WHERE depth = n`.
- **small sql facts that bite:** GROUPING() doesn't take SELECT aliases (group a subquery's columns). `generate_series(date, date, interval)` returns timestamptz, so cast back with `::date`. the EXPLAIN `Window:` line drops DESC even when the Sort Key has it (same on native 18.6).
- **ties:** the ORDER BY lint only checks that one is there. row_number over tied keys can differ between engines even when PGlite is stable, so add a tiebreaker unless the nondeterminism is the point.
- **ClauseStepper tables:** keep stage tables to about 12 rows. a table with `maxRows` shows at most that many struck rows, then "… N more removed", so put the removals you want seen first.
- **pgtrace step notes become narration** in steppers and captured switches, so write them as full lowercase sentences, not labels.
- **`unordered` is fine on purpose** when the point is a partial order: ties, `LIMIT` without `ORDER BY`. say so in the prose.

## checks before you're done

```bash
pnpm check <part>                                       # compiles every chapter, lints voice, imports, slugs and goldens
pnpm sql-check --update content/<part>/<chapter>.mdx    # then read the golden diff
pnpm sql-check content/<part>                           # every block matches its golden
pnpm pgtrace content/<part> --check                     # if you added scenarios
pnpm typecheck                                          # if you wrote figures
```

then look at it. `pnpm dev:poll -p 3123` serves it at `http://localhost:3123/learn/<part>/<chapter>`. press **run** on a few blocks: each should say "same as postgres 18.6 output". check it at 1440px and 390px wide, paper and night (`t` toggles the theme). paper is the default, so judge it there first.
