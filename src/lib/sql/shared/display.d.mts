export type TypeCategory = "num" | "bool" | "text" | "json" | "time" | "other";

export declare function typeCategory(type: string | null | undefined): TypeCategory;

export declare function displayCell(
  v: string | null,
  type: string,
  o?: { maxChars?: number },
): { text: string; isNull?: true; empty?: true; align: "left" | "right" };
