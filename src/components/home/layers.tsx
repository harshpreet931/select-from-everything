import type { ReactNode } from "react";
import { tokenizeSql } from "@/components/figures/kit/sql";
import { flat } from "@/content/curriculum";
import descent from "./descent.json";

// the descent: one query, followed all the way down. every artifact here is real output from
// postgres 18.6 (PGlite 0.5.12, the engine the site runs in your browser), captured from the
// `shop` dataset by tools/descent/capture.mjs into descent.json. the numbers in the copy are
// read from that file too. to change an artifact, change the capture and re-run it.

export type Layer = {
  id: string;
  title: string;
  /** what the reader learns at this depth, in two or three lines */
  text: ReactNode;
  href: string;
  linkLabel: string;
  stage: ReactNode;
};

type Step = { sql: string; tag: string; columns?: string[]; rows?: (string | null)[][]; error?: { sqlstate: string; message: string; position?: number } };
const steps = descent.steps as unknown as Record<string, Step | Step[]> & {
  ratio: number;
  leafBlock: number;
  parseTree: { sql: string; message: string; lines: string[]; chars: number };
};
/** the statement of a captured step that has output (the last one, for multi-statement steps) */
const S = (name: string): Step => {
  const s = steps[name] as Step | Step[];
  return Array.isArray(s) ? (s.filter((x) => x.columns).at(-1) ?? s[s.length - 1]) : s;
};
const all = (name: string): Step[] => {
  const s = steps[name] as Step | Step[];
  return Array.isArray(s) ? s : [s];
};
const cell = (name: string, row = 0, col = 0) => S(name).rows?.[row]?.[col] ?? "";
const plan = (name: string) => (S(name).rows ?? []).map((r) => r[0] ?? "");

const k = (s: string) => <span className="text-hi">{s}</span>;
const d = (s: string) => <span className="text-faint">{s}</span>;
const hot = (s: string) => <span className="text-hot">{s}</span>;
const meta = (s: string) => <span className="text-meta">{s}</span>;
const ref = (s: string) => <span className="text-ref">{s}</span>;

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col justify-center pb-2 font-mono text-13">
      <div className="mb-5 text-12 text-faint">{label}</div>
      <div className="min-h-0 overflow-x-auto overflow-y-hidden">{children}</div>
    </div>
  );
}

const pre = "whitespace-pre text-12 leading-[1.75] sm:text-13";
const small = `${pre} !text-11 sm:!text-12`;
/** one line of output: wraps inside the panel on narrow screens, continuation lines hang under the first */
function Line({ children }: { children: ReactNode }) {
  return <div className="pl-[4ch] [text-indent:-4ch] whitespace-pre-wrap">{children}</div>;
}
const note = "mt-4 max-w-[34rem] font-sans text-[0.95rem] leading-[1.55] text-mute italic whitespace-normal";

/** sql, coloured by the tokenizer the figures use */
function Sql({ code }: { code: string }) {
  return (
    <>
      {tokenizeSql(code).map((t, i) => (
        <span
          key={i}
          className={t.k === "kw" ? "text-hi" : t.k === "lit" || t.k === "str" ? "text-[var(--code-lit)]" : t.k === "punc" || t.k === "op" ? "text-faint" : "text-ink"}
        >
          {t.t}
        </span>
      ))}
    </>
  );
}

const numeric = (v: string | null) => v != null && /^-?\d+(\.\d+)?$/.test(v);

/** psql's aligned output: centred headers, a rule, rows, "(n rows)" */
function Psql({ step, hl }: { step: Step; hl?: (row: number, col: number) => string | undefined }) {
  const cols = step.columns ?? [];
  const rows = step.rows ?? [];
  const w = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => (r[i] ?? "").length)));
  const center = (s: string, n: number) => {
    const left = Math.floor((n - s.length) / 2);
    return " ".repeat(left) + s + " ".repeat(n - s.length - left);
  };
  return (
    <>
      {cols.map((c, i) => (
        <span key={`h${i}`}>
          {i > 0 && d("|")}
          {` ${center(c, w[i])} `}
        </span>
      ))}
      {"\n"}
      {d(w.map((n) => "-".repeat(n + 2)).join("+"))}
      {rows.map((r, ri) => (
        <span key={`r${ri}`}>
          {"\n"}
          {r.map((v, ci) => {
            const s = v ?? "";
            return (
              <span key={ci}>
                {ci > 0 && d("|")} <span className={hl?.(ri, ci) ?? ""}>{numeric(v) ? s.padStart(w[ci]) : s.padEnd(w[ci])}</span>{" "}
              </span>
            );
          })}
        </span>
      ))}
      {"\n"}
      {d(`(${rows.length} ${rows.length === 1 ? "row" : "rows"})`)}
    </>
  );
}

const link = (href: string) => ({ href, linkLabel: flat.find((c) => c.href === href)?.title ?? href.split("/").pop()! });

// ---- values the copy quotes, all from the capture ----
const relid = cell("catalog", 0, 0);
const attnum = cell("catalog", 0, 1);
const typid = cell("catalog", 0, 2);
const leafRow = S("leaf").rows?.[0] ?? [];
const tid = leafRow[1] ?? "";
const [tidBlock, tidSlot] = (/\((\d+),(\d+)\)/.exec(tid) ?? []).slice(1);
const readN = /shared read=(\d+)/.exec(plan("cold").join("\n"))?.[1] ?? "";
const hitN = /shared hit=(\d+)/.exec(plan("warm").join("\n"))?.[1] ?? "";
const filepath = cell("filepath");
const tupleRow = S("tuple").rows?.[0] ?? [];
const [, lpOff, lpLen, xmin, xmax, tCtid, hoff, rawFlags] = tupleRow;
const flags = (rawFlags ?? "").replace(/[{}]/g, "").split(",").filter(Boolean);
const lower = Number(cell("header", 0, 0));
const upper = Number(cell("header", 0, 1));
const special = Number(cell("header", 0, 2));
const walRows = S("wal").rows ?? [];
const walKB = Math.round(walRows.reduce((s, r) => s + Number(r[3]), 0) / 1024);
const oldRow = S("oldVersion").rows?.[0] ?? [];
const newPage = /\((\d+),/.exec(oldRow[3] ?? "")?.[1] ?? "";
const vacRow = S("afterVacuum").rows?.[0] ?? [];
const cost = (line: string) => Number(/cost=[\d.]+\.\.([\d.]+)/.exec(line)?.[1] ?? 0);

// ---- bytes ----
const bytes = (hex: string) => hex.match(/../g) ?? [];
const le = (b: string[]) => parseInt([...b].reverse().join(""), 16);
const hb = bytes(cell("headerBytes"));
const headerFields: { name: string; n: number; value: (b: string[]) => string }[] = [
  { name: "pd_lsn", n: 8, value: (b) => `${le(b.slice(0, 4)).toString(16).toUpperCase()}/${le(b.slice(4, 8)).toString(16).toUpperCase()}` },
  { name: "checksum", n: 2, value: (b) => `0x${le(b).toString(16).padStart(4, "0")}` },
  { name: "flags", n: 2, value: (b) => `0x${le(b).toString(16).padStart(4, "0")}` },
  { name: "lower", n: 2, value: (b) => String(le(b)) },
  { name: "upper", n: 2, value: (b) => String(le(b)) },
  { name: "special", n: 2, value: (b) => String(le(b)) },
  { name: "size, version", n: 2, value: (b) => `${le(b) & 0xff00}, ${le(b) & 0xff}` },
  { name: "prune_xid", n: 4, value: (b) => String(le(b)) },
];
const tb = bytes(cell("tupleBytes"));
const idAt = Number(hoff ?? 24);

export const layers: Layer[] = [
  {
    id: "query",
    title: "your query",
    text: (
      <>
        one line. you say what you want, never how to get it. that&apos;s the deal SQL makes, and everything below is
        postgres keeping its side of it.
      </>
    ),
    ...link("/learn/start/first-query"),
    stage: (
      <Panel label="psql · db=shop">
        <div className="pl-[4ch] text-14 leading-[1.85] [text-indent:-4ch] whitespace-pre-wrap sm:text-[clamp(1rem,0.6rem+0.8vw,1.2rem)]">
          <Sql code={descent.query} />
        </div>
        <pre className={`${pre} mt-7 text-ink`}>
          <Psql step={S("query")} hl={() => "text-hi"} />
        </pre>
      </Panel>
    ),
  },
  {
    id: "parser",
    title: "the parser",
    text: (
      <>
        characters become tokens, tokens become a tree. the parser knows grammar and nothing else: it has no idea whether{" "}
        <code>customers</code> exists. misspell <code>FROM</code> and watch where it actually complains.
      </>
    ),
    ...link("/learn/execution/query-lifecycle"),
    stage: (
      <Panel label="tokens, then the grammar">
        <div className="flex flex-wrap gap-1.5 text-12">
          {tokenizeSql(descent.query)
            .filter((t) => t.t.trim())
            .map((t, i) => (
              <span key={i} className={`rounded-xs px-1.5 py-0.5 shadow-[inset_0_0_0_1px_var(--line-2)] ${t.k === "kw" ? "text-hi" : "text-ink"}`}>
                {t.t}
              </span>
            ))}
        </div>
        <pre className={`${small} mt-5`}>
          <Psql step={S("keywords")} hl={(r) => (S("keywords").rows?.[r]?.[0] === "name" ? "text-hot" : undefined)} />
        </pre>
        <pre className={`${pre} mt-5 !text-[10px] leading-[1.75] sm:!text-12`}>
          {d("=> ")}
          <Sql code={S("typo").sql} />
          {"\n"}
          <span className="text-dead">ERROR:  {S("typo").error?.message}</span>
          {"\n"}
          {d("LINE 1: ")}
          {S("typo").sql}
          {"\n"}
          {" ".repeat(8 + (S("typo").error?.position ?? 1) - 1)}
          <span className="text-dead">^</span>
        </pre>
        <p className={note}>
          <span className="not-italic text-hot">name</span> is unreserved, so it can be a column. FORM became an alias for it
          (AS is optional), so the parser only got lost one word later. the chips are this site&apos;s tokenizer; the rest is
          postgres.
        </p>
      </Panel>
    ),
  },
  {
    id: "analyzer",
    title: "the analyzer",
    text: (
      <>
        now names become numbers. <code>customers</code> is relation {relid}, <code>name</code> is column {attnum}, of type{" "}
        {typid} (text). this is the step that says <code>relation &quot;custmers&quot; does not exist</code>.
      </>
    ),
    ...link("/learn/execution/system-catalog"),
    stage: (
      <Panel label="SET debug_print_parse = on">
        <pre className={small}>
          {d(`LOG:  ${steps.parseTree.message}`)}
        </pre>
        <div className={`${small} pl-[2ch]`}>
          {steps.parseTree.lines.map((full, i) => (
            <Line key={i}>
              {(full.length > 66 ? `${full.slice(0, 66)}…` : full).split(/(:relid \d+|:varattno \d+|:vartype \d+)/).map((p, j) =>
                j % 2 ? (
                  <span key={j}>
                    {p.split(" ")[0]} <span className="text-meta">{p.split(" ")[1]}</span>
                  </span>
                ) : (
                  <span key={j} className="text-ink">
                    {p}
                  </span>
                ),
              )}
            </Line>
          ))}
          <Line>{d(`… the whole tree is ${steps.parseTree.chars.toLocaleString("en-US")} characters`)}</Line>
        </div>
        <pre className={`${small} mt-6`}>
          {d("the catalog says the same:\n")}
          <Psql step={S("catalog")} hl={() => "text-meta"} />
        </pre>
      </Panel>
    ),
  },
  {
    id: "planner",
    title: "the planner",
    text: (
      <>
        there are many ways to fetch one row. the planner prices each in made-up units and keeps the cheapest: walk the
        primary key, read one heap page. reading every row would cost about {steps.ratio}x more.
      </>
    ),
    ...link("/learn/optimizer/cost-model"),
    stage: (
      <Panel label="EXPLAIN">
        <div className={small}>
          {plan("plan").map((l, i) => (
            <Line key={i}>{i === 0 ? k(l) : l}</Line>
          ))}
        </div>
        <div className={`${small} mt-6 text-mute`}>
          <Line>{d("SET enable_indexscan = off; SET enable_bitmapscan = off;")}</Line>
          {plan("seqPlan").map((l, i) => (
            <Line key={i}>{l}</Line>
          ))}
        </div>
        <div className="mt-7 grid max-w-[420px] gap-2.5 text-11">
          {(
            [
              ["index scan", plan("plan")[0], "var(--hi)"],
              ["seq scan", plan("seqPlan")[0], "var(--line-2)"],
            ] as const
          ).map(([name, line, color]) => (
            <div key={name} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-3">
              <span className="text-faint">{name}</span>
              <span className="h-1.5 rounded-xs" style={{ width: `${(cost(line) / cost(plan("seqPlan")[0])) * 100}%`, background: color }} />
              <span className="text-right text-mute tabular">{cost(line).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </Panel>
    ),
  },
  {
    id: "executor",
    title: "the executor",
    text: (
      <>
        the plan is a tree of iterators. the top asks for a row, the index scan asks the index, the index hands back an
        address. one <code>next()</code> returns Ada, the next one returns nothing, and the query is over.
      </>
    ),
    ...link("/learn/execution/iterator-model"),
    stage: (
      <Panel label="EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)">
        <div className={small}>
          {plan("analyze").map((l, i) => (
            <Line key={i}>
              {l.split(/(\(actual [^)]*\))/).map((p, j) => (j === 1 ? <span key={j} className="text-hi">{p}</span> : <span key={j}>{p}</span>))}
            </Line>
          ))}
        </div>
        <pre className={`${pre} mt-8`}>
          {hot("→ ")}
          {k("next()")}
          {d("  →  ")}
          <span className="text-live">({cell("query")})</span>
          {"\n  "}
          {k("next()")}
          {d("  →  end of scan")}
        </pre>
      </Panel>
    ),
  },
  {
    id: "index",
    title: "the index",
    text: (
      <>
        the index is a b+tree on <code>id</code>. the root says which leaf to visit, and the leaf holds the key 42 next to
        an address: {tid}, page {tidBlock}, slot {tidSlot} of the table. that address is a ctid.
      </>
    ),
    ...link("/learn/index-internals/nbtree-pages"),
    stage: (
      <Panel label="pageinspect · bt_metap, bt_page_items">
        <pre className={small}>
          {d("root page ")}
          {k(cell("meta", 0, 0))}
          {d(", level ")}
          {k(cell("meta", 0, 1))}
          {"\n"}
          {d("off  child  keys from")}
          {(S("root").rows ?? []).map((r, i) => {
            const key = r[2] ? String(le(bytes(r[2].replace(/ /g, "")).slice(0, 4))) : "-∞";
            const blk = /\((\d+),/.exec(r[1] ?? "")?.[1] ?? "";
            const chosen = Number(blk) === steps.leafBlock;
            return (
              <span key={i} className={chosen ? "" : "text-mute"}>
                {"\n"}
                {(r[0] ?? "").padStart(3)}
                {"  "}
                {chosen ? ref(`→ ${blk}`.padEnd(5)) : `→ ${blk}`.padEnd(5)}
                {"  "}
                {chosen ? hot(key) : key}
              </span>
            );
          })}
        </pre>
        <div className={`${small} mt-5`}>
          <Line>{d(`leaf page ${steps.leafBlock}, the entry for 42:`)}</Line>
          <Line>
            {d("off ")}
            {leafRow[0]}
            {d("  ctid ")}
            {ref(tid)}
            {d("  data ")}
            {hot((leafRow[2] ?? "").slice(0, 2))}
            {(leafRow[2] ?? "").slice(2)}
          </Line>
        </div>
        <p className={note}>
          42 sorts before every separator, so the walk takes the first child. <span className="not-italic text-hot">2a</span>{" "}
          is 42 in hex, stored little-endian.
        </p>
      </Panel>
    ),
  },
  {
    id: "buffers",
    title: "the buffer pool",
    text: (
      <>
        postgres never reads straight from disk into your query. every page goes through a shared cache first. cold, the
        query read {readN} pages. run it again and it hit the same {hitN}. same query, no I/O.
      </>
    ),
    ...link("/learn/storage/buffer-pool"),
    stage: (
      <Panel label="pg_buffercache (evicting is new in postgres 18)">
        <div className={small}>
          {all("evict").map((s, i) => (
            <Line key={i}>
              {d(s.sql.replace("SELECT * FROM ", "").replace(";", ""))}
              {d("  evicted ")}
              {s.rows?.[0]?.[0]}
            </Line>
          ))}
        </div>
        <pre className={`${small} mt-4`}>
          {d("cold   ")}
          {plan("cold")
            .at(-1)
            ?.trim()
            .split(/(read=\d+)/)
            .map((p, j) => (j === 1 ? <span key={j} className="text-hot">{p}</span> : <span key={j}>{p}</span>))}
          {"\n"}
          {d("again  ")}
          {plan("warm")
            .at(-1)
            ?.trim()
            .split(/(hit=\d+)/)
            .map((p, j) => (j === 1 ? <span key={j} className="text-live">{p}</span> : <span key={j}>{p}</span>))}
        </pre>
        <pre className={`${small} mt-6`}>
          <Psql step={S("frames")} />
        </pre>
      </Panel>
    ),
  },
  {
    id: "page",
    title: "the page",
    text: (
      <>
        every table is a stack of 8 KB pages. slot 42 is a 4-byte line pointer near the top of page 0, pointing at its
        tuple further down: a header that says who wrote it, then Ada.
      </>
    ),
    ...link("/learn/storage/the-page"),
    stage: (
      <Panel label="pageinspect · page_header, heap_page_items">
        <PageBar />
        <pre className={`${small} mt-6`}>
          {d("lp ")}
          {k("42")}
          {d("  lp_off ")}
          {ref(lpOff ?? "")}
          {d("  lp_len ")}
          {lpLen}
          {d("  t_hoff ")}
          {hoff}
          {"\n"}
          {d("t_xmin ")}
          {meta(xmin ?? "")}
          {d("  t_xmax ")}
          {meta(xmax ?? "")}
          {d("  t_ctid ")}
          {ref(tCtid ?? "")}
        </pre>
        <div className="mt-3 flex max-w-[34rem] flex-wrap gap-1 text-11">
          {flags.map((f) => (
            <span key={f} className="rounded-xs px-1.5 py-0.5 text-meta shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--meta)_40%,transparent)]">
              {f.replace(/^HEAP_/, "")}
            </span>
          ))}
        </div>
        {flags.includes("HEAP_XMAX_LOCK_ONLY") && (
          <p className={note}>
            t_xmax {xmax} isn&apos;t a delete. XMAX_LOCK_ONLY: it&apos;s a key-share lock, left when the load&apos;s foreign key
            checks looked Ada up. XMAX_INVALID: nobody deleted her.
          </p>
        )}
      </Panel>
    ),
  },
  {
    id: "bytes",
    title: "the bytes",
    text: (
      <>
        and at the bottom, a file: <code>{filepath}</code>. page 0 is its first 8,192 bytes. the first eight are the LSN of
        the last WAL record that touched it, and inside Ada&apos;s tuple sits <code>2a 00 00 00</code>, the 42 from your
        WHERE clause.
      </>
    ),
    ...link("/learn/storage/files-and-forks"),
    stage: (
      <Panel label={`get_raw_page('customers', 0) · ${filepath}`}>
        <div className="grid max-w-[520px] grid-cols-2 gap-x-3 gap-y-3 text-11 sm:grid-cols-4 sm:text-12">
          {(() => {
            let at = 0;
            return headerFields.map((f) => {
              const b = hb.slice(at, at + f.n);
              at += f.n;
              return (
                <div key={f.name} className={`flex min-w-0 flex-col gap-0.5 ${f.n === 8 ? "col-span-2" : ""}`}>
                  <span className="truncate text-meta">{b.join(" ")}</span>
                  <span className="truncate text-faint">{f.name}</span>
                  <span className="truncate text-ink">{f.value(b)}</span>
                </div>
              );
            });
          })()}
        </div>
        <pre className={`${small} mt-6`}>
          {d(`the tuple: ${lpLen} bytes at byte ${lpOff}`)}
          <span className="sm:hidden">
            <Hex per={8} />
          </span>
          <span className="hidden sm:inline">
            <Hex per={16} />
          </span>
        </pre>
        <p className={note}>
          <span className="not-italic text-meta">the first {idAt} bytes</span> are the tuple header (xmin, xmax, ctid, flags),
          then <span className="not-italic text-hot">2a 00 00 00</span> is id 42 and Ada Lovelace follows. this is the page
          in memory, which is the page on disk after a checkpoint, except the checksum, which is stamped on the way out.
        </p>
      </Panel>
    ),
  },
  {
    id: "wal",
    title: "and the WAL",
    text: (
      <>
        change the row and the first thing written isn&apos;t the table, it&apos;s a log record. postgres appends to the
        write-ahead log, flushes it at COMMIT, and writes the page later. the log is the truth. the table catches up.
      </>
    ),
    ...link("/learn/wal/wal-records"),
    stage: (
      <Panel label="pg_walinspect · pg_get_wal_records_info">
        <div className={small}>
          <Line>
            {d("=> ")}
            <Sql code={S("update").sql} />
          </Line>
          <Line>{d(S("update").tag)}</Line>
        </div>
        <pre className={`${small} mt-5`}>
          {d("start_lsn rmgr        record_type length   fpi")}
          {walRows.map((r, i) => (
            <span key={i}>
              {"\n"}
              {meta((r[0] ?? "").padEnd(10))}
              {(r[1] ?? "").padEnd(12)}
              {k((r[2] ?? "").padEnd(12))}
              {(r[3] ?? "").padStart(6)}
              {Number(r[4]) > 0 ? hot((r[4] ?? "").padStart(6)) : d((r[4] ?? "").padStart(6))}
            </span>
          ))}
        </pre>
        <p className={note}>
          the new version didn&apos;t fit on page 0, so it went to page {newPage}: the old tuple is locked, the UPDATE is
          logged, each of the two indexes gets an entry, then the COMMIT. each page&apos;s first change since the last
          checkpoint carries a <span className="not-italic text-hot">full page image</span>, so one changed row logged{" "}
          {walKB} KB.
        </p>
      </Panel>
    ),
  },
  {
    id: "old",
    title: "and the old version",
    text: (
      <>
        the UPDATE didn&apos;t change Ada&apos;s row. it wrote a new version and stamped the old one with its transaction id
        in xmax. anyone already reading still sees the old one. once nobody can, VACUUM frees the slot.
      </>
    ),
    ...link("/learn/mvcc/update-is-insert"),
    stage: (
      <Panel label="pageinspect · heap_page_items, before and after VACUUM">
        <div className={small}>
          <Line>{d("after the UPDATE, slot 42 on page 0:")}</Line>
          <Line>
            {d("lp_flags ")}
            {oldRow[1]}
            {d(" (normal)  t_xmax ")}
            {meta(oldRow[2] ?? "")}
            {d("  t_ctid ")}
            {ref(`→ ${oldRow[3]}`)}
          </Line>
          <div className="my-4">
            <Line>
              {d("=> ")}
              <Sql code={S("vacuum").sql} />
            </Line>
          </div>
          <Line>
            {d("lp_flags ")}
            {vacRow[1]}
            {d(" (unused)  t_xmax ")}
            {d(String(vacRow[2] ?? "null"))}
            {d("  t_ctid ")}
            {d(String(vacRow[3] ?? "null"))}
          </Line>
        </div>
        <p className={note}>
          the old version&apos;s t_ctid points at the new one, on page {newPage}. once xmax {oldRow[2]} committed and no
          snapshot could still want the old one, it was <span className="not-italic text-dead">dead</span>. VACUUM removed it
          and the index entries pointing at it, and slot 42 is free again.
        </p>
      </Panel>
    ),
  },
];

/** the tuple's bytes, `per` to a row: header in meta, the id in hot */
function Hex({ per }: { per: number }) {
  return (
    <>
      {Array.from({ length: Math.ceil(tb.length / per) }, (_, row) => (
        <span key={row}>
          {"\n"}
          {d(String(row * per).padStart(3, "0") + "  ")}
          {tb.slice(row * per, row * per + per).map((b, i) => {
            const at = row * per + i;
            const cls = at < idAt ? "text-meta" : at < idAt + 4 ? "text-hot" : "text-ink";
            return (
              <span key={i} className={cls}>
                {b}
                {i < per - 1 ? " " : ""}
              </span>
            );
          })}
        </span>
      ))}
    </>
  );
}

/** page 0 to scale: header, line pointers, the free gap, tuples, with slot 42 and its tuple marked */
function PageBar() {
  const W = special || 8192;
  const pct = (n: number) => `${(n / W) * 100}%`;
  const lp42 = 24 + 41 * 4;
  const off = Number(lpOff ?? 0);
  const len = Number(lpLen ?? 0);
  return (
    <div
      className="max-w-[480px]"
      role="img"
      aria-label={`page 0: header and line pointers up to byte ${lower}, ${upper - lower} bytes free, tuples from byte ${upper} to ${special}. slot 42 points at byte ${off}.`}
    >
      <svg className="block h-5 w-full overflow-visible" viewBox={`0 0 ${W} 20`} preserveAspectRatio="none" aria-hidden>
        <path
          d={`M ${lp42 + 8} 20 C ${lp42 + 8} 2, ${off + len / 2} 2, ${off + len / 2} 19`}
          fill="none"
          stroke="var(--ref)"
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative h-7 overflow-hidden rounded-xs shadow-[inset_0_0_0_1px_var(--line-2)]">
        <div className="absolute inset-y-0 left-0" style={{ width: pct(24), background: "color-mix(in srgb, var(--meta) 35%, transparent)" }} />
        <div className="absolute inset-y-0" style={{ left: pct(24), width: pct(lower - 24), background: "color-mix(in srgb, var(--ref) 16%, transparent)" }} />
        <div className="absolute inset-y-0" style={{ left: pct(upper), width: pct(special - upper), background: "color-mix(in srgb, var(--ink) 8%, transparent)" }} />
        <div className="absolute inset-y-0 w-[2px]" style={{ left: pct(lp42), background: "var(--hot)" }} />
        <div className="absolute inset-y-0" style={{ left: pct(off), width: `max(3px, ${pct(len)})`, background: "var(--hot)" }} />
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-faint tabular">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2 text-hot" style={{ left: pct(off + len / 2) }}>
          {off}
        </span>
        <span className="absolute right-0">{special.toLocaleString("en-US")}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-faint">
        <span>
          <span className="text-meta">■</span> header, 24 B
        </span>
        <span>
          <span className="text-ref">■</span> line pointers, to byte {lower}
        </span>
        <span>free, {upper - lower} B</span>
        <span>
          <span className="text-hot">■</span> slot 42 and its tuple
        </span>
        <span>
          <span className="text-ref">→</span> lp_off
        </span>
      </div>
    </div>
  );
}
