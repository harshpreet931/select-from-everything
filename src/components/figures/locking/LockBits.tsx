import { FIG_TABLE, Provenance, ring, tint } from "@/components/figures/kit";

// server side, static: which of the row-lock bits are set in each tuple header. the values are
// the t_infomask / t_infomask2 numbers a runnable block returned (the chapter's golden), decoded
// here bit by bit; the bit positions are postgres's (htup_details.h), and pageinspect's
// heap_tuple_infomask_flags names them the same way in the same golden.

const BITS: { name: string; field: 0 | 1; mask: number; tone: "meta" | "hot" }[] = [
  { name: "XMAX_KEYSHR_LOCK", field: 0, mask: 0x0010, tone: "meta" },
  { name: "XMAX_EXCL_LOCK", field: 0, mask: 0x0040, tone: "meta" },
  { name: "XMAX_LOCK_ONLY", field: 0, mask: 0x0080, tone: "meta" },
  { name: "XMAX_IS_MULTI", field: 0, mask: 0x1000, tone: "meta" },
  { name: "KEYS_UPDATED", field: 1, mask: 0x2000, tone: "hot" },
];

const hex = (n: number) => `0x${n.toString(16).padStart(4, "0")}`;

export function LockBits({ rows, labels }: { rows: (string | number)[][]; labels: string[] }) {
  return (
    <div className="grid min-w-0 gap-2 grid-cols-[minmax(0,1fr)]">
      <div className="min-w-0 overflow-x-auto">
        <table className={`w-full border-collapse text-11 tabular ${FIG_TABLE}`} aria-label="row lock bits per strength">
          <thead>
            <tr>
              <th className="border-0 px-2 py-1 text-left text-faint">row · strength</th>
              {BITS.map((b) => (
                <th key={b.name} className="border-0 px-1 py-1 text-center text-mute">
                  <span className="block whitespace-nowrap">{b.name.replace(/_/g, "_​")}</span>
                  <span className="block text-[10px] text-faint">
                    {b.field ? "infomask2" : "infomask"} {hex(b.mask)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const v = [Number(r[1]), Number(r[2])];
              return (
                <tr key={i} className="border-t border-line">
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className="text-faint">{r[0]}</span> <span className="text-hi">{labels[i]}</span>
                  </td>
                  {BITS.map((b) => {
                    const on = (v[b.field] & b.mask) !== 0;
                    return (
                      <td key={b.name} className="p-1 text-center">
                        <span
                          className="inline-flex h-6 min-w-10 items-center justify-center rounded-xs px-1"
                          style={{ background: on ? tint(b.tone, 16) : undefined, boxShadow: on ? ring(b.tone, 60) : ring("line") }}
                          aria-label={`${b.name} ${on ? "set" : "not set"}`}
                        >
                          <span style={{ color: on ? `var(--${b.tone})` : "var(--faint)" }}>{on ? "1" : "0"}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Provenance trace={{ engine: { version: "18.6", build: "PGlite 0.5.12" }, scenario: "this page's first block" }} />
    </div>
  );
}
