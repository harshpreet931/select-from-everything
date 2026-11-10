"use client";

import { useMemo, useState } from "react";
import { Chip, Legend, NARR, Provenance, Row, Slider, Words, fmt, tint } from "@/components/figures/kit";

// a model of a shard map over real data. the load is the real number of events per user (and in
// the dataset's last week, standing in for today's writes) from traces/shard-keys, and the hash is
// postgres's hashint4(user_id) from the same capture. which shard a user lands on is this figure's
// arithmetic: hash mod n, equal id ranges, or 64 fixed slots handed out to shards.

type Key = "hash(user_id)" | "range(user_id)" | "range(time)";
type MapKind = "hash mod n" | "64 slots";
const SLOTS = 64;

/** slot → shard for n shards, built up one shard at a time: each new shard takes slots from the fullest ones */
function slotOwners(n: number): number[] {
  let own = Array(SLOTS).fill(0);
  for (let k = 2; k <= n; k++) {
    const want = Math.floor(SLOTS / k);
    const next = [...own];
    for (let taken = 0; taken < want; taken++) {
      const counts = Array(k - 1).fill(0);
      next.forEach((o) => o < k - 1 && counts[o]++);
      const from = counts.indexOf(Math.max(...counts));
      const idx = next.lastIndexOf(from);
      next[idx] = k - 1;
    }
    own = next;
  }
  return own;
}

export function ShardMap({ users, months }: { users: (string | null)[][]; months: (string | null)[][] }) {
  const [key, setKey] = useState<Key>("hash(user_id)");
  const [kind, setKind] = useState<MapKind>("hash mod n");
  const [n, setN] = useState(4);
  const [load, setLoad] = useState<"all events" | "last week's writes">("all events");
  const us = useMemo(() => users.map((r) => ({ id: Number(r[0]), all: Number(r[1]), week: Number(r[2]), h: Number(r[3]) })), [users]);
  const shards = key === "range(time)" ? months.length : n;
  const place = (u: { id: number; h: number }, count: number): number => {
    if (key === "range(user_id)") return Math.min(count - 1, Math.floor(((u.id - 1) * count) / us.length));
    if (kind === "64 slots") return slotOwners(count)[((u.h % SLOTS) + SLOTS) % SLOTS];
    return ((u.h % count) + count) % count;
  };
  const totals = useMemo(() => {
    if (key === "range(time)") return months.map((m) => (load === "all events" ? Number(m[1]) : Number(m[2])));
    const t = Array(shards).fill(0);
    us.forEach((u) => (t[place(u, shards)] += load === "all events" ? u.all : u.week));
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind, n, load, us, months]);
  const sum = totals.reduce((a, b) => a + b, 0);
  const mean = sum / totals.length;
  const max = Math.max(...totals);
  const hot = totals.indexOf(max);
  // resharding: who moves going from n to n + 1
  const moved = useMemo(() => {
    if (key === "range(time)") return null;
    let users = 0;
    let events = 0;
    us.forEach((u) => {
      if (place(u, n) !== place(u, n + 1)) {
        users++;
        events += u.all;
      }
    });
    return { users, events };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind, n, us]);
  const allSum = us.reduce((a, u) => a + u.all, 0);
  const busiest = us.reduce((a, b) => (b.all > a.all ? b : a));
  return (
    <div className="@container grid min-w-0 gap-3 text-12 grid-cols-[minmax(0,1fr)]">
      <div>
        <Row k="shard key =" w="11ch">
          <Words label="shard key" options={["hash(user_id)", "range(user_id)", "range(time)"] as Key[]} value={key} onChange={setKey} />
        </Row>
        {key === "hash(user_id)" && (
          <Row k="map =" w="11ch">
            <Words label="hash map" options={["hash mod n", "64 slots"] as MapKind[]} value={kind} onChange={setKind} />
          </Row>
        )}
        <Row k="shards =" w="11ch">
          {key === "range(time)" ? <span className="text-mute">one per month: {months.length}</span> : <Slider k="shards" min={2} max={8} value={n} onChange={setN} />}
        </Row>
        <Row k="load =" w="11ch" last>
          <Words label="load" options={["all events", "last week's writes"] as const} value={load} onChange={setLoad} />
        </Row>
      </div>
      <div className="grid gap-1.5" role="img" aria-label={`${shards} shards; the busiest holds ${fmt(max)} of ${fmt(sum)}, ${(max / mean).toFixed(2)} times the average`}>
        {totals.map((v, i) => (
          <div key={i} className="grid grid-cols-[9ch_minmax(0,1fr)_7ch] items-center gap-2">
            <span className={i === hot ? "text-hot" : "text-mute"}>{key === "range(time)" ? String(months[i][0]).slice(0, 7) : `shard ${i + 1}`}</span>
            <div className="relative h-4 rounded-xs bg-well-2">
              <div className="absolute inset-y-0 left-0 rounded-xs transition-[width] duration-300 ease-sfe" style={{ width: `${max ? (v / max) * 100 : 0}%`, background: i === hot && max > mean * 1.15 ? "var(--hot)" : "var(--mute)" }} />
              <div className="absolute inset-y-[-2px] w-px bg-ink opacity-60" style={{ left: `${max ? (mean / max) * 100 : 0}%` }} title="the average shard" />
            </div>
            <span className="text-right tabular text-hi">{fmt(v)}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip tone={max > mean * 1.15 ? "hot" : undefined}>busiest / average: {(max / mean || 0).toFixed(2)}×</Chip>
        {moved && (
          <Chip tone={moved.users / us.length > 0.4 ? "dead" : "live"} className="!whitespace-normal">
            add shard {n + 1}: {fmt(moved.users)} of {us.length} users move ({Math.round((moved.events / allSum) * 100)}% of events)
          </Chip>
        )}
      </div>
      <p className={NARR} aria-live="polite">
        {key === "range(time)"
          ? load === "last week's writes"
            ? `every write from the last week lands on the newest month. one shard does all the inserting while the others sit idle: the classic hot shard.`
            : `stored data is even, because months are even. the trouble is where new writes go: switch to last week's writes.`
          : key === "range(user_id)"
            ? `equal id ranges aren't equal load: low user ids are the busy ones in this dataset, so the first range carries the most. range keys keep neighbours together, which is good for range queries and bad for skew.`
            : kind === "hash mod n"
              ? `hashing spreads users evenly, but not their activity: user ${busiest.id} alone has ${fmt(busiest.all)} events, and their shard carries all of them. and changing n reshuffles most users.`
              : `the same hash, but into 64 slots that shards own. adding a shard moves a few slots, not most users.`}
      </p>
      <Legend items={[["hot", "the busiest shard"], ["ink", "the average shard", "line"]]} />
      <Provenance sim="model: shard placement is this figure's arithmetic; per-user event counts and hashint4 values are real output from the events dataset" />
    </div>
  );
}
