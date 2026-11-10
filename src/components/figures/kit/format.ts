// numbers, the way the book prints them. thousands separators, real units, LSNs the
// way postgres 18 prints them (%X/%X, no padding), TIDs as (block,offset).

import type { Tid } from "@/lib/db/views";

export const fmt = (n: number, digits = 0): string =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits }) : String(n);

export function bytes(n: number): string {
  if (n < 1024) return `${fmt(n)} B`;
  if (n < 1024 * 1024) return `${fmt(n / 1024, n % 1024 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${fmt(n / 1024 ** 2, 1)} MB`;
  return `${fmt(n / 1024 ** 3, 1)} GB`;
}

/** 24,150,016 → "0/1708000" (pg_lsn output) */
export function lsn(n: number): string {
  const hi = Math.floor(n / 2 ** 32);
  const lo = n % 2 ** 32;
  return `${hi.toString(16).toUpperCase()}/${lo.toString(16).toUpperCase()}`;
}

/** an LSN as an offset from a base, "+0x0A8": small numbers you can compare at a glance. */
export function lsnOff(n: number, base: number): string {
  const d = n - base;
  const s = Math.abs(d).toString(16).toUpperCase().padStart(3, "0");
  return `${d < 0 ? "-" : "+"}0x${s}`;
}

/** "0/1782C00" → number */
export function parseLsn(s: string): number {
  const [hi, lo] = s.split("/");
  return parseInt(hi, 16) * 2 ** 32 + parseInt(lo, 16);
}

export const tid = (t: Tid | null | undefined): string => (t ? `(${t[0]},${t[1]})` : "·");

/** "(0,3)" → [0, 3] */
export function parseTid(s: string): Tid {
  const m = /\((\d+),(\d+)\)/.exec(s);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

export { rng } from "@/lib/db/sim/rand";

export const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
