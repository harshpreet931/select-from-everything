export type SplitStatement = { sql: string; offset: number; end: number; line: number; col: number };
/** psql-style split: one entry per statement, comments between statements skipped */
export function splitSql(text: string): SplitStatement[];
/** strings, identifiers, dollar quotes and comments blanked to spaces (offsets kept) */
export function maskSql(text: string): string;
/** maskSql plus everything inside parentheses blanked: the statement's top level */
export function topLevelSql(text: string): string;
export function statementAt(stmts: SplitStatement[], at: number): SplitStatement | null;
/** server error position (1-based characters in the statement) → utf-16 offset in the block */
export function positionToOffset(sql: string, offset: number, position: number): number;
export function lineCol(text: string, at: number): { line: number; col: number };
