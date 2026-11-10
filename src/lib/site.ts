export const site = {
  name: "select * from everything",
  tagline: "sql, all the way down.",
  description:
    "an open-source, visual-first guide to sql and databases. every query runs in your browser, from the first SELECT down to pages, b-trees and the write-ahead log. free, forever.",
  url: "https://sql.harshpreet.com",
  repo: "https://github.com/harshpreet931/select-from-everything",
  author: {
    name: "Harshpreet Singh",
    short: "harshpreet",
    url: "https://harshpreet.com",
    domain: "harshpreet.com",
    github: "https://github.com/harshpreet931",
  },
  /** the postgres this site is written against. sql-assets and sql-check read `pglite: "x"` and fail on drift */
  pg: { major: 18, version: "18.6", pglite: "0.5.12", engine: "PostgreSQL 18.6 (PGlite 0.5.12)" },
};
