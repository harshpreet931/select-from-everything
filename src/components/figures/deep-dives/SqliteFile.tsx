import { Legend, Provenance, ring, tint, type Ink } from "@/components/figures/kit";

// a sqlite database file as a strip of its pages, numbered from 1, each tagged with the b-tree
// page type its first header byte says (0x0d leaf table, 0x05 interior table, 0x0a leaf index,
// 0x02 interior index) and its cell count. data comes from a recorded xxd of a real file.

export type SqlitePage = { p: number; type: "0d" | "05" | "0a" | "02"; cells: number };

const KIND: Record<SqlitePage["type"], { label: string; short: string; ink: Ink; fill?: "ref" | "meta" }> = {
  "0d": { label: "leaf table page (rows)", short: "rows", ink: "ink" },
  "05": { label: "interior table page", short: "int", ink: "meta", fill: "meta" },
  "0a": { label: "leaf index page", short: "idx", ink: "ref", fill: "ref" },
  "02": { label: "interior index page", short: "int", ink: "ref", fill: "ref" },
};

export function SqliteFile({ pages, recorded, owners }: { pages: SqlitePage[]; recorded: string; owners: Record<number, string> }) {
  return (
    <div className="grid min-w-0 gap-3 font-mono text-11">
      <div className="grid gap-1.5 grid-cols-[repeat(auto-fill,minmax(52px,1fr))]" role="img" aria-label={`a sqlite file of ${pages.length} pages: page 1 holds the header and the schema, page 2 is the table's root, page 3 the index's root`}>
        {pages.map((pg) => {
          const k = KIND[pg.type];
          const root = owners[pg.p];
          return (
            <div
              key={pg.p}
              title={`page ${pg.p}: ${k.label}, ${pg.cells} cells${root ? `, root of ${root}` : ""}`}
              className="flex min-h-[52px] flex-col justify-between rounded-[4px] px-1.5 py-1"
              style={{
                background: pg.p === 1 ? tint("meta", 14) : k.fill ? tint(k.fill, pg.type === "05" || pg.type === "02" ? 18 : 9) : "var(--well-2)",
                boxShadow: root ? ring(k.ink === "ink" ? "hi" : k.ink, undefined, 1.5) : ring("line-2"),
              }}
            >
              <span className="text-faint">{pg.p}</span>
              <span className="text-hi">{pg.p === 1 ? "hdr" : k.short}</span>
              <span className="text-[10px] text-mute">{pg.cells}</span>
            </div>
          );
        })}
      </div>
      <div className="grid gap-1 text-mute">
        {Object.entries(owners).map(([p, name]) => (
          <div key={p}>
            page {p}: root of <span className="text-hi">{name}</span>
          </div>
        ))}
      </div>
      <Legend
        items={[
          ["meta", "page 1: 100-byte file header + sqlite_schema"],
          ["ink", "leaf table page: the rows"],
          ["meta", "interior table page"],
          ["ref", "index page"],
        ]}
      />
      <Provenance recorded={recorded} />
    </div>
  );
}
