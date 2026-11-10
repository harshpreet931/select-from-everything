"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle, indentUnit } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { PostgreSQL, sql, type SQLNamespace } from "@codemirror/lang-sql";
import { tags as t } from "@lezer/highlight";

// a sql editor that looks like the rest of the site: monochrome, tokens only, so it follows the
// theme without re-creating the view. keywords complete in upper case; table and column names
// complete from the dataset's schema.

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.definitionKeyword], color: "var(--code-kw)" },
  { tag: [t.typeName, t.standard(t.name)], color: "var(--code-ty)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--code-fn)" },
  { tag: [t.string, t.special(t.string), t.character], color: "var(--code-str)" },
  { tag: [t.number, t.bool, t.null], color: "var(--code-lit)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--code-cmt)", fontStyle: "italic" },
  { tag: [t.punctuation, t.operator, t.bracket, t.separator], color: "var(--code-punc)" },
  { tag: [t.special(t.name), t.name, t.propertyName], color: "var(--ink)" },
]);

const theme = EditorView.theme({
  "&": { color: "var(--ink)", backgroundColor: "transparent", fontSize: "13px", height: "100%" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-code), ui-monospace, monospace", lineHeight: "1.75", overflow: "auto" },
  ".cm-content": { padding: "14px 0", caretColor: "var(--hi)" },
  ".cm-line": { padding: "0 20px 0 14px" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "var(--faint)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 0 0 12px", minWidth: "3ch", opacity: "0.6" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--ink) 4%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink)" },
  ".cm-cursor": { borderLeftColor: "var(--hi)", borderLeftWidth: "1.5px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--ref) 28%, transparent) !important",
  },
  ".cm-matchingBracket": { backgroundColor: "color-mix(in srgb, var(--hot) 20%, transparent)", outline: "none" },
  ".cm-tooltip": {
    backgroundColor: "var(--bg)",
    color: "var(--ink)",
    border: "1px solid var(--line-2)",
    borderRadius: "6px",
    fontFamily: "var(--font-code), ui-monospace, monospace",
    fontSize: "12px",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--well-2)", color: "var(--hi)" },
  ".cm-completionDetail": { color: "var(--faint)", fontStyle: "normal" },
});

export function SqlEditor({
  value,
  onChange,
  onRun,
  onRunStatement,
  schema,
  autoFocus,
  className,
  minHeight = 120,
  label = "sql editor",
}: {
  value: string;
  onChange: (v: string) => void;
  /** ⌘↵ / ctrl+↵: run everything */
  onRun?: () => void;
  /** ⇧⌘↵: run the statement under the cursor (offset in the text). falls back to onRun */
  onRunStatement?: (at: number) => void;
  /** tables and their columns, for completion */
  schema?: SQLNamespace;
  autoFocus?: boolean;
  className?: string;
  minHeight?: number;
  label?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef({ onChange, onRun, onRunStatement });
  useEffect(() => {
    cb.current = { onChange, onRun, onRunStatement };
  });

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ icons: false }),
          indentUnit.of("  "),
          EditorState.tabSize.of(2),
          sql({ dialect: PostgreSQL, upperCaseKeywords: true, schema }),
          syntaxHighlighting(highlight),
          theme,
          keymap.of([
            {
              key: "Shift-Mod-Enter",
              run: (ed) => {
                const f = cb.current.onRunStatement;
                if (f) f(ed.state.selection.main.head);
                else cb.current.onRun?.();
                return true;
              },
            },
            { key: "Mod-Enter", run: () => (cb.current.onRun?.(), true) },
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString());
          }),
          EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "false" }),
        ],
      }),
    });
    view.current = v;
    if (autoFocus) v.focus();
    return () => v.destroy();
    // the editor owns its state after mount; value changes from outside go through the effect below.
    // a new schema (another dataset) remounts the editor through its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // replace the doc when the parent swaps in different sql (examples, reset)
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} className={`cm-host ${className ?? ""}`} style={{ minHeight }} />;
}

/** a dataset's tables as a completion schema */
export function completionSchema(tables: { name: string; columns: { name: string }[] }[]): SQLNamespace {
  return Object.fromEntries(tables.map((t) => [t.name, t.columns.map((c) => c.name)]));
}
