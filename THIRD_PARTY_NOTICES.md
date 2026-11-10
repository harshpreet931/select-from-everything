# third-party notices

select * from everything is MIT licensed. some files we ship were made by other people under other licenses. they're listed here, one section per thing. add a section when you add something.

---

## in-browser postgres (`public/sql/pglite/0.5.12/`)

the "run" button runs your sql on [PGlite](https://github.com/electric-sql/pglite) 0.5.12: PostgreSQL 18.6 compiled to WebAssembly, running in a web worker in your browser. the files are copied unmodified from the `@electric-sql/pglite` npm package by `scripts/sql-assets.mjs` at build time. they aren't committed to this repo; the build ships them with the site.

| file | what it is |
| --- | --- |
| `index.js`, `chunk-*.js` | PGlite's javascript: the loader, the wire protocol, the virtual file system |
| `pglite.wasm` | PostgreSQL 18.6 (ElectricSQL's fork), compiled to WebAssembly |
| `initdb.wasm` | PostgreSQL's `initdb`, compiled to WebAssembly, used to create a fresh database |
| `pglite.data.gz` | PostgreSQL's share directory (catalog templates, timezone data, encodings), gzipped by us, byte-identical once unzipped |
| `pageinspect.tar.gz`, `pg_buffercache.tar.gz`, `pg_visibility.tar.gz`, `pg_walinspect.tar.gz`, `pg_freespacemap.tar.gz`, `amcheck.tar.gz` | PostgreSQL contrib extensions, built by the PGlite project |
| `LICENSE` | PGlite's license, shipped next to the files |

### PGlite

- Copyright ElectricSQL and PGlite contributors. https://github.com/electric-sql/pglite
- dual-licensed under the Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0) and the PostgreSQL License (below). you may use it under either; we ship its `LICENSE` file (Apache-2.0) with it.
- per PGlite's README, its changes to the postgres source (https://github.com/electric-sql/postgres-pglite) are licensed under the PostgreSQL License.
- PGlite builds on the work of Stas Kelvich of Neon.

### PostgreSQL

`pglite.wasm`, `initdb.wasm`, `pglite.data.gz` and the extension bundles contain PostgreSQL. no PostgreSQL source is shipped in this repo; it's at https://www.postgresql.org/ftp/source/ (and the fork above).

> PostgreSQL Database Management System
> (also known as Postgres, formerly known as Postgres95)
>
> Portions Copyright (c) 1996-2025, The PostgreSQL Global Development Group
>
> Portions Copyright (c) 1994, The Regents of the University of California
>
> Permission to use, copy, modify, and distribute this software and its documentation for any purpose, without fee, and without a written agreement is hereby granted, provided that the above copyright notice and this paragraph and the following two paragraphs appear in all copies.
>
> IN NO EVENT SHALL THE UNIVERSITY OF CALIFORNIA BE LIABLE TO ANY PARTY FOR DIRECT, INDIRECT, SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES, INCLUDING LOST PROFITS, ARISING OUT OF THE USE OF THIS SOFTWARE AND ITS DOCUMENTATION, EVEN IF THE UNIVERSITY OF CALIFORNIA HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
>
> THE UNIVERSITY OF CALIFORNIA SPECIFICALLY DISCLAIMS ANY WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE SOFTWARE PROVIDED HEREUNDER IS ON AN "AS IS" BASIS, AND THE UNIVERSITY OF CALIFORNIA HAS NO OBLIGATIONS TO PROVIDE MAINTENANCE, SUPPORT, UPDATES, ENHANCEMENTS, OR MODIFICATIONS.

PostgreSQL and Postgres are trademarks of the PostgreSQL Community Association of Canada. this project isn't affiliated with the PostgreSQL Global Development Group or with ElectricSQL.

---

## captured postgres output (`content/**/*.golden.json`, `content/**/traces/*.pgtrace.json`, `src/components/home/descent.json`)

query results, plans, page dumps and WAL records produced by running PostgreSQL 18.6 (PGlite, and native builds from Postgres.app and PGDG). they're output of the software, not part of it, and are MIT licensed with the rest of the content. the scenarios and queries that produce them are in this repo.

---

## fonts

the site loads these from Google Fonts through `next/font`, which self-hosts them in the build. the share images use static copies in `src/assets/fonts/` (Cormorant Garamond 300, Crimson Pro 400 and 400 italic, JetBrains Mono 400).

| font | copyright | license |
| --- | --- | --- |
| [Crimson Pro](https://github.com/Fonthausen/CrimsonPro) | Copyright 2018 The Crimson Pro Project Authors | SIL Open Font License 1.1 |
| [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant) | Copyright 2015 The Cormorant Project Authors | SIL Open Font License 1.1 |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) | Copyright 2020 The JetBrains Mono Project Authors | SIL Open Font License 1.1 |

the SIL Open Font License 1.1: https://openfontlicense.org. next/font subsets the copies it self-hosts to the character sets the site asks for (latin).
