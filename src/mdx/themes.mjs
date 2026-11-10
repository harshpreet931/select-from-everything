// two code themes for shiki, warm and quiet like old print: slate keywords, sage
// strings, brown literals, soft italic comments. muted on purpose, so the bright
// semantic colours in figures (blue = reference, red = garbage...) still stand out.

const scopes = (s) => s.split(/\s+/).filter(Boolean);

function theme({ name, type, fg, bg, kw, ty, fn, lit, str, cmt, punc, anno }) {
  return {
    name,
    type,
    colors: { "editor.foreground": fg, "editor.background": bg },
    tokenColors: [
      { settings: { foreground: fg } },
      {
        scope: scopes("comment punctuation.definition.comment comment.line.double-dash.sql comment.block.sql"),
        settings: { foreground: cmt, fontStyle: "italic" },
      },
      {
        scope: scopes("string string.quoted punctuation.definition.string string.template"),
        settings: { foreground: str },
      },
      {
        scope: scopes(`
          keyword keyword.control keyword.operator.new keyword.other storage.modifier storage.type.primitive
          keyword.other.DML.sql keyword.other.DDL.sql keyword.other.sql keyword.other.order.sql keyword.other.alias.sql keyword.operator.logical.sql keyword.other.data-integrity.sql keyword.other.create.sql keyword.other.table.sql storage.type.var storage.type.local storage.type.record storage.type.enum storage.type.interface storage.type.class
          keyword.other.import keyword.other.package variable.language constant.language
          storage.type.annotation storage.modifier.import keyword.control.new`),
        settings: { foreground: kw },
      },
      {
        scope: scopes(`
          entity.name.type entity.name.class entity.other.inherited-class storage.type.generic
          storage.type.object storage.type.sql support.class support.type entity.name.type.class entity.name.type.interface
          entity.name.type.enum entity.name.type.record`),
        settings: { foreground: ty },
      },
      {
        scope: scopes("entity.name.function meta.method-call support.function support.function.aggregate.sql support.function.scalar.sql support.function.string.sql support.function.datetime.sql"),
        settings: { foreground: fn },
      },
      {
        scope: scopes(`constant.numeric constant.character constant.other.enum constant.language constant.language.boolean.sql constant.other.database-name.sql`),
        settings: { foreground: lit },
      },
      {
        scope: scopes(`
          punctuation punctuation.separator punctuation.terminator punctuation.bracket
          punctuation.section meta.brace keyword.operator punctuation.definition.parameters storage.type.function.arrow`),
        settings: { foreground: punc },
      },
      { scope: scopes("keyword.operator.new keyword.operator.instanceof"), settings: { foreground: kw } },
      { scope: scopes("storage.type.annotation punctuation.definition.annotation meta.declaration.annotation"), settings: { foreground: anno } },
      { scope: scopes("markup.inserted"), settings: { foreground: str } },
      { scope: scopes("markup.deleted"), settings: { foreground: cmt } },
    ],
  };
}

export const darkTheme = theme({
  name: "blackroom",
  type: "dark",
  fg: "#e4ded3",
  bg: "#201f1c",
  kw: "#a3b8c4",
  ty: "#dcc6ad",
  fn: "#e8d2b8",
  lit: "#d9b285",
  str: "#b3c49a",
  cmt: "#857e73",
  punc: "#a0968a",
  anno: "#a69f93",
});

export const lightTheme = theme({
  name: "paper",
  type: "light",
  fg: "#3a332c",
  bg: "#f7f3ec",
  kw: "#4f6878",
  ty: "#6e5444",
  fn: "#6a4f3c",
  lit: "#8b6237",
  str: "#55704a",
  cmt: "#a09888",
  punc: "#8a7e72",
  anno: "#7a6e62",
});
