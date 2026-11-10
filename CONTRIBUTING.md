# contributing

thanks for wanting to help :)

## the short version

1. every chapter is one file: `content/<part>/<chapter>.mdx`. the order and titles live in `src/content/curriculum.ts`.
2. read [DESIGN.md](./DESIGN.md) (how it looks) and [AUTHORING.md](./AUTHORING.md) (how it reads, every component, every rule).
3. open `content/basics/logical-order.mdx` next to your editor. that's the bar.
4. run the checks, look at your page, open a PR.

## setup

```bash
pnpm install
pnpm dev                 # http://localhost:3000
```

you need node 22.12+ and pnpm 10. that's enough for writing, running every sql block and the browser checks. for the native checks you also need postgres 18 binaries ([Postgres.app](https://postgresapp.com) on a mac, the PGDG `postgresql-18` package on linux, or `PG_BIN=/path/to/bin`). they start a throwaway server of their own on a unix socket and never touch one you're running.

## checks

```bash
pnpm check <part>                       # compiles chapters, lints the voice, checks imports and code-block flags
pnpm sql-check content/<part>           # runs every sql block on the in-browser engine, compares with the goldens
pnpm sql-check content/<part> --update  # writes goldens for new or changed blocks (review the diff)
pnpm pgtrace content/<part> --twice     # re-captures the part's internals traces, twice, on real postgres 18
pnpm typecheck                          # if you touched ts or tsx
pnpm build                              # the full static site + search index
```

CI runs check, sql-check, typecheck and build on every PR. a nightly job re-runs the sql blocks and the traces on the latest postgres 18 from PGDG.

## kinds of contributions

- **fix something wrong.** a wrong fact, a wrong output, a broken figure. these are the most valuable PRs. please say how you verified it (a run, the postgres docs or source, the SQL standard, a release note).
- **add a chapter or a figure.** something the book is missing, or a figure that would replace three paragraphs. open an issue first so two people don't build the same one.
- **capture something real.** a figure that says "postgres does X" needs a capture behind it: a pgtrace scenario (`tools/pgtrace/README.md`) or a sql block with a golden.
- **make a figure better.** figures live in `src/components/db/` and `src/components/figures/`. keep them dependency-free and token-coloured.
- **typos and voice.** if something reads like a corporate blog post, it's a bug.

## what we won't merge

- text copied from books, the postgres docs, blog posts or other courses. explain it in your own words.
- figures that use colour as decoration. every colour on this site means one thing (see DESIGN.md).
- claims about postgres internals, versions or performance without a capture, a source or a measurement.
- "postgres does" when it's only what the standard allows, or the other way round.
- em dashes. seriously.
