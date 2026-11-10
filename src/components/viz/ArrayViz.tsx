type Tone = "ref" | "live" | "dead" | "meta" | "hot";

/**
 * a row of boxes. indices under, pointer labels under that.
 *
 *   <ArrayViz values={[3, 1, 4, 1, 5]} pointers={{ 0: "i", 4: "j" }} tones={{ 2: "hot" }} label="int[] a" />
 *   <ArrayViz values={["a", "b", null, null]} range={[0, 1, "live"]} capacity />
 *   <ArrayViz values={[10, 20, 30]} base={1} />     sql arrays: the printed indices start at 1
 *
 * pointers, tones, range and dim always use 0-based positions; base only changes the labels.
 */
export function ArrayViz({
  values,
  label,
  pointers = {},
  tones = {},
  range,
  indices = true,
  dim = [],
  cell = 44,
  base = 0,
}: {
  values: (string | number | boolean | null)[];
  label?: string;
  pointers?: Record<number, string>;
  tones?: Record<number, Tone>;
  /** [from, to, tone]: brackets a run of cells, inclusive */
  range?: [number, number, Tone?];
  indices?: boolean;
  /** indices to fade (unused capacity, removed slots) */
  dim?: number[];
  cell?: number;
  /** the first printed index: 1 for sql arrays (default 0) */
  base?: number;
}) {
  const inRange = (i: number) => range && i >= range[0] && i <= range[1];
  const rangeTone = range?.[2] ?? "live";
  return (
    <div className="inline-flex max-w-full flex-col gap-2 overflow-x-auto">
      {label && <div className="text-12 text-mute">{label}</div>}
      <div className="flex">
        {values.map((v, i) => {
          const tone = tones[i] ?? (inRange(i) ? rangeTone : undefined);
          return (
            <div key={i} className="flex flex-col items-center" style={{ width: cell }}>
              <div
                className={`-ml-px flex h-10 w-full items-center justify-center text-13 tabular transition-[background-color,box-shadow] duration-200 ${
                  dim.includes(i) ? "opacity-35" : ""
                }`}
                style={{
                  boxShadow: `inset 0 0 0 1px ${tone ? `var(--${tone})` : "var(--line-2)"}`,
                  background: tone ? `color-mix(in srgb, var(--${tone}) 12%, transparent)` : undefined,
                  color: v === null ? "var(--faint)" : tone ? `var(--${tone})` : "var(--hi)",
                  zIndex: tone ? 1 : 0,
                }}
              >
                {v === null ? "·" : String(v)}
              </div>
              {indices && <div className="mt-1 text-[10px] leading-3 text-faint tabular">{i + base}</div>}
              {pointers[i] && (
                <div className="mt-1 flex flex-col items-center text-11 leading-3 text-ref">
                  <span>↑</span>
                  <span className="mt-0.5">{pointers[i]}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
