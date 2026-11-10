// the whole book, in order. this file is the single source of truth for the
// sidebar, the map, prev/next and every chapter address.
//
// a chapter lives at content/<part>/<chapter>.mdx and is served at /learn/<part>/<chapter>.
// its address (the breadcrumb) is everything.<part>.<chapter> in snake_case: database.schema.table.

export type Chapter = {
  slug: string;
  title: string;
  /** one line, lowercase, what you'll get out of it */
  blurb: string;
  /** postgres major that shipped this chapter's main feature, only when newer than the oldest supported major */
  since?: number;
  /** lands in the next postgres major, so it can't run on the 18.6 in this page */
  preview?: boolean;
};

export type Part = {
  slug: string;
  n: number;
  title: string;
  blurb: string;
  /** which tiny animated glyph represents this part on the map */
  glyph: Glyph;
  chapters: Chapter[];
};

export type Glyph =
  | "cylinder"
  | "grid"
  | "laces"
  | "frame"
  | "caret"
  | "shapes"
  | "schema"
  | "tabs"
  | "plan"
  | "scales"
  | "lanes"
  | "page"
  | "tree"
  | "ghosts"
  | "padlock"
  | "tape"
  | "shards"
  | "magnifier";

export const parts: Part[] = [
  {
    slug: "start",
    n: 1,
    title: "start here",
    blurb: "what a database actually is, the real postgres running in this page, and your first query.",
    glyph: "cylinder",
    chapters: [
      { slug: "what-is-a-database", title: "what a database actually is", blurb: "files you could write yourself, plus the four things you'd get wrong: crashes, concurrency, queries and rules." },
      { slug: "relational-model", title: "the relational model", blurb: "everything is a table, even the answer. codd's idea, and why it beat everything before it." },
      { slug: "postgres-in-your-browser", title: "postgres in your browser", blurb: "a real postgres 18 compiled to webassembly runs every query here. what it can do, and the short list of what it can't." },
      { slug: "first-query", title: "your first query", blurb: "SELECT, FROM, a semicolon. what the result grid is telling you, and why you said what, not how." },
      { slug: "psql", title: "psql and a real server", blurb: "installing postgres 18, the backslash commands worth knowing, and \\x for rows too wide to read." },
      { slug: "reading-errors", title: "reading an error", blurb: "ERROR, the caret, DETAIL, HINT and the five-character SQLSTATE. postgres errors say more than they look." },
      { slug: "sql-and-its-dialects", title: "SQL and its dialects", blurb: "one standard, many accents. what's portable across postgres, mysql and sqlite, and how this book marks what isn't." },
    ],
  },
  {
    slug: "basics",
    n: 2,
    title: "one table",
    blurb: "SELECT, WHERE, NULL, ORDER BY and GROUP BY. everything you can ask of a single table.",
    glyph: "grid",
    chapters: [
      { slug: "select-and-expressions", title: "picking columns", blurb: "columns, expressions, aliases, built-in functions, and when SELECT * stops being harmless." },
      { slug: "filtering-rows", title: "filtering with WHERE", blurb: "comparisons, AND, OR, NOT, BETWEEN and IN. and the missing parentheses around an OR." },
      { slug: "null-and-three-valued-logic", title: "NULL and three-valued logic", blurb: "true, false and unknown. why NULL = NULL isn't true, and how WHERE quietly drops rows." }, // flagship
      { slug: "order-by", title: "sorting with ORDER BY", blurb: "ASC, DESC, NULLS FIRST, and why a table has no order until you ask for one." },
      { slug: "limit-and-offset", title: "LIMIT, OFFSET and FETCH FIRST", blurb: "the first n rows, WITH TIES, and why LIMIT without ORDER BY is a coin toss." },
      { slug: "distinct-rows", title: "DISTINCT and DISTINCT ON", blurb: "throwing away duplicates, and postgres's keep-one-row-per-group trick." },
      { slug: "case-expressions", title: "CASE, COALESCE and NULLIF", blurb: "if/else inside an expression, and the two shortcuts you'll type every week." },
      { slug: "pattern-matching", title: "LIKE, ILIKE and regular expressions", blurb: "wildcards, escapes, ~ and ~*. and the case-sensitivity surprise in the C collation." },
      { slug: "logical-order", title: "the order a query actually runs in", blurb: "FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY, LIMIT. the most important picture in SQL." }, // flagship
      { slug: "aggregates", title: "aggregate functions", blurb: "count(*), count(col) and count(DISTINCT col) count three different things." },
      { slug: "group-by", title: "GROUP BY", blurb: "rows into buckets, one answer per bucket. why every selected column must be grouped or aggregated." }, // flagship
      { slug: "having-clause", title: "HAVING", blurb: "WHERE for groups. the filter that runs after aggregation, and the one that should have been a WHERE." },
    ],
  },
  {
    slug: "joins",
    n: 3,
    title: "joins and subqueries",
    blurb: "putting tables back together. every join, semi and anti joins, subqueries, set operations and CTEs.",
    glyph: "laces",
    chapters: [
      { slug: "joins-in-one-picture", title: "joins, in one picture", blurb: "a join is a filtered cross product. why the venn diagram lies to you." }, // flagship
      { slug: "inner-join", title: "INNER JOIN", blurb: "matching rows across tables, ON vs USING vs NATURAL, and joining three tables in a row." },
      { slug: "outer-joins", title: "LEFT, RIGHT and FULL joins", blurb: "keep the rows that didn't match, padded with NULLs. and the WHERE that turns them back into inner joins." },
      { slug: "self-and-cross-joins", title: "self joins and CROSS JOIN", blurb: "a table joined to itself to find each employee's manager, and every pair of rows on purpose." },
      { slug: "fan-out", title: "join fan-out", blurb: "two one-to-many joins and your totals triple. aggregate first, then join." },
      { slug: "subqueries", title: "subqueries", blurb: "a query wherever a value or a table can go. scalar, table and correlated subqueries." },
      { slug: "exists-semi-anti", title: "EXISTS, semi joins and anti joins", blurb: "is there a match? the join that never duplicates, the one that keeps only the lonely rows, and relational division." },
      { slug: "not-in-trap", title: "the NOT IN trap", blurb: "one NULL in the list and NOT IN returns nothing at all. NOT EXISTS doesn't care." },
      { slug: "lateral-joins", title: "LATERAL joins", blurb: "a subquery that can see the row to its left. the latest three orders per customer, in one join." },
      { slug: "set-operations", title: "UNION, INTERSECT and EXCEPT", blurb: "stacking results instead of joining them. and why UNION ALL is usually what you meant." },
      { slug: "ctes", title: "WITH and CTEs", blurb: "naming a subquery so you can read your own query. inlined by default, MATERIALIZED when you ask." },
    ],
  },
  {
    slug: "analytics",
    n: 4,
    title: "windows, grouping and recursion",
    blurb: "the queries that make spreadsheets jealous. window functions, grouping sets and recursive CTEs.",
    glyph: "frame",
    chapters: [
      { slug: "filter-and-pivots", title: "FILTER and pivoting", blurb: "count(*) FILTER (WHERE ...), the SUM(CASE ...) it replaced, and rows turned into columns." },
      { slug: "grouping-sets", title: "ROLLUP, CUBE and GROUPING SETS", blurb: "subtotals and a grand total in one query, and GROUPING() to tell their NULLs from yours." },
      { slug: "ordered-set-aggregates", title: "percentiles, medians and string_agg", blurb: "aggregates that care about order: WITHIN GROUP, percentile_cont vs percentile_disc, and ordered string_agg." },
      { slug: "window-functions", title: "window functions", blurb: "aggregates that don't collapse rows. OVER, PARTITION BY, and where windows sit in the logical order." },
      { slug: "ranking", title: "row_number, rank and dense_rank", blurb: "three ways to number rows. they only disagree on ties, which is exactly when it matters." },
      { slug: "lag-and-lead", title: "LAG, LEAD and running totals", blurb: "the previous row, the next row, and a sum of every row so far." },
      { slug: "window-frames", title: "window frames", blurb: "ROWS, RANGE and GROUPS. the default frame that makes last_value look broken." }, // flagship
      { slug: "top-n-per-group", title: "top n per group", blurb: "the three best sellers in every category: row_number, LATERAL and DISTINCT ON, compared on one plan." },
      { slug: "gaps-and-islands", title: "gaps and islands", blurb: "streaks, sessions and missing days. the row_number subtraction trick, stepped through." },
      { slug: "recursive-ctes", title: "recursive CTEs", blurb: "a query that feeds on its own output. walking an org chart, depth first or breadth first, with CYCLE for loops." },
      { slug: "generate-series", title: "generate_series and calendars", blurb: "rows from nothing: date spines, filling gaps with zeros, and fake data that's the same every run." },
    ],
  },
  {
    slug: "writes",
    n: 5,
    title: "changing data",
    blurb: "INSERT, UPDATE, DELETE, upserts, MERGE, bulk loads, and code that runs inside the database.",
    glyph: "caret",
    chapters: [
      { slug: "insert", title: "INSERT", blurb: "one row, many rows, INSERT ... SELECT, DEFAULT, and your first CREATE TABLE." },
      { slug: "update-and-delete", title: "UPDATE and DELETE", blurb: "the WHERE you forgot, UPDATE ... FROM, DELETE ... USING, and TRUNCATE." },
      { slug: "returning-old-and-new", title: "RETURNING, with OLD and NEW", blurb: "get back the rows you changed, and since postgres 18, what they looked like before.", since: 18 },
      { slug: "upsert", title: "INSERT ... ON CONFLICT", blurb: "insert or update in one statement. EXCLUDED, the arbiter index, and two sessions racing for the same key." },
      { slug: "merge", title: "MERGE", blurb: "the standard's way to sync one table into another. WHEN MATCHED, NOT MATCHED BY SOURCE, and RETURNING." },
      { slug: "copy-and-bulk-loads", title: "COPY and bulk loading", blurb: "why one COPY beats 10,000 INSERTs, and what to drop before a big load." },
      { slug: "parameters-and-injection", title: "parameters, not string glue", blurb: "type ' OR 1=1 -- into a login form and watch it become code. bound parameters and prepared statements." }, // flagship
      { slug: "sql-functions", title: "writing functions in SQL", blurb: "CREATE FUNCTION in plain SQL, IMMUTABLE vs STABLE vs VOLATILE, and when postgres inlines your function." },
      { slug: "plpgsql", title: "PL/pgSQL and procedures", blurb: "variables, loops and exceptions inside the database, CALL with COMMIT, and when to keep logic in the app." },
      { slug: "triggers", title: "triggers", blurb: "code that runs on every INSERT, UPDATE or DELETE. BEFORE vs AFTER, row vs statement, and an audit table." },
    ],
  },
  {
    slug: "types",
    n: 6,
    title: "types and values",
    blurb: "numbers, text, time, json, arrays and ranges. picking the type is half the schema.",
    glyph: "shapes",
    chapters: [
      { slug: "types-and-casts", title: "types and casts", blurb: "every value has a type. ::, implicit casts, and why '1' + 1 works but 1 || 1 doesn't." },
      { slug: "numbers", title: "integers, numeric and floats", blurb: "int vs bigint, numeric for money, and 0.1 + 0.2 in float8 vs numeric." },
      { slug: "text-and-collation", title: "text, varchar and collations", blurb: "why varchar(255) is a habit from another database, and why 'B' sorts before 'a' here." },
      { slug: "dates-and-intervals", title: "dates, times and intervals", blurb: "date arithmetic, interval math across month ends, and date_trunc for grouping by week." },
      { slug: "timestamptz", title: "timestamptz and time zones", blurb: "it stores an instant, not a zone. and the hour in march that never happened." },
      { slug: "booleans-enums-domains", title: "booleans, enums and domains", blurb: "a boolean with three values, enums you can grow but not shrink, and domains as reusable rules." },
      { slug: "identity-and-uuids", title: "identity columns and uuids", blurb: "why serial is legacy, GENERATED AS IDENTITY, and uuidv7 keys that sort by time." },
      { slug: "arrays", title: "arrays", blurb: "a list in a column. ANY, unnest, @>, and the day it should have been a table." },
      { slug: "jsonb", title: "json and jsonb", blurb: "a document in a column. ->, ->>, @>, jsonpath, JSON_TABLE, and why jsonb won." },
      { slug: "ranges", title: "range types", blurb: "a start and an end as one value. overlaps with &&, empty ranges, and multiranges." },
      { slug: "generated-columns", title: "generated columns", blurb: "columns computed from other columns. stored vs virtual, and why postgres 18 made virtual the default." },
    ],
  },
  {
    slug: "design",
    n: 7,
    title: "schema design",
    blurb: "keys, constraints, normal forms, and the patterns that keep data honest as it grows.",
    glyph: "schema",
    chapters: [
      { slug: "er-modeling", title: "from requirements to tables", blurb: "entities, relationships, one-to-many and many-to-many. drawing the shop before creating it." },
      { slug: "keys", title: "primary keys, natural and surrogate", blurb: "what makes a row itself. composite keys, and the email address that changed." },
      { slug: "constraints", title: "NOT NULL, CHECK and UNIQUE", blurb: "rules the database enforces so your app doesn't have to remember, plus NULLS NOT DISTINCT." },
      { slug: "foreign-keys", title: "foreign keys", blurb: "references between tables. CASCADE, SET NULL, DEFERRABLE, and the index postgres doesn't create for you." },
      { slug: "functional-dependencies", title: "functional dependencies", blurb: "what determines what. the bit of math that decides your keys and your normal forms." },
      { slug: "normal-forms", title: "normal forms, 1NF to BCNF", blurb: "one fact, one place. update, insert and delete anomalies, and the decomposition that cures them." }, // flagship
      { slug: "denormalization", title: "denormalizing on purpose", blurb: "counters, snapshots and copies you choose to keep, and the trigger that keeps them honest." },
      { slug: "hierarchies", title: "storing trees", blurb: "adjacency list, ltree paths, closure tables. pick the shape by the queries you'll run." },
      { slug: "history-and-soft-delete", title: "history, audit and soft delete", blurb: "deleted_at, history tables, and what 'as of last tuesday' costs you." },
      { slug: "temporal-keys", title: "time ranges and temporal keys", blurb: "exclusion constraints for no double booking, and WITHOUT OVERLAPS on primary and foreign keys.", since: 18 },
      { slug: "anti-patterns", title: "schema anti-patterns", blurb: "entity-attribute-value, polymorphic foreign keys, comma lists in a column, and the table called data." },
      { slug: "views", title: "views and materialized views", blurb: "named queries, updatable views, and a cached result you refresh yourself." },
      { slug: "schemas-roles-and-rls", title: "schemas, roles and row-level security", blurb: "search_path, GRANT, and policies that filter rows per tenant without a single WHERE." },
    ],
  },
  {
    slug: "indexes",
    n: 8,
    title: "indexes, from the outside",
    blurb: "what an index is for, which queries it can help, and what it costs on every write.",
    glyph: "tabs",
    chapters: [
      { slug: "what-an-index-is", title: "what an index actually is", blurb: "a sorted copy of a few columns with an address back to each row. the back of a textbook, for tables." },
      { slug: "index-or-scan", title: "when postgres uses an index", blurb: "slide the selectivity and watch the plan flip. random reads lose past a few percent." }, // flagship
      { slug: "composite-indexes", title: "multicolumn indexes", blurb: "column order is everything. the leftmost prefix, equality first, range last." }, // flagship
      { slug: "skip-scan", title: "skip scan", blurb: "postgres 18 can use an index on (a, b) for WHERE b = 5. how it hops, and when it can't.", since: 18 },
      { slug: "index-only-scans", title: "index-only scans and INCLUDE", blurb: "answering from the index alone, the visibility map that makes it legal, and Heap Fetches: 0." }, // flagship
      { slug: "partial-and-expression", title: "partial and expression indexes", blurb: "index only the rows you query, or lower(email) instead of email." },
      { slug: "indexes-and-order-by", title: "indexes for ORDER BY and LIMIT", blurb: "a sorted index means no sort node. the top 10 rows in three page reads." },
      { slug: "keyset-pagination", title: "keyset pagination", blurb: "OFFSET 100000 reads 100,000 rows to throw them away. WHERE (a, b) > (x, y) doesn't." },
      { slug: "index-not-used", title: "why isn't my index used?", blurb: "a function on the column, a type mismatch, a leading wildcard, an OR, too many matches. a checklist." },
      { slug: "index-costs", title: "what indexes cost", blurb: "every index is another write, more WAL and fewer HOT updates. finding the ones nobody uses." },
      { slug: "index-types", title: "hash, GIN, GiST and BRIN, from the outside", blurb: "which index type serves which operator, in one table you'll come back to." },
      { slug: "text-search", title: "full-text and fuzzy search", blurb: "tsvector, tsquery, ranking, pg_trgm for LIKE '%foo%', and the GIN index behind both." },
    ],
  },
  {
    slug: "execution",
    n: 9,
    title: "how a query runs",
    blurb: "parse, plan, execute. EXPLAIN, scans, joins, sorts, and the iterator that pulls one row at a time.",
    glyph: "plan",
    chapters: [
      { slug: "relational-algebra", title: "relational algebra", blurb: "selection, projection, join and friends. the handful of operators every query compiles down to." },
      { slug: "query-lifecycle", title: "the life of a query", blurb: "parser, analyzer, rewriter, planner, executor. one query watched at every stage." },
      { slug: "system-catalog", title: "the system catalog", blurb: "pg_class, pg_attribute, pg_type. the tables that describe your tables, and how names become numbers." },
      { slug: "reading-explain", title: "reading EXPLAIN", blurb: "a tree you read from the inside out. cost, rows, width, and what each number actually means." }, // flagship
      { slug: "explain-analyze", title: "EXPLAIN ANALYZE and BUFFERS", blurb: "estimates next to actuals, loops, shared hit vs read, and the Index Searches line new in postgres 18." },
      { slug: "iterator-model", title: "the executor and the iterator model", blurb: "every plan node answers one question: next row, please? press next() and watch one row climb." }, // flagship
      { slug: "scans", title: "seq scans, index scans and bitmap scans", blurb: "three ways to read a table, and the bitmap that turns random reads back into sequential ones." },
      { slug: "nested-loop-join", title: "nested loop joins", blurb: "for each outer row, look for matches. dumb, and perfect when one side is tiny. plus Memoize." },
      { slug: "hash-join", title: "hash joins", blurb: "build a hash table on the small side, probe it with the big one. and what happens when it doesn't fit." }, // flagship
      { slug: "merge-join", title: "merge joins", blurb: "two sorted inputs, two cursors walking forward. why sorted order is a resource." },
      { slug: "sorting", title: "sorting and work_mem", blurb: "quicksort in memory, top-N heapsort for LIMIT, external merge on disk, and Incremental Sort." },
      { slug: "aggregation-algorithms", title: "how GROUP BY runs", blurb: "HashAggregate vs GroupAggregate, and the hash table that spills to disk." },
      { slug: "parallel-query", title: "parallel query", blurb: "Gather, workers and partial aggregates. why one query used four cores, and why it can't in this page." },
    ],
  },
  {
    slug: "optimizer",
    n: 10,
    title: "the optimizer",
    blurb: "how postgres guesses row counts, prices every plan and picks the cheapest. and how it gets that wrong.",
    glyph: "scales",
    chapters: [
      { slug: "cost-model", title: "the cost model", blurb: "seq_page_cost, random_page_cost, cpu_tuple_cost. price a plan by hand and get the planner's number." }, // flagship
      { slug: "statistics", title: "pg_stats and ANALYZE", blurb: "null fraction, distinct counts, most common values, histograms, and the 30,000-row sample behind them." },
      { slug: "estimating-rows", title: "estimating rows", blurb: "how a WHERE becomes a row count: MCVs, histogram buckets, and the default guesses when there's nothing to go on." }, // flagship
      { slug: "misestimates", title: "when estimates go wrong", blurb: "the independence assumption, functions in WHERE, and the 1,000x miss that picks a nested loop." },
      { slug: "extended-statistics", title: "extended statistics", blurb: "CREATE STATISTICS for columns that move together. city and country, and a 35x misestimate fixed." },
      { slug: "join-ordering", title: "join order search", blurb: "n tables, n! orders. dynamic programming, join_collapse_limit, and the genetic optimizer past 12 tables." },
      { slug: "subquery-planning", title: "how subqueries get planned", blurb: "pull-up, semi joins, hashed SubPlans, and why IN and EXISTS often end up as the same plan." },
      { slug: "generic-plans", title: "prepared statements and generic plans", blurb: "five custom plans, then maybe one generic plan forever. plan_cache_mode, explained." },
      { slug: "finding-slow-queries", title: "finding slow queries", blurb: "pg_stat_statements, auto_explain, and the N+1 pattern seen from the database's side." },
      { slug: "steering-the-planner", title: "steering the planner", blurb: "postgres has no hints. enable_* switches, cost settings, query rewrites, and what you can actually control." },
    ],
  },
  {
    slug: "transactions",
    n: 11,
    title: "transactions and isolation",
    blurb: "ACID, the anomalies, the isolation levels, and what postgres really gives you at each one.",
    glyph: "lanes",
    chapters: [
      { slug: "acid", title: "ACID, honestly", blurb: "atomicity, consistency, isolation, durability. what each letter promises, and what it quietly doesn't." },
      { slug: "begin-commit-rollback", title: "BEGIN, COMMIT and ROLLBACK", blurb: "autocommit, savepoints, idle in transaction, and the aborted transaction that ignores everything you type." },
      { slug: "anomalies", title: "the anomaly catalogue", blurb: "dirty reads, non-repeatable reads, phantoms, lost updates, read skew and write skew. each one in two sessions." }, // flagship
      { slug: "isolation-levels", title: "isolation levels: the standard vs postgres", blurb: "READ UNCOMMITTED is READ COMMITTED, REPEATABLE READ is snapshot isolation. the table the standard doesn't show you." },
      { slug: "read-committed", title: "READ COMMITTED, up close", blurb: "a new snapshot per statement, and the UPDATE that re-checks a row after waiting for it." },
      { slug: "lost-updates", title: "lost updates", blurb: "read, modify, write, and one change vanishes. four fixes, compared on a real postgres." }, // flagship
      { slug: "row-locking-clauses", title: "SELECT ... FOR UPDATE and SKIP LOCKED", blurb: "row locks you ask for, NOWAIT, and a job queue that ten workers can drain without fighting." },
      { slug: "write-skew", title: "write skew and SERIALIZABLE", blurb: "two engineers go off call at once. snapshot isolation allows it, SERIALIZABLE doesn't." }, // flagship
      { slug: "retry-loops", title: "retrying serialization failures", blurb: "SQLSTATE 40001 is not a bug, it's a request. the retry loop your app needs, and where it goes." },
      { slug: "deadlocks", title: "deadlocks", blurb: "two transfers in opposite directions, a cycle, and the transaction postgres kills. lock ordering as the fix." },
      { slug: "advisory-locks", title: "advisory locks", blurb: "locks on numbers you make up. a mutex for cron jobs, and the session-level one that outlives your transaction." },
    ],
  },
  {
    slug: "storage",
    n: 12,
    title: "pages and the buffer pool",
    blurb: "where rows physically live. files, 8 KB pages, tuple headers, TOAST, and the cache in front of the disk.",
    glyph: "page",
    chapters: [
      { slug: "why-pages", title: "disks, memory and why pages exist", blurb: "a random read on SSD vs RAM, and why databases move 8 KB at a time." },
      { slug: "files-and-forks", title: "the files behind a table", blurb: "relfilenodes, the main, fsm and vm forks, 1 GB segments, and pg_relation_filepath." },
      { slug: "the-page", title: "the 8 KB page", blurb: "a header, line pointers growing down, tuples growing up, free space in the middle. ctid, finally explained." }, // flagship
      { slug: "tuple-layout", title: "inside a tuple", blurb: "a 23-byte header, the null bitmap, alignment padding, and why column order changes table size." },
      { slug: "toast", title: "TOAST", blurb: "a 1 MB value in an 8 KB page: compressed first, then sliced into a side table." },
      { slug: "fsm-and-vm", title: "the free space map and the visibility map", blurb: "where the next row goes, and the bit that lets vacuum and index-only scans skip a page." },
      { slug: "fillfactor", title: "fillfactor", blurb: "leaving room on purpose, so an update can stay on the same page." },
      { slug: "buffer-pool", title: "the buffer pool", blurb: "shared_buffers, the buffer table, pins, and what Buffers: shared hit=3 really counted." },
      { slug: "clock-sweep", title: "clock sweep", blurb: "usage counts, a hand that goes round, and why postgres doesn't do plain LRU." }, // flagship
      { slug: "ring-buffers", title: "ring buffers", blurb: "why one seq scan over a huge table doesn't flush everyone else's cache." },
      { slug: "writing-pages-back", title: "writing dirty pages back", blurb: "the background writer, the checkpointer, and the OS page cache sitting under all of it." },
      { slug: "async-io", title: "asynchronous I/O", blurb: "read streams, io_method = worker or io_uring, and what postgres 18 changed about reading.", since: 18 },
    ],
  },
  {
    slug: "index-internals",
    n: 13,
    title: "inside indexes",
    blurb: "b+trees page by page, splits under concurrency, and how hash, GIN, GiST, BRIN and LSM trees are built.",
    glyph: "tree",
    chapters: [
      { slug: "b-plus-trees", title: "b+trees", blurb: "wide and short, grows at the root, every leaf at the same depth. build one, a key at a time." }, // flagship
      { slug: "nbtree-pages", title: "a real b-tree, page by page", blurb: "bt_metap, bt_page_items, high keys and sibling links, read off a 10,000-row index." },
      { slug: "page-splits", title: "page splits", blurb: "what happens when a leaf fills up, and why sequential keys split 90/10 instead of 50/50." },
      { slug: "btree-concurrency", title: "b-trees under concurrency", blurb: "latch crabbing, lehman and yao's right-links, and why readers never wait for a split." },
      { slug: "dedup-and-bottom-up-deletion", title: "deduplication and bottom-up deletion", blurb: "posting lists for repeated keys, and clearing out old versions before resorting to a split." },
      { slug: "unique-checks", title: "how a unique index says no", blurb: "checking for a live duplicate, waiting on a transaction that hasn't decided yet, and the 23505 at the end." },
      { slug: "hash-indexes", title: "hash indexes", blurb: "a meta page, buckets, overflow pages, and splitting one bucket at a time. fill it until it splits." },
      { slug: "gin", title: "GIN", blurb: "an inverted index: one entry per key, a posting list of rows, and the pending list that makes writes cheap." },
      { slug: "gist-and-spgist", title: "GiST and SP-GiST", blurb: "trees of bounding boxes for ranges, geometry and nearest-neighbour search." },
      { slug: "brin", title: "BRIN", blurb: "a min and a max per block range. absurdly small, and only useful when the table is physically sorted." },
      { slug: "lsm-trees", title: "LSM trees and bloom filters", blurb: "memtables, SSTables, compaction, and the filter that says definitely not. the write-optimized design postgres doesn't use." },
      { slug: "vector-indexes", title: "vector indexes", blurb: "nearest neighbours for embeddings. HNSW graphs and IVF lists, approximate on purpose." },
    ],
  },
  {
    slug: "mvcc",
    n: 14,
    title: "MVCC and vacuum",
    blurb: "why an UPDATE writes a new row, who can see which version, and the vacuum that cleans up after everyone.",
    glyph: "ghosts",
    chapters: [
      { slug: "update-is-insert", title: "an UPDATE is an INSERT", blurb: "postgres never overwrites a row. it writes a new version and stamps the old one with xmax." }, // flagship
      { slug: "transaction-ids", title: "transaction ids, xmin and xmax", blurb: "who made this version and who ended it. virtual xids, lazy assignment, and SELECT xmin, xmax, ctid." },
      { slug: "snapshots", title: "snapshots", blurb: "xmin, xmax and the in-progress list. three numbers that decide everything your query can see." },
      { slug: "visibility-rules", title: "the visibility rules", blurb: "is this version visible to me? the whole decision as a flowchart, checked against real rows." },
      { slug: "commit-log-and-hint-bits", title: "the commit log and hint bits", blurb: "pg_xact, two bits per transaction, and the SELECT that dirties a page." },
      { slug: "hot-updates", title: "HOT updates and pruning", blurb: "an update that skips every index, if the page has room and no indexed column changed." }, // flagship
      { slug: "vacuum", title: "VACUUM", blurb: "removing dead versions, cleaning indexes, and why the file doesn't shrink. VACUUM FULL and the bloat it fixes." }, // flagship
      { slug: "autovacuum", title: "autovacuum", blurb: "thresholds, scale factors, cost limits, and the busy table it never seems to reach." },
      { slug: "xmin-horizon", title: "the xmin horizon", blurb: "one forgotten transaction and nothing gets cleaned. dead, but not yet removable." },
      { slug: "freezing-and-wraparound", title: "freezing and wraparound", blurb: "32-bit transaction ids go round in a circle. freezing, age(), and the shutdown nobody wants." },
      { slug: "multixacts", title: "MultiXacts", blurb: "when several transactions lock one row at once. the other counter that can wrap." },
      { slug: "undo-logs", title: "MVCC with undo logs", blurb: "how InnoDB and Oracle keep old versions in an undo log instead, and what each design pays." },
    ],
  },
  {
    slug: "locking",
    n: 15,
    title: "locks and concurrency control",
    blurb: "serializability theory, two-phase locking, postgres's lock manager, and the SSI that catches write skew.",
    glyph: "padlock",
    chapters: [
      { slug: "serializability", title: "schedules and serializability", blurb: "what correct means for interleaved transactions. conflicts, precedence graphs and cycles." },
      { slug: "two-phase-locking", title: "two-phase locking", blurb: "grow, then shrink. why 2PL guarantees serializability, and strict 2PL avoids cascading aborts." },
      { slug: "table-lock-modes", title: "table lock modes", blurb: "eight modes from ACCESS SHARE to ACCESS EXCLUSIVE, and the matrix that decides who waits." },
      { slug: "row-lock-internals", title: "how row locks are stored", blurb: "four strengths, kept in the tuple header instead of the lock table. pgrowlocks shows them." },
      { slug: "pg-locks", title: "watching locks with pg_locks", blurb: "pg_locks, pg_blocking_pids, and one query that shows who's blocking whom." },
      { slug: "lock-queue", title: "the lock queue", blurb: "a long SELECT, an ALTER TABLE behind it, and every query behind that frozen. lock_timeout saves the day." }, // flagship
      { slug: "deadlock-detection", title: "inside the deadlock detector", blurb: "wait-for graphs, deadlock_timeout, soft edges, and how a victim gets chosen." },
      { slug: "latches", title: "latches, spinlocks and LWLocks", blurb: "the short locks that protect memory, not rows. why they never show up in pg_locks." },
      { slug: "timestamp-ordering-and-occ", title: "timestamp ordering and OCC", blurb: "concurrency control without locks: order by timestamp, or validate at the end and abort." },
      { slug: "ssi", title: "serializable snapshot isolation", blurb: "SIRead locks, rw-antidependencies, and the dangerous structure that gets you a 40001." },
    ],
  },
  {
    slug: "wal",
    n: 16,
    title: "WAL and recovery",
    blurb: "write-ahead logging, LSNs, checkpoints, crash recovery, backups and replication.",
    glyph: "tape",
    chapters: [
      { slug: "write-ahead-rule", title: "the write-ahead rule", blurb: "log first, data later. why a commit only has to write one small sequential thing." },
      { slug: "wal-records", title: "WAL records and LSNs", blurb: "pg_walinspect on a real INSERT: record types, lengths, and the blocks each record touches." },
      { slug: "commit-path", title: "what COMMIT waits for", blurb: "the commit record, the flush, group commit, and what synchronous_commit = off really risks." },
      { slug: "full-page-writes", title: "torn pages and full-page writes", blurb: "an 8 KB page, a 4 KB disk write, and why the first change after a checkpoint logs the whole page." },
      { slug: "checkpoints", title: "checkpoints", blurb: "flushing dirty pages, the redo pointer, and the trade between recovery time and steady I/O." },
      { slug: "crash-recovery", title: "crash recovery", blurb: "kill the server, restart, replay from the redo pointer. pages newer than a record get skipped." }, // flagship
      { slug: "aries", title: "ARIES", blurb: "analysis, redo, undo. the textbook recovery algorithm, and why postgres only needs the middle pass." },
      { slug: "checksums", title: "data checksums", blurb: "on by default since postgres 18. what a checksum catches, and what it can't." },
      { slug: "backups-and-pitr", title: "backups and point-in-time recovery", blurb: "pg_dump vs base backups, WAL archiving, and restoring to 14:31:59, the second before the mistake." },
      { slug: "streaming-replication", title: "streaming replication", blurb: "a standby replaying WAL as it arrives. lag, hot standby conflicts, and synchronous replicas." },
      { slug: "logical-replication", title: "logical replication and decoding", blurb: "shipping row changes instead of page changes. publications, slots, and change data capture." },
    ],
  },
  {
    slug: "scale",
    n: 17,
    title: "scale and distribution",
    blurb: "pools, partitions, replicas, shards, and what changes when the data no longer fits on one machine.",
    glyph: "shards",
    chapters: [
      { slug: "connections-and-pooling", title: "connections and pooling", blurb: "a process per connection, why 5,000 connections hurt, and pgbouncer's three modes." },
      { slug: "orms-and-n-plus-one", title: "ORMs and the N+1 problem", blurb: "one query for the list, one per row for the details. spotting it, and fixing it with a join." },
      { slug: "partitioning", title: "table partitioning", blurb: "range, list and hash partitions, pruning at plan and run time, and the key every unique index must include." },
      { slug: "read-replicas", title: "read replicas and read-your-writes", blurb: "sending reads to a standby, the stale read right after a write, and waiting for an LSN." },
      { slug: "sharding", title: "sharding", blurb: "one table across many machines. shard keys, hot shards, and the query that has to ask everyone." },
      { slug: "cap-and-pacelc", title: "CAP and PACELC", blurb: "the theorem everyone quotes wrong, and the latency trade-off that matters on a normal day." },
      { slug: "consistency-models", title: "consistency models", blurb: "linearizable, serializable, causal, eventual. a map of what distributed databases actually promise." },
      { slug: "two-phase-commit", title: "two-phase commit", blurb: "prepare everywhere, then commit everywhere. PREPARE TRANSACTION, and the coordinator that dies at the worst moment." },
      { slug: "consensus", title: "replication and consensus", blurb: "leaders, terms and a replicated log. raft in pictures, and why it needs a majority." },
      { slug: "distributed-sql", title: "distributed SQL and disaggregated storage", blurb: "spanner, cockroachdb, citus, aurora and neon. how each one splits the problem." },
    ],
  },
  {
    slug: "deep-dives",
    n: 18,
    title: "deep dives and interviews",
    blurb: "one row traced end to end, other engines compared, the interview questions, and a toy database you build yourself.",
    glyph: "magnifier",
    chapters: [
      { slug: "one-insert-all-the-way-down", title: "one INSERT, all the way down", blurb: "parse, plan, heap, index, WAL, commit, checkpoint. every step of one row, traced on a real server." },
      { slug: "postgres-vs-innodb", title: "postgres vs InnoDB", blurb: "a heap vs a clustered index, versions vs undo, gap locks vs SSI. same SQL, different machine." },
      { slug: "sqlite-inside", title: "sqlite, inside", blurb: "one file, one writer, a b-tree for everything, and why it's on your phone a hundred times over." },
      { slug: "columnar-and-vectorized", title: "column stores and vectorized execution", blurb: "the same table stored by column and run a batch at a time. duckdb's numbers next to postgres's." },
      { slug: "tuning-casebook", title: "a query tuning casebook", blurb: "ten slow queries, their EXPLAINs, and the one change that fixed each." },
      { slug: "sql-interview", title: "SQL interview questions", blurb: "second highest salary, duplicates, running totals, streaks. the classics, and the answer that lands." },
      { slug: "schema-interview", title: "the schema design interview", blurb: "a booking system from requirements to constraints, thought out loud." },
      { slug: "internals-interview", title: "database internals interview questions", blurb: "b-tree vs LSM, MVCC, isolation, WAL. the system design round, answered properly." },
      { slug: "toy-database", title: "build a toy database", blurb: "pages, a b+tree, a WAL and a REPL in a few hundred lines. the whole book, in your editor." },
      { slug: "whats-next", title: "where postgres is going", blurb: "postgres 19's REPACK and plan advice, what got pulled, and how to follow along.", preview: true },
    ],
  },
];

// ---- helpers ----------------------------------------------------------------

export type FlatChapter = Chapter & { part: Part; index: number; href: string; address: string };

/** chapter addresses are sql names: database.schema.table, so slugs become snake_case */
const snake = (s: string) => s.replace(/-/g, "_");

export const flat: FlatChapter[] = parts.flatMap((part) =>
  part.chapters.map((c) => ({
    ...c,
    part,
    index: 0,
    href: `/learn/${part.slug}/${c.slug}`,
    address: `everything.${snake(part.slug)}.${snake(c.slug)}`,
  })),
).map((c, index) => ({ ...c, index }));

export const totalChapters = flat.length;

export function getPart(slug: string) {
  return parts.find((p) => p.slug === slug);
}

export function getChapter(partSlug: string, chapterSlug: string) {
  return flat.find((c) => c.part.slug === partSlug && c.slug === chapterSlug);
}

export function neighbours(c: FlatChapter) {
  return { prev: flat[c.index - 1], next: flat[c.index + 1] };
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
