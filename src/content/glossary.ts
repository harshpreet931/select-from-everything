// the dictionary. every term links to the chapter that explains it best.
// keep `short` to one line, lowercase, no em dashes.
//
// core terms are below. each part adds its own in content/<part>/terms.json:
//   [{ "term": "ctid", "short": "one line, lowercase", "chapter": "the-page", "aka": ["tuple id"] }]
import t0 from "@content/start/terms.json";
import t1 from "@content/basics/terms.json";
import t2 from "@content/joins/terms.json";
import t3 from "@content/analytics/terms.json";
import t4 from "@content/writes/terms.json";
import t5 from "@content/types/terms.json";
import t6 from "@content/design/terms.json";
import t7 from "@content/indexes/terms.json";
import t8 from "@content/execution/terms.json";
import t9 from "@content/optimizer/terms.json";
import t10 from "@content/transactions/terms.json";
import t11 from "@content/storage/terms.json";
import t12 from "@content/index-internals/terms.json";
import t13 from "@content/mvcc/terms.json";
import t14 from "@content/locking/terms.json";
import t15 from "@content/wal/terms.json";
import t16 from "@content/scale/terms.json";
import t17 from "@content/deep-dives/terms.json";

export type Term = {
  id: string;
  term: string;
  short: string;
  /** chapter href that explains it best */
  href: string;
  /** other spellings people search for */
  aka?: string[];
};

const t = (term: string, short: string, href: string, aka?: string[]): Term => ({
  id: term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, ""),
  term,
  short,
  href,
  aka,
});

const core: Term[] = [
  t("database", "an organised collection of data plus the program that keeps it safe, shared and queryable.", "/learn/start/what-is-a-database"),
  t("DBMS", "database management system. the program around the data: storage, queries, transactions, recovery.", "/learn/start/what-is-a-database", ["database management system"]),
  t("relation", "the formal name for a table: a set of rows that all share the same columns.", "/learn/start/relational-model"),
  t("SQL", "the language you use to ask a relational database for data. you say what, it decides how.", "/learn/start/first-query", ["structured query language"]),
  t("PGlite", "postgres compiled to webassembly. the engine running every query on this site.", "/learn/start/postgres-in-your-browser"),
  t("NULL", "a marker for a missing or unknown value. not zero, not empty, not equal to anything, not even itself.", "/learn/basics/null-and-three-valued-logic"),
  t("logical order", "the order the clauses of a SELECT take effect: FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY, LIMIT.", "/learn/basics/logical-order"),
  t("join", "combining rows from two tables: a cross product filtered by a condition.", "/learn/joins/joins-in-one-picture"),
  t("window function", "a function computed over a set of related rows without collapsing them into one.", "/learn/analytics/window-functions"),
  t("primary key", "the column or columns that identify a row. unique and never NULL.", "/learn/design/keys", ["pk"]),
  t("foreign key", "a column that must match a key in another table. the database checks it on every write.", "/learn/design/foreign-keys", ["fk"]),
  t("normal form", "a rule about how facts are split across tables so each one is stored once.", "/learn/design/normal-forms", ["normalization"]),
  t("index", "a separate, sorted structure that points back at table rows so lookups skip the full scan.", "/learn/indexes/what-an-index-is"),
  t("EXPLAIN", "the command that shows the plan postgres picked for a query, with its cost estimates.", "/learn/execution/reading-explain"),
  t("query plan", "the tree of operators the executor runs to answer a query.", "/learn/execution/reading-explain", ["execution plan"]),
  t("planner", "the part of postgres that turns a query into the cheapest plan it can find.", "/learn/optimizer/cost-model", ["optimizer", "query optimizer"]),
  t("transaction", "a group of statements that commit together or not at all.", "/learn/transactions/begin-commit-rollback"),
  t("isolation level", "how much of other transactions' work a transaction may see while they run.", "/learn/transactions/isolation-levels"),
  t("page", "the 8 KB block postgres reads and writes. every table and index is a file of pages.", "/learn/storage/the-page", ["block"]),
  t("ctid", "a row version's physical address: (page number, slot number).", "/learn/storage/the-page"),
  t("buffer pool", "postgres's shared cache of pages in memory. every read goes through it.", "/learn/storage/buffer-pool", ["shared_buffers"]),
  t("B-tree", "the default index type: a balanced tree of sorted keys, a few levels deep, with linked leaves.", "/learn/index-internals/b-plus-trees", ["b+tree", "btree"]),
  t("MVCC", "multi-version concurrency control. writers create new row versions so readers never wait.", "/learn/mvcc/update-is-insert", ["multi-version concurrency control"]),
  t("VACUUM", "the command that removes row versions nobody can see anymore and records the free space.", "/learn/mvcc/vacuum"),
  t("lock", "a claim on a table or row that makes conflicting transactions wait.", "/learn/locking/table-lock-modes"),
  t("WAL", "write-ahead log. every change is logged and flushed before the data pages are written.", "/learn/wal/write-ahead-rule", ["write-ahead log"]),
  t("checkpoint", "the moment postgres has written every dirty page, so recovery can start from there.", "/learn/wal/checkpoints"),
  t("replication", "keeping a copy of the database on another server by shipping its changes.", "/learn/wal/streaming-replication"),
];

type PartTerm = { term: string; short: string; chapter: string; aka?: string[] };
const perPart: [string, PartTerm[]][] = [
  ["start", t0 as PartTerm[]],
  ["basics", t1 as PartTerm[]],
  ["joins", t2 as PartTerm[]],
  ["analytics", t3 as PartTerm[]],
  ["writes", t4 as PartTerm[]],
  ["types", t5 as PartTerm[]],
  ["design", t6 as PartTerm[]],
  ["indexes", t7 as PartTerm[]],
  ["execution", t8 as PartTerm[]],
  ["optimizer", t9 as PartTerm[]],
  ["transactions", t10 as PartTerm[]],
  ["storage", t11 as PartTerm[]],
  ["index-internals", t12 as PartTerm[]],
  ["mvcc", t13 as PartTerm[]],
  ["locking", t14 as PartTerm[]],
  ["wal", t15 as PartTerm[]],
  ["scale", t16 as PartTerm[]],
  ["deep-dives", t17 as PartTerm[]],
];

const seen = new Set(core.map((x) => x.id));
export const glossary: Term[] = [
  ...core,
  ...perPart.flatMap(([part, list]) =>
    list.map((x) => t(x.term, x.short, `/learn/${part}/${x.chapter}`, x.aka)).filter((x) => !seen.has(x.id) && seen.add(x.id)),
  ),
].sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
