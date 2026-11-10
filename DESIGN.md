---
version: 2
name: select * from everything
description: A book you can poke at. Warm paper, a serif for reading, mono for code and figures, quiet ornaments, and five colours that only ever mean one thing.
colors:
  paper: "#fdfbf7"
  ink: "#2a2723"
  hi: "#141210"
  mute: "#6d675f"
  faint: "#8c8579"
  line: "#ece6dc"
  line-2: "#ddd5c8"
  well: "#f7f3ec"
  accent: "#8b7355"
  accent-2: "#b09a7e"
  link: "#4f6f80"
semantic:
  ref: "#3a74ad"     # addresses and pointers: ctids, index entries, child and sibling links, cursors
  live: "#3b8556"    # visible, matching, committed, durable, correct
  dead: "#b5473c"    # dead tuples, aborted versions, anomalies, errors, deadlocks, bad plans
  meta: "#7552ad"    # machinery: page and tuple headers, snapshots, the lock manager, the catalog, WAL headers
  hot: "#b06f12"     # "look here": the current step, row or operator, the thing that just changed
typography:
  reading: Crimson Pro, 19px / 1.85
  display: Cormorant Garamond, light
  code: JetBrains Mono
spacing:
  measure: 40rem
  article: 880px
---

## overview

select * from everything should feel like a well-made book that happens to be alive. long-form reading comes first: warm paper, a proper serif at a comfortable size, generous line height, quiet ornaments. the figures are where things move, and they're the only place colour shows up with any force.

the look is after [k-a.in](https://www.k-a.in/rl-algo.html): paper `#fdfbf7`, Crimson Pro body, Cormorant Garamond headings, small tan hairlines above headings, a drop cap on the opening paragraph, slate links, light mono code.

## colour

two themes: **paper** (default) and **night** (warm charcoal `#191816`, never pure black). every colour is a css variable in `src/app/globals.css`; never hard-code a hex in a component.

neutrals: `bg`, `ink` (body text), `hi` (headings, emphasis, the active thing), `mute` (secondary), `faint` (labels, line numbers), `line` / `line-2` (hairlines), `well` / `well-2` (figure panels, selected options), `accent` / `accent-2` (ornaments, drop caps, italic labels), `link`.

the five semantic colours mean exactly one thing each, across every figure on the site:

| token | means | examples |
| --- | --- | --- |
| `ref` | an address, a pointer, "points at" | ctids and TIDs, index entry → heap tuple, b-tree child and right-sibling links, redirect line pointers, the t_ctid version link, page table → buffer frame, cursors ▶, foreign key → primary key arrows, the chapter line-art |
| `live` | visible, matching, committed, correct | the version a snapshot can see, rows that match or are in the result, COMMIT, "prevented", WAL at or before the flush pointer (durable), buffer hits, the right answer |
| `dead` | gone, wrong, broken | dead tuples, aborted versions, LP_DEAD entries, anomalies (lost update, write skew, phantoms), deadlock cycle edges, errors with their SQLSTATE, injection, misestimates and bad plans, committed work lost in a crash |
| `meta` | the machinery | page and tuple headers, infomask bits, high keys, hash meta pages, snapshots (xmin, xmax, xip), the commit log, the lock manager (held locks, solid), the catalog, visibility and free space maps, WAL record headers, checkpoint and redo pointers |
| `hot` | look here | the current step, operator, row, comparison or key, the record just appended, the frame under the clock hand, the search path, buffer reads (I/O happening now) |

two more conventions:

- `accent` marks **dirty** buffers and pages. a dirty page is persistent state, not a bug, so it is never `dead`.
- mute and **dashed** mean "not yet" or "not there": free space, unused slots, empty frames, waiting (lock waits, blocked statements), in-progress transactions, WAL not yet flushed, estimates (next to actuals in `hi`), future steps at 15% opacity.

commit status and visibility are two layers: commit status sets the outline (committed solid, in progress dashed, aborted `dead`), visibility to the chosen snapshot sets the tint (`live` if visible). removable versions are `dead` ghosts. sessions, WAL resource managers and plan node types are never colour-coded; they're told apart by position and name. the map lives in code in `src/components/figures/kit/semantics.ts`.

never use the semantic colours as decoration. code is coloured with its own muted, warm palette (slate keywords, sage strings, brown literals, italic comments) so it never competes with the semantic colours.

## type

three faces, three jobs:

- **Crimson Pro** for everything you read: prose, callouts, captions (italic), navigation. body 19px / 1.85 on desktop, justified with hyphenation, measure ~40rem.
- **Cormorant Garamond** (light) for headings, the chapter title, italic labels ("in short", "gotcha", "one level deeper", "part iv").
- **JetBrains Mono** for code, figures, diagram labels, controls and small metadata.

headings are lowercase, like the prose. h2s are centred with a 40px tan hairline above them.

## layout

a chapter opens like a book chapter: a line-art glyph in `ref` blue, the chapter's address (`everything.basics.logical_order`, read it as database.schema.table) in small mono, the title in Cormorant, the blurb in italic, a meta line, a hairline ornament. then the opening paragraph with a capital drop cap.

three columns on wide screens: contents rail, article (prose 40rem, figures up to ~880px, `wide` figures a little more), "on this page".

## components

- **figure**: a soft `well` panel with a 1px hairline and 10px radius; caption below, centred, italic, saying what to click and what to notice. figures render in mono.
- **stepper**: step / play / reset, a counter, a round-thumb scrubber, ← → keys.
- **code**: a `well` block with a file tab (mono) or an italic language label, line numbers in `faint`, notation highlights in the semantic colours. runnable blocks show their real output under them (a result grid: typed headers, `null` in faint italic, the command tag) and a **run** button.
- **result tables**: mono, numbers right-aligned like psql, NULL as a faint italic `null`, an empty string as a faint `''`. never the serif table style used in prose.
- **options**: small mono words; selected = a soft filled chip (`well-2` + hairline). actions: outlined mono buttons, primary is solid `hi`.
- **callouts**: a 2px left rule in the callout's meaning (`dead` gotcha, `hot` interview, `meta` postgres docs / one level deeper), an italic Cormorant label, serif body.

## motion

ui changes in under 300ms with `cubic-bezier(0.2, 0, 0, 1)`. figures move only to explain something. the home page's wireframe b-tree turns slowly while a lookup runs down it, root to leaf to heap page, and the row comes back up; every animation has a reduced-motion version.

## do / don't

- do write controls as what they do ("step", "run it", "reset").
- do make every figure readable on paper first, then check night.
- don't use pure black or pure white surfaces, gradients, glows or heavy shadows.
- don't put long text in mono. if people read it, it's serif.
- don't use em dashes in copy.
