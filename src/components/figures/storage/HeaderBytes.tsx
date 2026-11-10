import type { PgTrace } from "@/lib/db/pgtrace";
import { FIG_TABLE, Legend, Provenance, fmt, ring, tint } from "@/components/figures/kit";
import { prov, records } from "./source";

// the first bytes of a real heap page, field by field: the 24-byte page header, then the line
// pointers. every byte is the capture's (encode(substr(get_raw_page(...)), 'hex')); the values
// are those bytes decoded (little-endian), and the header's are checked against page_header().
//
//   <HeaderBytes trace={pageBytes} />   (traces/page-bytes: steps 1 = page_header, 2 = hex, 3 = items)

type Field = { name: string; bytes: string[]; value: string; note: string; tone: "meta" | "ref" };

const le = (bytes: string[]) => bytes.reduceRight((n, b) => n * 256 + parseInt(b, 16), 0);
const pairs = (hex: string) => hex.match(/../g) ?? [];

export function HeaderBytes({ trace }: { trace: PgTrace }) {
  const head = records(trace.steps[1])[0] ?? {};
  const raw = records(trace.steps[2])[0] ?? {};
  const h = pairs(raw.header ?? "");
  const lps = pairs(raw.line_pointers ?? "");
  const hi = le(h.slice(0, 4));
  const lo = le(h.slice(4, 8));
  const lsn = `${hi.toString(16).toUpperCase()}/${lo.toString(16).toUpperCase()}`;
  const psv = le(h.slice(18, 20));
  const fields: Field[] = [
    { name: "pd_lsn", bytes: h.slice(0, 8), value: lsn, note: `the WAL position of the last change to this page. page_header() says ${head.lsn}`, tone: "meta" },
    { name: "pd_checksum", bytes: h.slice(8, 10), value: fmt(le(h.slice(8, 10))), note: "a checksum of the page, computed when it's written out", tone: "meta" },
    { name: "pd_flags", bytes: h.slice(10, 12), value: String(le(h.slice(10, 12))), note: "a few hint bits about the whole page", tone: "meta" },
    { name: "pd_lower", bytes: h.slice(12, 14), value: String(le(h.slice(12, 14))), note: "where the line pointer array ends", tone: "meta" },
    { name: "pd_upper", bytes: h.slice(14, 16), value: fmt(le(h.slice(14, 16))), note: "where the tuples start", tone: "meta" },
    { name: "pd_special", bytes: h.slice(16, 18), value: fmt(le(h.slice(16, 18))), note: "where the special space starts. 8192 means none: heap pages don't use it", tone: "meta" },
    { name: "pd_pagesize_version", bytes: h.slice(18, 20), value: `${fmt(psv & 0xff00)} | ${psv & 0xff}`, note: "page size and layout version, in one field", tone: "meta" },
    { name: "pd_prune_xid", bytes: h.slice(20, 24), value: String(le(h.slice(20, 24))), note: "the oldest xid that might have left something to prune. 0: nothing", tone: "meta" },
  ];
  for (let i = 0; i * 4 < lps.length; i++) {
    const b = lps.slice(i * 4, i * 4 + 4);
    const v = le(b);
    const off = v & 0x7fff;
    const flags = (v >>> 15) & 3;
    const len = v >>> 17;
    fields.push({ name: `line pointer ${i + 1}`, bytes: b, value: `off ${fmt(off)} · flags ${flags} · len ${len}`, note: "15 bits of offset, 2 bits of flags (1 = normal), 15 bits of length", tone: "ref" });
  }
  let at = 0;
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <table className={`w-full border-collapse text-11 @min-[560px]:text-12 ${FIG_TABLE}`} aria-label="the first 36 bytes of the page, decoded">
        <thead>
          <tr className="text-left text-faint">
            <th className="hidden border-b border-line px-1.5 py-1 font-mono font-normal @min-[440px]:table-cell">byte</th>
            <th className="border-b border-line px-1.5 py-1 font-mono font-normal">field</th>
            <th className="border-b border-line px-1.5 py-1 font-mono font-normal">raw bytes</th>
            <th className="border-b border-line px-1.5 py-1 text-right font-mono font-normal">value</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const start = at;
            at += f.bytes.length;
            return (
              <tr key={f.name} className="border-t border-line align-top" title={f.note}>
                <td className="hidden px-1.5 py-1.5 text-faint tabular @min-[440px]:table-cell">{start}</td>
                <td className="px-1.5 py-1.5" style={{ color: `var(--${f.tone})` }}>
                  {f.name}
                  <div className="hidden font-serif text-[0.95rem] leading-snug text-mute italic @min-[640px]:block">{f.note}</div>
                </td>
                <td className="px-1.5 py-1.5">
                  <span className="inline-flex flex-wrap gap-[3px]">
                    {f.bytes.map((b, i) => (
                      <span key={i} className="rounded-[3px] px-[3px] leading-[18px] tabular" style={{ boxShadow: ring(f.tone, 45), background: tint(f.tone, b === "00" ? 3 : 10), color: b === "00" ? "var(--faint)" : "var(--hi)" }}>
                        {b}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="px-1.5 py-1.5 text-right text-hi tabular @min-[560px]:whitespace-nowrap">{f.value}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Legend
        items={[
          ["meta", "page header, 24 bytes"],
          ["ref", "line pointers, 4 bytes each"],
        ]}
      />
      <Provenance trace={prov(trace)} />
    </div>
  );
}
