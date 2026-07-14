// Fetch DiningCode "인증맛집" (certified) lists for the Korean show profiles.
// The API caps every query at 100 results, so we recurse: nationwide →
// 시/도 → 시/군/구 until each slice fits, then merge by rid.
// Usage: node pipeline/kr/fetch-diningcode.mjs
// Writes one vendored JSON per show to pipeline/raw/kr/diningcode-<id>.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KR_REGIONS } from "./kr-regions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = path.join(ROOT, "pipeline/raw/kr");

const LISTS = [
  { id: "choizaroad", keyword: "최자로드" },
  { id: "mokeultende", keyword: "성시경의먹을텐데" },
  { id: "baekban", keyword: "식객허영만의백반기행" },
  { id: "culinarywars", keyword: "흑백요리사" },
  { id: "koreantable", keyword: "한국인의밥상" },
  { id: "sikga", keyword: "수요미식회" },
];

const API = "https://im.diningcode.com/API/isearch/";
const CAP = 100; // hard result cap per query
const PACE_MS = 450;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(keyword, query) {
  const body = new URLSearchParams({
    query, addr: "", keyword, order: "r_score", distance: "",
    rn_search_flag: "on", search_type: "poi_search", lat: "", lng: "",
    rect: "", s_type: "", token: "", mode: "poi", dc_flag: "1",
    page: "1", size: String(CAP),
  }).toString();
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: "https://www.diningcode.com",
          Referer: "https://www.diningcode.com/",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.result_code !== "100") throw new Error(`result_code ${json.result_code}`);
      return json.result_data.poi_section;
    } catch (e) {
      if (attempt >= 3) throw new Error(`${e.message} for "${keyword}" query="${query}"`);
      await sleep(1500 * attempt);
    }
  }
}

const trim = (p) => ({
  rid: p.v_rid,
  name: p.nm,
  branch: p.branch || null,
  addr: p.addr || null,
  road_addr: p.road_addr || null,
  phone: p.phone || null,
  category: p.category || null,
  area: p.area || [],
  lat: p.lat,
  lng: p.lng,
  open_status: p.open_status || null,
  score: p.score ?? null,
  user_score: p.user_score ?? null,
  review_cnt: p.review_cnt ?? null,
  image: p.image || null,
  tags: (p.keyword || []).map((k) => k.term),
});

async function fetchList(keyword) {
  const byRid = new Map();
  const add = (sec) => {
    for (const p of sec.list || []) if (p.v_rid && !byRid.has(p.v_rid)) byRid.set(p.v_rid, trim(p));
  };

  const nation = await search(keyword, "");
  const total = nation.total_cnt;
  add(nation);
  let requests = 1;

  for (const [prov, subs] of Object.entries(KR_REGIONS)) {
    await sleep(PACE_MS);
    const sec = await search(keyword, prov);
    requests++;
    if (sec.total_cnt <= CAP || subs.length === 0) {
      if (sec.total_cnt > CAP) console.warn(`  ⚠ ${prov}: ${sec.total_cnt} > ${CAP}, no subdivisions — truncated`);
      add(sec);
      continue;
    }
    for (const sub of subs) {
      await sleep(PACE_MS);
      const s = await search(keyword, `${prov} ${sub}`);
      requests++;
      if (s.total_cnt > CAP) console.warn(`  ⚠ ${prov} ${sub}: ${s.total_cnt} > ${CAP} — truncated`);
      add(s);
    }
  }
  return { total, places: [...byRid.values()], requests };
}

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const { id, keyword } of LISTS) {
  process.stdout.write(`${keyword} `);
  const { total, places, requests } = await fetchList(keyword);
  const out = {
    source: "diningcode.com 인증맛집",
    keyword,
    fetched_at: new Date().toISOString(),
    total_reported: total,
    count: places.length,
    places,
  };
  fs.writeFileSync(path.join(OUT_DIR, `diningcode-${id}.json`), JSON.stringify(out, null, 1));
  console.log(`→ ${places.length}/${total} saved (${requests} requests)`);
  await sleep(PACE_MS);
}
console.log("done");
