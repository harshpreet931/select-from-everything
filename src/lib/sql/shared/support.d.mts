/** extension bundles shipped to the browser engine */
export const EXTENSIONS: string[];
/** null when the browser engine can run it, otherwise a short lowercase reason */
export function sqlCantRun(code: string): string | null;
/** null when the browser's answer should match a real server, otherwise one line */
export function sqlCaveat(code: string): string | null;
