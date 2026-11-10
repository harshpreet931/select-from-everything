// class strings shared by figures. plain values in a module without "use client": a server
// component importing a constant from a "use client" module gets a client reference (a
// function that throws), not the string. keep every constant and pure helper out of client
// modules for the same reason.

/**
 * put on every <table> a figure draws. inside an article, `.prose table/th/td` set width,
 * a serif header font, cell padding and borders; utilities win over that layer, so this
 * pins back what the figure doesn't set itself.
 */
export const FIG_TABLE =
  "[&_th]:[font-family:inherit] [&_th]:[font-size:inherit] [&_th]:[font-weight:400] [&_th]:[vertical-align:bottom] [&_td]:[vertical-align:middle] [&_td]:[border-bottom-width:0]";

/** narration and notes inside a figure: people read these, so they're serif. inline code stays mono. */
export const NARR =
  "font-serif text-[1.0625rem] leading-[1.6] text-ink [&_code]:font-mono [&_code]:text-[0.8em] [&_code]:text-hi [&_em]:italic";
