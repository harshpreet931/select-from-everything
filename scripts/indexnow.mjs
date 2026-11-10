#!/usr/bin/env node
// pnpm indexnow [site-url]
// tells IndexNow search engines (bing, yandex, seznam, naver...) about every url in the live
// sitemap, so new chapters get crawled in minutes instead of weeks. google doesn't use
// IndexNow: for google, submit sitemap.xml once in search console.
import fs from "node:fs";
import path from "node:path";

const site = (process.argv[2] ?? "https://sql.harshpreet.com").replace(/\/$/, "");

// this site's IndexNow key. public/<key>.txt holds the same 32 hex characters and is served at
// /<key>.txt, which is how the engines check we own the host. never reuse another site's key.
const key = "24a4d88c0ed9ae5046b2a62ac5dbbbef";
const keyFile = `${key}.txt`;
let onDisk = "";
try {
  onDisk = fs.readFileSync(path.join(process.cwd(), "public", keyFile), "utf8").trim();
} catch {}
if (onDisk !== key) {
  console.error(`public/${keyFile} is missing or doesn't contain the key`);
  process.exit(1);
}

const xml = await (await fetch(`${site}/sitemap.xml`)).text();
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urlList.length) {
  console.error("sitemap has no urls");
  process.exit(1);
}

// the shared endpoint can lag on new keys, so also submit to bing and yandex directly
const endpoints = ["https://api.indexnow.org/indexnow", "https://www.bing.com/indexnow", "https://yandex.com/indexnow"];
const body = JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/${keyFile}`, urlList });
let ok = 0;
for (const url of endpoints) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body });
    const fine = res.ok || res.status === 202;
    if (fine) ok++;
    console.log(`${fine ? "✓" : "✗"} ${new URL(url).host}: ${urlList.length} urls → ${res.status} ${res.statusText}`);
  } catch (e) {
    console.log(`✗ ${new URL(url).host}: ${e.message}`);
  }
}
process.exit(ok ? 0 : 1);
