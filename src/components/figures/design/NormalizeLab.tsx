"use client";

import { useMemo, useState, type ReactNode } from "react";
import { FIG_TABLE, Legend, Narration, Provenance, Words, tint, tv, type Ink } from "@/components/figures/kit";

// the update, delete and insert anomalies, by hand. the rows are captured from postgres (the
// wide table and the two tables it splits into); the reader's edits happen in this page only,
// and the sql blocks under the figure run the same edits on the real engine. in the wide table
// every order line carries its customer's address, so editing one copy makes the copies
// disagree (dead). after the split the address lives in one row, and the join reads it from there.

type Col = { name: string; type?: string };
type Tbl = { columns: Col[]; rows: (string | null)[][] };

export function NormalizeLab({
  wide,
  customers,
  lines,
  who = "customer",
  custWho = "name",
  what = "address",
  newcomer,
  trace,
}: {
  /** the denormalized table: one row per order line, customer columns repeated */
  wide: Tbl;
  /** after the split: one row per customer (id, name, address) */
  customers: Tbl;
  /** after the split: the order lines, pointing at customers by id (order_id, sku, customer_id) */
  lines: Tbl;
  /** the column naming the customer in the wide table and in customers */
  who?: string;
  /** the column naming the customer in customers */
  custWho?: string;
  /** the column that's repeated, and editable */
  what?: string;
  /** a customer with no orders yet, for the insert anomaly: [name, address] */
  newcomer: [string, string];
  trace?: { engine?: { version?: string; build?: string }; scenario?: string };
}) {
  const [mode, setMode] = useState<"wide" | "split">("wide");
  const wi = wide.columns.findIndex((c) => c.name === who);
  const ai = wide.columns.findIndex((c) => c.name === what);
  const ci = customers.columns.findIndex((c) => c.name === custWho);
  const cai = customers.columns.findIndex((c) => c.name === what);
  const [wRows, setWRows] = useState(() => wide.rows.map((r) => [...r]));
  const [gone, setGone] = useState<(string | null)[][]>([]);
  const [cRows, setCRows] = useState(() => customers.rows.map((r) => [...r]));
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const [tried, setTried] = useState(false);
  const [note, setNote] = useState<ReactNode>(null);

  const reset = () => {
    setWRows(wide.rows.map((r) => [...r]));
    setGone([]);
    setCRows(customers.rows.map((r) => [...r]));
    setEdited(new Set());
    setTried(false);
    setNote(null);
  };

  // per customer: the distinct addresses the wide table holds
  const answers = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of wRows) {
      const k = String(r[wi]);
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(String(r[ai]));
    }
    return m;
  }, [wRows, wi, ai]);
  const split = [...answers.entries()].filter(([, s]) => s.size > 1);

  const editWide = (i: number, v: string) => {
    setWRows((rs) => rs.map((r, j) => (j === i ? r.map((c, k) => (k === ai ? v : c)) : r)));
    setEdited((s) => new Set(s).add(`w${i}`));
    setNote(null);
  };
  const delWide = (i: number) => {
    const row = wRows[i];
    const rest = wRows.filter((_, j) => j !== i);
    setWRows(rest);
    setGone((g) => [...g, row]);
    setEdited(new Set());
    const name = String(row[wi]);
    if (!rest.some((r) => String(r[wi]) === name)) {
      setNote(
        <>
          <span className="text-dead">a delete anomaly.</span> that was {name}&apos;s only order line, so {name}, and the only copy of the address, went with it. the table forgot a customer because an order went away.
        </>,
      );
    } else setNote(<>one line gone. {name} still has {rest.filter((r) => String(r[wi]) === name).length} rows, each with its own copy of the address.</>);
  };
  const editCust = (i: number, v: string) => {
    setCRows((rs) => rs.map((r, j) => (j === i ? r.map((c, k) => (k === cai ? v : c)) : r)));
    setEdited((s) => new Set(s).add(`c${i}`));
    setNote(null);
  };
  const addNewcomer = () => {
    setTried(true);
    if (mode === "split") {
      if (!cRows.some((r) => r[ci] === newcomer[0])) {
        const id = String(Math.max(...cRows.map((r) => Number(r[0]))) + 1);
        setCRows((rs) => [...rs, customers.columns.map((c) => (c.name === custWho ? newcomer[0] : c.name === what ? newcomer[1] : c.name === "id" ? id : null))]);
      }
      setNote(<>{newcomer[0]} is a customer now, one row in customers, with no order lines. nothing else had to exist first.</>);
    } else {
      setNote(
        <>
          <span className="text-dead">an insert anomaly.</span> {newcomer[0]} hasn&apos;t ordered anything, and every row here is an order line. the key is (order_id, sku), and a key can&apos;t be NULL, so there&apos;s no row to put her in.
        </>,
      );
    }
  };

  // the join after the split, recomputed from the rows on screen
  const joined = useMemo(() => {
    const byId = new Map(cRows.map((r, i) => [String(r[0]), { r, i }]));
    return lines.rows.map((l) => {
      const c = byId.get(String(l[2]));
      return { cells: [l[0], l[1], c?.r[ci] ?? null, c?.r[cai] ?? null], changed: c ? edited.has(`c${c.i}`) : false };
    });
  }, [cRows, lines.rows, ci, cai, edited]);

  const headCell = (c: Col, j: number) => (
    <th key={j} scope="col" className="border-b border-line-2 px-3 pt-2 pb-1.5 text-left font-normal whitespace-nowrap">
      <span className="text-hi">{c.name}</span>
      {c.type && <span className="ml-1.5 text-11 text-faint">{c.type}</span>}
    </th>
  );
  const box = (label: ReactNode, body: ReactNode, right?: ReactNode) => (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-11 text-faint">
        <span>{label}</span>
        {right}
      </div>
      <div className="min-w-0 overflow-hidden rounded-md bg-well shadow-[inset_0_0_0_1px_var(--line)]">
        <div className="overflow-x-auto">{body}</div>
      </div>
    </div>
  );
  const input = (v: string | null, on: (v: string) => void, tone: Ink | null, label: string) => (
    <input
      value={v ?? ""}
      onChange={(e) => on(e.target.value)}
      aria-label={label}
      spellCheck={false}
      size={Math.max(14, (v ?? "").length + 1)}
      className="rounded-xs bg-transparent px-1 py-0.5 font-mono text-12 outline-none focus:shadow-[inset_0_0_0_1px_var(--hot)]"
      style={{ color: tone ? tv(tone) : "var(--ink)", boxShadow: tone ? undefined : "inset 0 -1px 0 var(--line-2)" }}
    />
  );

  const wideTable = (
    <table className={`w-full border-collapse text-12 leading-[1.5] ${FIG_TABLE}`}>
      <caption className="sr-only">the wide table: one row per order line, the address copied into each</caption>
      <thead>
        <tr>
          {wide.columns.map(headCell)}
          <th className="border-b border-line-2" aria-label="delete" />
        </tr>
      </thead>
      <tbody>
        {wRows.map((r, i) => {
          const many = (answers.get(String(r[wi]))?.size ?? 0) > 1;
          const tone: Ink | null = many ? "dead" : edited.has(`w${i}`) ? "hot" : null;
          return (
            <tr key={`${r[0]}-${r[1]}`} style={{ background: many ? tint("dead", 8) : undefined, boxShadow: many ? `inset 2px 0 0 ${tv("dead")}` : undefined }}>
              {r.map((c, j) => (
                <td key={j} className={`border-t border-line px-3 py-[3px] whitespace-nowrap tabular ${j === ai ? "px-2" : ""}`}>
                  {j === ai ? input(c, (v) => editWide(i, v), tone, `${what} of ${r[wi]} on order ${r[0]}`) : <span className="text-ink">{c}</span>}
                </td>
              ))}
              <td className="border-t border-line px-2 text-right">
                <button type="button" className="text-11 text-faint hover:text-dead" onClick={() => delWide(i)} aria-label={`delete order line ${r[0]} ${r[1]}`} title="delete this order line">
                  ×
                </button>
              </td>
            </tr>
          );
        })}
        {gone.map((r, i) => (
          <tr key={`g${i}`} style={{ opacity: 0.4 }} aria-label="deleted">
            {r.map((c, j) => (
              <td key={j} className="border-t border-line px-3 py-[3px] whitespace-nowrap line-through">
                {c}
              </td>
            ))}
            <td className="border-t border-line" />
          </tr>
        ))}
        {tried && mode === "wide" && (
          <tr style={{ background: tint("dead", 8), boxShadow: `inset 2px 0 0 ${tv("dead")}` }} aria-label="refused">
            {wide.columns.map((c, j) => (
              <td key={j} className="border-t border-line px-3 py-[3px] whitespace-nowrap" style={{ color: c.name === who || c.name === what ? "var(--dead)" : "var(--faint)", fontStyle: c.name === who || c.name === what ? undefined : "italic" }}>
                {c.name === who ? newcomer[0] : c.name === what ? newcomer[1] : "null"}
              </td>
            ))}
            <td className="border-t border-line" />
          </tr>
        )}
      </tbody>
    </table>
  );

  const custTable = (
    <table className={`w-full border-collapse text-12 leading-[1.5] ${FIG_TABLE}`}>
      <caption className="sr-only">customers: one row each, the only copy of the address</caption>
      <thead>
        <tr>{customers.columns.map(headCell)}</tr>
      </thead>
      <tbody>
        {cRows.map((r, i) => {
          const isNew = i >= customers.rows.length;
          return (
            <tr key={i} style={{ background: isNew ? tint("live", 10) : undefined, boxShadow: isNew ? `inset 2px 0 0 ${tv("live")}` : undefined }}>
              {r.map((c, j) => (
                <td key={j} className={`border-t border-line px-3 py-[3px] whitespace-nowrap tabular ${j === cai ? "px-2" : ""}`}>
                  {j === cai ? input(c, (v) => editCust(i, v), edited.has(`c${i}`) ? "hot" : null, `${what} of ${r[ci]}`) : <span className="text-ink">{c}</span>}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const joinTable = (
    <table className={`w-full border-collapse text-12 leading-[1.5] ${FIG_TABLE}`}>
      <caption className="sr-only">order lines joined to customers</caption>
      <thead>
        <tr>{[{ name: "order_id" }, { name: "sku" }, { name: custWho }, { name: what }].map(headCell)}</tr>
      </thead>
      <tbody>
        {joined.map((r, i) => (
          <tr key={i}>
            {r.cells.map((c, j) => (
              <td key={j} className="border-t border-line px-3 py-[3px] whitespace-nowrap tabular" style={{ color: j === 3 && r.changed ? "var(--hot)" : "var(--ink)", background: j === 3 && r.changed ? tint("hot", 12) : undefined }}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const status =
    mode === "wide" ? (
      split.length ? (
        <>
          <span className="text-dead">an update anomaly.</span> {split.map(([k, s]) => `${k} now has ${s.size} addresses`).join(", ")} in this table. one fact, stored in several rows, and the rows disagree. which one do you ship to?
        </>
      ) : (
        <>
          every order line carries a copy of the address. edit one copy (or press × to delete an order line, or add a customer who hasn&apos;t ordered).
        </>
      )
    ) : (
      <>after the split the address is in one row of customers. edit it, and every order line that joins to it reads the new value: there&apos;s nothing to disagree with.</>
    );

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-label="edit the repeated address and watch the copies disagree">
      <div className="flex flex-wrap items-center justify-between gap-2 text-12">
        <div className="flex items-center gap-3">
          <span className="text-faint">schema =</span>
          <Words
            label="schema"
            options={[
              { v: "wide", label: "one wide table" },
              { v: "split", label: "split in two" },
            ]}
            value={mode}
            onChange={(v) => {
              setMode(v as "wide" | "split");
              setNote(null);
              setTried(false);
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="act" onClick={addNewcomer}>
            add {newcomer[0]}
          </button>
          <button type="button" className="act" onClick={reset}>
            reset
          </button>
        </div>
      </div>
      {mode === "wide" ? (
        box(<>orders_wide, one row per order line</>, wideTable, <span className="tabular">{wRows.length} rows</span>)
      ) : (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          {box(<>customers: the address lives here, once</>, custTable)}
          {box(<>order_lines JOIN customers: every line reads the one address</>, joinTable)}
        </div>
      )}
      <Narration minLines={3}>{note ?? status}</Narration>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <Legend
          items={[
            ["hot", "you edited it"],
            ...(mode === "wide" ? ([["dead", "copies that disagree"]] as [Ink, string][]) : ([["live", "new row"]] as [Ink, string][])),
          ]}
        />
        <div className="grid justify-items-end">
          {trace && <Provenance trace={trace} />}
          <span className="text-[10px] leading-4 text-faint">your edits stay in this page; the blocks below run them on postgres</span>
        </div>
      </div>
    </div>
  );
}
