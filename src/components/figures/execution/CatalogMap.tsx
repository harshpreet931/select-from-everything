"use client";

import { useState } from "react";
import { FIG_TABLE, Narration, Provenance, Row, Words, tint } from "@/components/figures/kit";
import { site } from "@/lib/site";

// four catalog tables, holding the rows that describe shop's customers table. pick a column:
// its pg_attribute row lights up, and the numbers in it lead to the rest: attrelid to the
// table's pg_class row, atttypid to its pg_type row, and the table's relnamespace to its schema.
// every row is real output from this page's run blocks. pointers are ref, the picked chain hot.

type Rows = (string | null)[][];
type Tab = { columns: string[]; rows: Rows };

function Mini({ name, t, hot, refs, note }: { name: string; t: Tab; hot: (r: (string | null)[]) => boolean; refs: string[]; note: string }) {
  return (
    <div className="grid min-w-0 content-start gap-1">
      <div className="flex items-baseline justify-between gap-2 text-11">
        <span className="text-meta">{name}</span>
        <span className="truncate text-faint">{note}</span>
      </div>
      <div className="min-w-0 overflow-x-auto rounded-md shadow-[inset_0_0_0_1px_var(--line)]">
        <table className={`w-full border-collapse text-11 @min-[520px]:text-12 ${FIG_TABLE}`}>
          <thead>
            <tr>
              {t.columns.map((c) => (
                <th key={c} className="border-b border-line px-2 py-1 text-left font-normal text-faint">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => {
              const on = hot(r);
              return (
                <tr key={i} className="transition-[background-color] duration-200 ease-sfe" style={{ background: on ? tint("hot", 10) : undefined }}>
                  {r.map((v, j) => (
                    <td key={j} className="px-2 py-0.5 whitespace-nowrap tabular" style={{ color: refs.includes(t.columns[j]) ? "var(--ref)" : on ? "var(--hi)" : "var(--ink)" }}>
                      {v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CatalogMap({ ns, cls, attrs, types }: { ns: Tab; cls: Tab; attrs: Tab; types: Tab }) {
  const col = (t: Tab, c: string) => t.columns.indexOf(c);
  const names = attrs.rows.map((r) => String(r[col(attrs, "attname")]));
  const [pick, setPick] = useState(names[1] ?? names[0]);
  const a = attrs.rows.find((r) => r[col(attrs, "attname")] === pick)!;
  const relid = a[col(attrs, "attrelid")];
  const typid = a[col(attrs, "atttypid")];
  const c = cls.rows.find((r) => r[col(cls, "oid")] === relid);
  const nsp = c?.[col(cls, "relnamespace")];
  const n = ns.rows.find((r) => r[col(ns, "oid")] === nsp);
  const t = types.rows.find((r) => r[col(types, "oid")] === typid);
  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 text-12">
      <Row k="column =" w="9ch" last>
        <Words label="a column of customers" options={names} value={pick} onChange={setPick} />
      </Row>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 @min-[640px]:grid-cols-2">
        <Mini name="pg_attribute" t={attrs} note="one row per column" refs={["attrelid", "atttypid"]} hot={(r) => r === a} />
        <Mini name="pg_type" t={types} note="one row per type" refs={[]} hot={(r) => r === t} />
        <Mini name="pg_class" t={cls} note="one row per table, index, sequence…" refs={["relnamespace"]} hot={(r) => r === c} />
        <Mini name="pg_namespace" t={ns} note="one row per schema" refs={[]} hot={(r) => r === n} />
      </div>
      <Narration minLines={2}>
        <code>customers.{pick}</code> is pg_attribute row ({relid}, {a[col(attrs, "attnum")]}). its <span className="text-ref">attrelid {relid}</span> is the pg_class row for {c?.[col(cls, "relname")]}, its{" "}
        <span className="text-ref">atttypid {typid}</span> is the type <code>{t?.[col(types, "typname")]}</code>, and the table&apos;s <span className="text-ref">relnamespace {nsp}</span> is the schema {n?.[col(ns, "nspname")]}.
      </Narration>
      <Provenance trace={{ engine: { version: site.pg.version, build: `PGlite ${site.pg.pglite}` }, scenario: "the run blocks on this page" }} />
    </div>
  );
}
