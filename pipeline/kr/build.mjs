// Build per-profile GeoJSON for the Korean show profiles from the vendored
// DiningCode lists (+ episode files when the collectors have delivered them).
// Usage: node pipeline/kr/build.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RAW = path.join(ROOT, "pipeline/raw/kr");
const OUT = path.join(ROOT, "public/data/kr");

// ---------- profiles ----------
const PROFILES = [
  { id: "baekban", show: "BB" },
  { id: "mokeultende", show: "MT" },
  { id: "choizaroad", show: "CR" },
  { id: "misikhoe", show: "WM" },
  { id: "culinarywars", show: "CW1" }, // CW1/CW2 per season
  { id: "koreantable", show: "KT" },
];

// ---------- helpers ----------
const PROVINCES = [
  ["서울특별시", "서울"], ["부산광역시", "부산"], ["대구광역시", "대구"],
  ["인천광역시", "인천"], ["광주광역시", "광주"], ["대전광역시", "대전"],
  ["울산광역시", "울산"], ["세종특별자치시", "세종"], ["경기도", "경기"],
  ["강원특별자치도", "강원"], ["강원도", "강원"], ["충청북도", "충북"],
  ["충청남도", "충남"], ["전북특별자치도", "전북"], ["전라북도", "전북"],
  ["전라남도", "전남"], ["경상북도", "경북"], ["경상남도", "경남"],
  ["제주특별자치도", "제주"], ["제주도", "제주"],
];

function splitAddr(addr) {
  if (!addr) return { province: "", city: "" };
  const t = addr.trim().split(/\s+/);
  const hit =
    PROVINCES.find(([full]) => t[0] === full) ??
    PROVINCES.find(([, short]) => t[0].startsWith(short));
  const province = hit ? hit[1] : t[0] ?? "";
  const parts = [];
  if (t[1]) parts.push(t[1]);
  if (t[2] && /[동읍면가리로]$/.test(t[2]) && !/^\d/.test(t[2])) parts.push(t[2]);
  return { province, city: parts.join(" ") };
}

const EMOJI_RULES = [
  [/초밥|스시|오마카세|사시미/u, "🍣"],
  [/냉면|막국수|밀면|칼국수|국수|우동|라멘|라면|소바|쌀국수|짬뽕|짜장|중화|도삭면|잔치국/u, "🍜"],
  [/만두|교자|딤섬/u, "🥟"],
  [/삼계탕|백숙|치킨|통닭|닭갈비|찜닭|닭|오리/u, "🍗"],
  [/백반|한정식|정식|집밥|쌈밥|보리밥|비빔밥|덮밥|김밥|주먹밥|나물|밥집|솥밥/u, "🍚"],
  [/국밥|해장국|전골|찌개|곰탕|설렁탕|감자탕|육개장|매운탕|추어탕|순대국|뼈해장|탕집|탕$|청국장|두부|옹심이|수제비|죽/u, "🍲"],
  [/족발|보쌈/u, "🍖"],
  [/삼겹|갈비|한우|소고기|돼지|고기|구이|불고기|육회|곱창|막창|대창|정육|수구레|갈매기|껍데기/u, "🥩"],
  [/회|물회|횟집|방어|민어|참치|생선|조개|굴|새우|꽃게|게장|해물|해산물|아구|아귀|장어|붕어|낙지|주꾸미|쭈꾸미|오징어|문어|전복|멍게|대게|새조개|게국지|어시장/u, "🐟"],
  [/빈대떡|파전|부침|전집|전문점전|^전|녹두전/u, "🥞"],
  [/분식|떡볶이|순대|어묵|오뎅|튀김|김말이/u, "🍢"],
  [/돈까스|돈카츠|카츠|규카츠/u, "🍱"],
  [/카레|커리/u, "🍛"],
  [/빵|베이커리|제과|도넛|크로플|와플/u, "🍞"],
  [/케이크|디저트|마카롱|타르트/u, "🍰"],
  [/카페|커피|찻집|다방|로스터/u, "☕"],
  [/맥주|호프|펍|브루/u, "🍺"],
  [/술집|주점|포차|막걸리|전통주|이자카야|사케|와인바|칵테일/u, "🍶"],
  [/피자/u, "🍕"],
  [/버거/u, "🍔"],
  [/파스타|이탈리|양식|비스트로/u, "🍝"],
  [/스테이크/u, "🥩"],
  [/샐러드|비건|채식/u, "🥗"],
  [/아이스크림|젤라또|소프트/u, "🍦"],
  [/빙수/u, "🍧"],
  [/타코|멕시/u, "🌮"],
  [/텐동|덴뿌라/u, "🍤"],
  [/평양|함흥/u, "🍜"],
];

function pickEmoji(category, name) {
  const hay = `${category ?? ""} ${name ?? ""}`;
  for (const [re, e] of EMOJI_RULES) if (re.test(hay)) return e;
  return "🍽️";
}

// live business-hours status → permanent-ish status
const statusOf = (s) => (!s || s === "확인필요" ? "unknown" : "open");

const fold = (s) =>
  (s ?? "")
    .normalize("NFKC")
    .replace(/\(.*?\)/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .toLowerCase();

// strip common branch suffixes for matching ("본점", "강남점"…)
const nameKey = (s) => fold(String(s ?? "").replace(/\s*(본점|본관|직영점|[가-힣A-Za-z0-9]{1,8}점)\s*$/u, ""));

// ---------- episode loading ----------
function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

const yearOf = (d) => {
  const m = /^(\d{4})/.exec(d ?? "");
  return m ? Number(m[1]) : undefined;
};

/** returns Map<key, visit[]> for a profile, or null when no episode file yet */
function episodeIndex(id) {
  const eps = loadJson(path.join(RAW, `episodes-${id}.json`));
  if (!eps) return null;
  const ix = new Map();
  const add = (name, visit, area) => {
    const k = nameKey(name);
    if (k.length < 2) return;
    if (!ix.has(k)) ix.set(k, []);
    ix.get(k).push({ visit, area: area ?? null, raw: String(name) });
  };

  if (id === "baekban") {
    for (const e of eps) {
      for (const r of e.restaurants ?? []) {
        add(r, {
          show: "BB", episode: e.ep ?? undefined, title: e.region || undefined,
          year: yearOf(e.date), label: e.ep != null ? `${e.ep}회` : undefined,
        }, e.region);
      }
    }
  } else if (id === "misikhoe") {
    for (const e of eps) {
      for (const r of e.restaurants ?? []) {
        add(r.name ?? r, {
          show: "WM", episode: e.ep ?? undefined, title: e.topic || undefined,
          year: yearOf(e.date), label: e.ep != null ? `${e.ep}회` : undefined,
        }, r.area);
      }
    }
  } else if (id === "mokeultende") {
    for (const e of eps) {
      // multi-restaurant episodes pack names as "A / B / C"
      const names = String(e.restaurant ?? "")
        .split(" / ")
        .map((s) => s.trim())
        .filter(Boolean);
      const title = String(e.title ?? "")
        .replace(/^.*?먹을텐데\s*[lㅣ|I]\s*/u, "")
        .trim();
      for (const r of names) {
        add(r, {
          show: "MT", title: title || undefined, year: yearOf(e.date),
          video: e.video || undefined, label: e.n != null ? `${e.n}화` : undefined,
        }, e.area);
      }
    }
  } else if (id === "choizaroad") {
    for (const e of eps) {
      // drop the trailing "| 최자로드9 EP. 01" / "| 최자로드9 EP.01" boilerplate
      const title = String(e.title ?? "")
        .replace(/\s*[|ㅣ]\s*(최자로드|온더웨이|로컬콜링).*$/u, "")
        .trim();
      add(e.restaurant, {
        show: "CR", season: e.season ?? undefined, title: title || undefined,
        year: yearOf(e.date), label: e.season != null ? `시즌${e.season}` : undefined,
      }, e.area);
    }
  } else if (id === "culinarywars") {
    for (const e of eps) {
      const bits = [e.tier, e.result].filter(Boolean).join(" · ");
      for (const r of e.restaurants ?? []) {
        add(r.name ?? r, {
          show: e.season === 2 ? "CW2" : "CW1",
          title: bits ? `${e.chef} (${bits})` : e.chef,
          year: e.season === 2 ? 2025 : 2024,
        }, r.area);
      }
    }
  }
  return ix;
}

// ---------- build ----------
fs.mkdirSync(OUT, { recursive: true });
const summary = [];

for (const { id, show } of PROFILES) {
  const raw = loadJson(path.join(RAW, `diningcode-${id}.json`));
  if (!raw) {
    console.warn(`skip ${id}: no diningcode file`);
    continue;
  }
  const epIx = episodeIndex(id);
  const usedEpKeys = new Set();
  const epEntries = epIx ? [...epIx.entries()] : [];

  const provinceShort = (s) => {
    for (const [full, short] of PROVINCES) if (s.includes(full) || s.includes(short)) return short;
    return null;
  };
  // does the episode's area hint agree with the place's address?
  const areaOk = (area, province, city) => {
    if (!area) return true;
    const a = String(area);
    const sigungu = (city.split(" ")[0] ?? "").replace(/[시군구]$/u, "");
    if (provinceShort(a) === province) return true;
    if (sigungu.length >= 2 && a.includes(sigungu)) return true;
    return false;
  };

  const features = raw.places.map((p) => {
    const { province, city } = splitAddr(p.addr || p.road_addr);
    const displayName = p.branch ? `${p.name} ${p.branch}` : p.name;

    let visits = [];
    if (epIx) {
      const k = nameKey(p.name);
      const exact = (k.length >= 2 && epIx.get(k)) || [];
      if (exact.length > 0) {
        // prefer area-agreeing candidates; a bare name match still counts
        const ok = exact.filter((c) => areaOk(c.area, province, city));
        for (const c of ok.length > 0 ? ok : exact) visits.push(c.visit);
        usedEpKeys.add(k);
      } else if (k.length >= 3) {
        // containment fallback ("하얀집" ↔ "나주곰탕 하얀집") — area must agree
        for (const [ek, entries] of epEntries) {
          if (ek.length < 3 || (!ek.includes(k) && !k.includes(ek))) continue;
          const ok = entries.filter((c) => areaOk(c.area, province, city) && c.area);
          if (ok.length === 0) continue;
          for (const c of ok) visits.push(c.visit);
          usedEpKeys.add(ek);
        }
      }
      // de-dupe identical visits
      const seen = new Set();
      visits = visits.filter((v) => {
        const kk = JSON.stringify([v.show, v.season ?? null, v.episode ?? null, v.title ?? null]);
        return !seen.has(kk) && seen.add(kk);
      });
    }

    const shows = [...new Set(visits.map((v) => v.show))];
    if (shows.length === 0) shows.push(show);

    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        id: `kr-${id}-${p.rid}`,
        name: displayName,
        city,
        country: province,
        kind: (p.category ?? "").split(",")[0].trim() || undefined,
        emoji: pickEmoji(p.category, p.name),
        status: statusOf(p.open_status),
        note: p.category || undefined,
        rating: p.user_score ?? undefined,
        reviews: p.review_cnt ?? undefined,
        visits,
        shows,
        primaryShow: shows[shows.length - 1],
      },
    };
  });

  const withEp = features.filter((f) => f.properties.visits.length > 0).length;
  const epTotal = epIx ? [...epIx.keys()].length : 0;
  const meta = {
    profile: id,
    generated: new Date().toISOString(),
    counts: {
      places: features.length,
      withEpisodes: withEp,
      episodeNamesMatched: usedEpKeys.size,
      episodeNamesTotal: epTotal,
    },
  };
  fs.writeFileSync(
    path.join(OUT, `${id}.geojson`),
    JSON.stringify({ type: "FeatureCollection", metadata: meta, features }),
  );
  summary.push(
    `${id}: ${features.length} places` +
      (epIx
        ? `, ${withEp} with episodes (matched ${usedEpKeys.size}/${epTotal} episode names)`
        : ", no episode file yet"),
  );
}

console.log(summary.join("\n"));
