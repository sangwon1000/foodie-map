// Geocode episode-visited restaurants that DiningCode's tagged lists don't cover,
// so the map can hold *every* place a show actually visited — not just the ones
// the community tagged. Routing:
//   - Korean venue, known province  → DiningCode isearch by name (verify province)
//   - Overseas venue                → Nominatim POI (verify country)
//   - Garbage "area" (episode title) → DiningCode nationwide, accept only if unique
// A wrong pin is worse than a missing one, so every backend verifies before caching.
// Results cached in pipeline/cache/kr-geocode.json (nulls cached too; delete to retry).
//
// Usage: node pipeline/kr/geocode-episodes.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geocodePoi } from "../lib/fwdgeo.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RAW = path.join(ROOT, "pipeline/raw/kr");
const CACHE_DIR = path.join(ROOT, "pipeline/cache");
const CACHE_FILE = path.join(CACHE_DIR, "kr-geocode.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- shared name helpers (kept in sync with build.mjs) ----------
const fold = (s) =>
  (s ?? "").normalize("NFKC").replace(/\(.*?\)/g, "").replace(/[^\p{Letter}\p{Number}]+/gu, "").toLowerCase();
const nameKey = (s) => fold(String(s ?? "").replace(/\s*(본점|본관|직영점|[가-힣A-Za-z0-9]{1,8}점)\s*$/u, ""));

// keep in sync with build.mjs
const NONFOOD =
  /체험마을|병영성|산성|읍성|서원|향교|서당|박물관|미술관|전시관|기념관|사진사|사진관|카메라|지업사|철물|금박|화원|꽃상가|꽃집|슈퍼|마트$|편의점|정미소|방앗간|떡방아|참기름집|선착장|여객선|여객터미널|기차역|근대화거리|가요센터|공원사진|미용실|이발관|서점|문구점|양식장|어촌계|농협|수협|축협/u;
const isNonFood = (name) => NONFOOD.test(String(name ?? ""));

// strip a leading market/location qualifier so "서문시장 삼미식당" → "삼미식당",
// "서시장內 주부떡집" → "주부떡집" (DiningCode lists the venue, not the market)
const coreName = (name) =>
  String(name ?? "").replace(/^\S*시장\s*(內|안|내)?\s*/u, "").trim();

const PROVINCES = [
  ["서울특별시", "서울"], ["부산광역시", "부산"], ["대구광역시", "대구"], ["인천광역시", "인천"],
  ["광주광역시", "광주"], ["대전광역시", "대전"], ["울산광역시", "울산"], ["세종특별자치시", "세종"],
  ["경기도", "경기"], ["강원특별자치도", "강원"], ["강원도", "강원"], ["충청북도", "충북"],
  ["충청남도", "충남"], ["전북특별자치도", "전북"], ["전라북도", "전북"], ["전라남도", "전남"],
  ["경상북도", "경북"], ["경상남도", "경남"], ["제주특별자치도", "제주"], ["제주도", "제주"],
];
const provinceShort = (s) => {
  if (!s) return null;
  for (const [full, short] of PROVINCES) if (s.includes(full) || s.includes(short)) return short;
  return null;
};

// overseas area → { country (for Nominatim), city }
const FOREIGN = [
  [/니가타|도쿠시마|도쿄|오사카|일본/, "Japan"],
  [/홍콩/, "Hong Kong"],
  [/싱가포르/, "Singapore"],
  [/베를린|독일/, "Germany"],
  [/말뫼|스웨덴/, "Sweden"],
  [/퀘벡|캐나다/, "Canada"],
  [/뉴욕|뉴저지|루이빌|미국|하와이/, "United States"],
  [/베트남|하노이|호치민/, "Vietnam"],
  [/태국|방콕/, "Thailand"],
];
const CITY_OF = { 도쿄: "Tokyo", 오사카: "Osaka", 니가타현: "Niigata", 도쿠시마시: "Tokushima", 홍콩: "Hong Kong", 싱가포르: "Singapore", 베를린: "Berlin", 말뫼: "Malmö", 퀘벡시: "Quebec City", 뉴욕: "New York", 뉴저지: "New Jersey", 루이빌: "Louisville" };
function foreignOf(area) {
  const a = String(area ?? "");
  for (const [re, country] of FOREIGN) if (re.test(a)) {
    let city = "";
    for (const [k, v] of Object.entries(CITY_OF)) if (a.includes(k)) { city = v; break; }
    return { country, city };
  }
  return null;
}

// ---------- DiningCode isearch by name ----------
const DC_API = "https://im.diningcode.com/API/isearch/";
async function dcSearch(query) {
  const body = new URLSearchParams({
    query, addr: "", keyword: "", order: "r_score", distance: "", rn_search_flag: "on",
    search_type: "poi_search", lat: "", lng: "", rect: "", s_type: "", token: "",
    mode: "poi", dc_flag: "1", page: "1", size: "8",
  }).toString();
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(DC_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: "https://www.diningcode.com", Referer: "https://www.diningcode.com/",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.result_data?.poi_section?.list ?? [];
    } catch (e) {
      if (attempt >= 3) return null; // transient: signal "retry next run"
      await sleep(1200 * attempt);
    }
  }
}

const sigunguOf = (area) => {
  const t = String(area ?? "").trim().split(/\s+/);
  return (t[1] ?? "").replace(/[시군구]$/u, "");
};

/** Korean venue via DiningCode; province (and, when possible, sigungu) must agree. */
async function geocodeKR(name, area) {
  const prov = provinceShort(area);
  const sigungu = sigunguOf(area);
  const k = nameKey(name);

  const tryQuery = async (q) => {
    const list = await dcSearch(q);
    if (list === null) return { transient: true };
    const scored = list
      .map((p) => ({
        p,
        exact: nameKey(p.nm) === k,
        provOk: prov ? provinceShort(p.addr) === prov : true,
        sgOk: sigungu ? String(p.addr ?? "").includes(sigungu) : false,
      }))
      .filter((x) => x.provOk);
    const pick =
      scored.find((x) => x.exact && x.sgOk) ??
      scored.find((x) => x.exact) ??
      (prov ? scored.find((x) => x.sgOk) : null);
    return { result: pick ? poiResult(pick.p, "diningcode-search") : null };
  };

  // 1) name + area, 2) market-stripped core name + area
  let r = await tryQuery(`${name} ${sigungu || prov || ""}`.trim());
  if (r.transient || r.result) return r;
  const core = coreName(name);
  if (core && core !== name) {
    await sleep(450);
    r = await tryQuery(`${core} ${sigungu || prov || ""}`.trim());
    if (r.transient || r.result) return r;
  }
  // 3) nationwide, accept only a unique exact-name hit inside the right province
  await sleep(450);
  const list = await dcSearch(core || name);
  if (list === null) return { transient: true };
  const exact = list.filter((p) => nameKey(p.nm) === k && (!prov || provinceShort(p.addr) === prov));
  if (exact.length === 1) return { result: poiResult(exact[0], "diningcode-nationwide") };
  return { result: null };
}

// keep the rich DiningCode fields so geocoded pins look like tagged ones
function poiResult(p, src) {
  return {
    lat: p.lat, lng: p.lng, addr: p.addr || p.road_addr || null,
    name: p.nm, category: p.category || null,
    user_score: p.user_score ?? null, review_cnt: p.review_cnt ?? null,
    open_status: p.open_status || null, src,
  };
}

/** Korean venue with a junk area label → nationwide, accept only if unambiguous. */
async function geocodeKRNationwide(name) {
  const list = await dcSearch(name);
  if (list === null) return { transient: true };
  const k = nameKey(name);
  const exact = list.filter((p) => nameKey(p.nm) === k);
  if (exact.length !== 1) return { result: null }; // ambiguous or absent
  return { result: poiResult(exact[0], "diningcode-nationwide") };
}

// ---------- episode extraction (mirrors build.mjs) ----------
const EXTRACT = {
  baekban: (e) => e.restaurants.map((r) => ({ name: r, area: e.region })),
  misikhoe: (e) => e.restaurants.map((r) => ({ name: r.name ?? r, area: r.area })),
  mokeultende: (e) =>
    String(e.restaurant ?? "").split(" / ").map((s) => s.trim()).filter(Boolean).map((name) => ({ name, area: e.area })),
  choizaroad: (e) => [{ name: e.restaurant, area: e.area }],
  culinarywars: (e) => e.restaurants.map((r) => ({ name: r.name ?? r, area: r.area })),
  koreantable: (e) => e.restaurants.map((r) => ({ name: r.name ?? r, area: r.area })),
};

function unmatchedFor(id) {
  const epFile = path.join(RAW, `episodes-${id}.json`);
  const dcFile = path.join(RAW, `diningcode-${id}.json`);
  if (!fs.existsSync(epFile) || !fs.existsSync(dcFile)) return [];
  const eps = JSON.parse(fs.readFileSync(epFile, "utf8"));
  const dc = JSON.parse(fs.readFileSync(dcFile, "utf8"));
  const dcKeys = new Set(dc.places.map((p) => nameKey(p.name)));
  const dcArr = [...dcKeys];
  const extract = EXTRACT[id];
  const uniq = new Map();
  for (const e of eps)
    for (const r of extract(e)) {
      const k = nameKey(r.name);
      if (k.length >= 2 && !uniq.has(k)) uniq.set(k, r);
    }
  const out = [];
  for (const [k, r] of uniq) {
    const hit = dcKeys.has(k) || dcArr.some((d) => d.length >= 3 && k.length >= 3 && (d.includes(k) || k.includes(d)));
    if (!hit) out.push(r);
  }
  return out;
}

// ---------- run ----------
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};
fs.mkdirSync(CACHE_DIR, { recursive: true });
const save = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1));

const SHOWS = ["baekban", "misikhoe", "mokeultende", "choizaroad", "culinarywars", "koreantable"];
const KR_RE = /서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청|전라|경상/;

let done = 0, hit = 0, miss = 0, skipped = 0;
for (const id of SHOWS) {
  const items = unmatchedFor(id);
  if (items.length === 0) { console.log(`${id}: (no episode file / nothing to geocode)`); continue; }
  process.stdout.write(`${id}: ${items.length} to geocode `);
  let localHit = 0;
  for (const it of items) {
    if (isNonFood(it.name)) { skipped++; continue; } // not an eatery; never map
    const ck = `${nameKey(it.name)}|${it.area ?? ""}`;
    if (ck in cache) { if (cache[ck]) { hit++; localHit++; } else miss++; done++; continue; }

    const foreign = foreignOf(it.area);
    let res;
    if (foreign) {
      const r = await geocodePoi(it.name, foreign.city, foreign.country, {}); // its own pacing
      res = { result: r ? { lat: r.lat, lng: r.lng, name: it.name, country: foreign.country, city: foreign.city, src: "nominatim" } : null };
    } else if (KR_RE.test(it.area ?? "")) {
      res = await geocodeKR(it.name, it.area);
      await sleep(450);
    } else {
      res = await geocodeKRNationwide(it.name);
      await sleep(450);
    }

    if (res.transient) { skipped++; continue; } // don't cache; retry next run
    cache[ck] = res.result ?? null;
    if (res.result) { hit++; localHit++; process.stdout.write("+"); } else { miss++; process.stdout.write("."); }
    done++;
    if (done % 20 === 0) save();
  }
  console.log(` → +${localHit}`);
  save();
}
save();
console.log(`\ngeocoded ${hit} · unresolved ${miss} · deferred(transient) ${skipped}`);
