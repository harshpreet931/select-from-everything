import type { SqlRunView, StatementResult } from "../types";
export { displayCell, typeCategory } from "./display.mjs";

export type Mask = [RegExp, string][];
export const MASKS: { timing: Mask; native: Mask; none: Mask };
export function isPlan(r: Pick<StatementResult, "columns">): boolean;
export function toPsql(r: StatementResult): string;
export function viewToPsql(view: SqlRunView): string;
export function canonicalStatement(r: StatementResult, flags?: { unordered?: boolean; volatile?: boolean }, mask?: Mask): string;
export function canonical(view: SqlRunView, flags?: { unordered?: boolean; volatile?: boolean }, mask?: Mask): string;
export function digest(s: string): string;
