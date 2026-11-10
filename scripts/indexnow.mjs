#!/usr/bin/env node
// pnpm indexnow [--submit] [--live] [--since <git-ref>] [--site <url>] [--endpoint <url>]
//
// tells IndexNow search engines (bing, yandex, seznam, naver...) which urls changed, so they get
// recrawled in minutes instead of weeks. google doesn't use IndexNow: for google, the sitemap in
// search console is the whole story.
//
// dry run by default: prints what it would send and sends nothing. --submit sends it.
//   urls come from out/sitemap.xml (run pnpm build first), or the live sitemap with --live.
//   --since <ref> keeps only pages whose content changed since that git ref (a tag, a sha,
//   HEAD~3), which is what IndexNow asks for: submit what changed, not the whole site every time.
//   one endpoint is enough, the participating engines share submissions with each other.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const root = process.cwd();
const site = opt("--site", "https://sql.harshpreet.com").replace(/\/$/, "");
const endpoint = opt("--endpoint", "https://api.indexnow.org/indexnow");
const submit = flag("--submit");
const since = opt("--since");

// this site's IndexNow key. public/<key>.txt holds the same 32 hex characters and is served at
// /<key>.txt, which is how the engines check we own the host. never reuse another site's key.
const key = "24a4d88c0ed9ae5046b2a62ac5dbbbef";
const keyFile = `${key}.txt`;
let onDisk = "";
try {
  onDisk = fs.readFileSync(path.join(root, "public", keyFile), "utf8").trim();
} catch {}
if (onDisk !== key) {
  console.error(`public/${keyFile} is missing or doesn't contain the key`);
  process.exit(1);
}

let xml;
if (flag("--live")) {
  const res = await fetch(`${site}/sitemap.xml`);
  if (!res.ok) {
    console.error(`${site}/sitemap.xml → ${res.status}`);
    process.exit(1);
  }
  xml = await res.text();
} else {
  const local = path.join(root, "out", "sitemap.xml");
  if (!fs.existsSync(local)) {
    console.error("no out/sitemap.xml: run pnpm build first, or pass --live");
    process.exit(1);
  }
  xml = fs.readFileSync(local, "utf8");
}

let urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
const foreign = urlList.filter((u) => new URL(u).host !== new URL(site).host);
if (foreign.length) {
  console.error(`sitemap has urls on another host (${foreign[0]}): IndexNow only takes urls on ${new URL(site).host}`);
  process.exit(1);
}

if (since) {
  // map changed files to the pages that show them. anything outside content/ (code, the
  // curriculum, the glossary) can change every page, so it keeps the full list
  let changed;
  try {
    changed = execFileSync("git", ["diff", "--name-only", since, "HEAD", "--"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    console.error(`git can't diff from ${since}`);
    process.exit(1);
  }
  const chapterOnly = changed.every((f) => /^content\/[^/]+\/[^/]+\.(mdx|golden\.json)$/.test(f) || /^content\/[^/]+\/traces\//.test(f));
  if (chapterOnly) {
    const pages = new Set();
    for (const f of changed) {
      const m = f.match(/^content\/([^/]+)\/(?:traces\/)?([^/.]+)/);
      if (m) pages.add(`${site}/learn/${m[1]}/${m[2]}`);
    }
    urlList = urlList.filter((u) => pages.has(u));
  }
  console.log(`${changed.length} files changed since ${since}${chapterOnly ? "" : " (some outside chapters: sending every url)"}`);
}

if (!urlList.length) {
  console.log("nothing to submit");
  process.exit(0);
}
// the protocol takes up to 10,000 urls per request
const batches = [];
for (let i = 0; i < urlList.length; i += 10000) batches.push(urlList.slice(i, i + 10000));

const host = new URL(site).host;
const keyLocation = `${site}/${keyFile}`;

if (!submit) {
  console.log(`dry run: would POST ${urlList.length} urls in ${batches.length} request(s) to ${endpoint}`);
  console.log(`  host ${host}, key ${key}, keyLocation ${keyLocation}`);
  for (const u of urlList.slice(0, 5)) console.log(`  ${u}`);
  if (urlList.length > 5) console.log(`  ... and ${urlList.length - 5} more`);
  console.log("pass --submit to send.");
  process.exit(0);
}

// the engines fetch the key file to check ownership: make sure it's live before spending a submission
const check = await fetch(keyLocation).catch(() => null);
const served = check?.ok ? (await check.text()).trim() : "";
if (served !== key) {
  console.error(`${keyLocation} doesn't serve the key (${check ? check.status : "no response"}): deploy first`);
  process.exit(1);
}

let failed = 0;
for (const batch of batches) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation, urlList: batch }),
  }).catch((e) => ({ ok: false, status: 0, statusText: e.message }));
  const fine = res.ok || res.status === 202;
  if (!fine) failed++;
  console.log(`${fine ? "ok" : "failed"} ${new URL(endpoint).host}: ${batch.length} urls → ${res.status} ${res.statusText}`);
}
process.exit(failed ? 1 : 0);
