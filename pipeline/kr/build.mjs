// Build per-profile GeoJSON for the Korean show profiles.
//
// The spine is each show's *episode/visit history* — every restaurant the show
// actually visited. Coordinates come from, in order:
//   1. the DiningCode 인증맛집 tagged list (name+area match) → rich pin (rating…)
//   2. the episode geocode cache (pipeline/cache/kr-geocode.json), which resolved
//      the rest via DiningCode name-search + Nominatim (run geocode-episodes.mjs)
// DiningCode-tagged venues that no episode confirms are still kept as supplementary
// community pins (no episode badge). Nothing is ever pinned on a guess.
//
// Usage: node pipeline/kr/build.mjs   (run geocode-episodes.mjs first for full coverage)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { externalVenues, channelVenues } from "./external.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RAW = path.join(ROOT, "pipeline/raw/kr");
const OUT = path.join(ROOT, "public/data/kr");
const GEO_CACHE = path.join(ROOT, "pipeline/cache/kr-geocode.json");

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

const provinceShort = (s) => {
  if (!s) return null;
  for (const [full, short] of PROVINCES) if (s.includes(full) || s.includes(short)) return short;
  return null;
};

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

// clear non-eateries the episode boards over-include (sights, shops, producers) —
// never mapped, never counted against coverage. Kept conservative to avoid
// dropping real restaurants (markets stay: "서문시장 삼미식당" is a restaurant).
const NONFOOD =
  /체험마을|병영성|산성|읍성|서원|향교|서당|박물관|미술관|전시관|기념관|사진사|사진관|카메라|지업사|철물|금박|화원|꽃상가|꽃집|슈퍼|마트$|편의점|정미소|방앗간|떡방아|참기름집|선착장|여객선|여객터미널|기차역|근대화거리|가요센터|공원사진|미용실|이발관|서점|문구점|양식장|어촌계|농협|수협|축협/u;
const isNonFood = (name) => NONFOOD.test(String(name ?? ""));

// ---------- episode index ----------
// Map<nameKey, entry[]> where entry = { visit, area, raw, consumed }
function episodeIndex(id) {
  const eps = loadJson(path.join(RAW, `episodes-${id}.json`));
  if (!eps) return null;
  const ix = new Map();
  const add = (name, visit, area) => {
    const k = nameKey(name);
    if (k.length < 2 || isNonFood(name)) return;
    if (!ix.has(k)) ix.set(k, []);
    ix.get(k).push({ visit, area: area ?? null, raw: String(name), consumed: false });
  };

  if (id === "baekban") {
    for (const e of eps)
      for (const r of e.restaurants ?? [])
        add(r, { show: "BB", episode: e.ep ?? undefined, title: e.region || undefined, year: yearOf(e.date), label: e.ep != null ? `${e.ep}회` : undefined }, e.region);
  } else if (id === "misikhoe") {
    for (const e of eps)
      for (const r of e.restaurants ?? [])
        add(r.name ?? r, { show: "WM", episode: e.ep ?? undefined, title: e.topic || undefined, year: yearOf(e.date), label: e.ep != null ? `${e.ep}회` : undefined }, r.area);
  } else if (id === "mokeultende") {
    for (const e of eps) {
      const names = String(e.restaurant ?? "").split(" / ").map((s) => s.trim()).filter(Boolean);
      const title = String(e.title ?? "").replace(/^.*?먹을텐데\s*[lㅣ|I]\s*/u, "").trim();
      for (const r of names)
        add(r, { show: "MT", title: title || undefined, year: yearOf(e.date), video: e.video || undefined, label: e.n != null ? `${e.n}화` : undefined }, e.area);
    }
  } else if (id === "choizaroad") {
    for (const e of eps) {
      const title = String(e.title ?? "").replace(/\s*[|ㅣ]\s*(최자로드|온더웨이|로컬콜링).*$/u, "").trim();
      add(e.restaurant, { show: "CR", season: e.season ?? undefined, title: title || undefined, year: yearOf(e.date), label: e.season != null ? `시즌${e.season}` : undefined }, e.area);
    }
  } else if (id === "culinarywars") {
    for (const e of eps) {
      const bits = [e.tier, e.result].filter(Boolean).join(" · ");
      for (const r of e.restaurants ?? [])
        add(r.name ?? r, { show: e.season === 2 ? "CW2" : "CW1", title: bits ? `${e.chef} (${bits})` : e.chef, year: e.season === 2 ? 2025 : 2024 }, r.area);
    }
  } else if (id === "koreantable") {
    for (const e of eps)
      for (const r of e.restaurants ?? [])
        add(r.name ?? r, { show: "KT", episode: e.ep ?? undefined, title: e.topic || undefined, year: yearOf(e.date), label: e.ep != null ? `${e.ep}회` : undefined }, r.area);
  }
  return ix;
}

// meters between two lng/lat points
const distM = (a, b) => {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const la1 = a[1] * rad, la2 = b[1] * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const dedupeVisits = (visits) => {
  const seen = new Set();
  return visits.filter((v) => {
    const k = JSON.stringify([v.show, v.season ?? null, v.episode ?? null, v.title ?? null]);
    return !seen.has(k) && seen.add(k);
  });
};

// does an episode area hint agree with a place's province/city?
const areaOk = (area, province, city) => {
  if (!area) return true;
  const a = String(area);
  const sigungu = (city.split(" ")[0] ?? "").replace(/[시군구]$/u, "");
  if (provinceShort(a) === province) return true;
  if (sigungu.length >= 2 && a.includes(sigungu)) return true;
  return false;
};

// ---------- build ----------
fs.mkdirSync(OUT, { recursive: true });
const geoCache = loadJson(GEO_CACHE) ?? {};
const EXTERNAL = externalVenues(); // { profileId: [{name,lat,lng,addr,category,video,image}] }
const summary = [];

for (const { id, show } of PROFILES) {
  const raw = loadJson(path.join(RAW, `diningcode-${id}.json`));
  if (!raw) {
    console.warn(`skip ${id}: no diningcode file`);
    continue;
  }
  const epIx = episodeIndex(id);
  const epEntries = epIx ? [...epIx.entries()] : [];

  // ---- 1. DiningCode-tagged venues, consuming matching episode entries ----
  const features = raw.places.map((p) => {
    const { province, city } = splitAddr(p.addr || p.road_addr);
    const displayName = p.branch ? `${p.name} ${p.branch}` : p.name;

    let visits = [];
    if (epIx) {
      const k = nameKey(p.name);
      const exact = (k.length >= 2 && epIx.get(k)) || [];
      if (exact.length > 0) {
        const ok = exact.filter((c) => areaOk(c.area, province, city));
        const take = ok.length > 0 ? ok : exact;
        for (const c of take) { visits.push(c.visit); c.consumed = true; }
      } else if (k.length >= 3) {
        // containment fallback ("하얀집" ↔ "나주곰탕 하얀집") — area must agree
        for (const [ek, entries] of epEntries) {
          if (ek.length < 3 || (!ek.includes(k) && !k.includes(ek))) continue;
          const ok = entries.filter((c) => areaOk(c.area, province, city) && c.area);
          for (const c of ok) { visits.push(c.visit); c.consumed = true; }
        }
      }
      visits = dedupeVisits(visits);
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

  // ---- 2. episode venues no tagged place covered → geocode cache ----
  let geoAdded = 0, geoUnresolved = 0;
  let unresolved = []; // aired venues still without coords → external sources may place them
  if (epIx) {
    // group leftover entries by (nameKey|area) — same key the geocoder cached under
    const groups = new Map();
    for (const [k, entries] of epEntries)
      for (const c of entries) {
        if (c.consumed) continue;
        const gk = `${k}|${c.area ?? ""}`;
        if (!groups.has(gk)) groups.set(gk, { k, area: c.area, raw: c.raw, visits: [] });
        groups.get(gk).visits.push(c.visit);
      }

    for (const [gk, g] of groups) {
      const geo = geoCache[gk];
      if (!geo) {
        geoUnresolved++;
        unresolved.push({ k: g.k, raw: g.raw, area: g.area, visits: g.visits });
        continue;
      }
      let city, country, status, kind, note, rating, reviews, dispName;
      if (geo.src === "nominatim") {
        dispName = geo.name || g.raw;
        city = geo.city || "";
        country = geo.country || "";
        status = "unknown";
      } else {
        dispName = geo.name || g.raw;
        const sp = splitAddr(geo.addr);
        city = sp.city;
        country = sp.province;
        status = statusOf(geo.open_status);
        kind = (geo.category ?? "").split(",")[0].trim() || undefined;
        note = geo.category || undefined;
        rating = geo.user_score ?? undefined;
        reviews = geo.review_cnt ?? undefined;
      }
      const visits = dedupeVisits(g.visits);
      // same physical spot as an existing pin whose name is compatible → merge,
      // don't drop a second pin on top of it (name match just missed)
      const gkName = nameKey(dispName);
      const dup = features.find((f) => {
        if (distM(f.geometry.coordinates, [geo.lng, geo.lat]) > 45) return false;
        const fk = nameKey(f.properties.name);
        return fk === gkName || (fk.length >= 3 && gkName.length >= 3 && (fk.includes(gkName) || gkName.includes(fk)));
      });
      if (dup) {
        dup.properties.visits = dedupeVisits([...dup.properties.visits, ...visits]);
        dup.properties.shows = [...new Set([...dup.properties.shows, ...visits.map((v) => v.show)])];
        dup.properties.primaryShow = dup.properties.shows[dup.properties.shows.length - 1];
        continue;
      }
      const shows = [...new Set(visits.map((v) => v.show))];
      if (shows.length === 0) shows.push(show);
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [geo.lng, geo.lat] },
        properties: {
          id: `kr-${id}-geo-${fold(gk).slice(0, 40)}`,
          name: dispName,
          city,
          country,
          kind,
          emoji: pickEmoji(note, dispName),
          status,
          note,
          rating,
          reviews,
          visits,
          shows,
          primaryShow: shows[shows.length - 1],
        },
      });
      geoAdded++;
    }
  }

  // ---- 3. external YouTube-map sources → enrich pins (video/image), add net-new,
  //         and place aired venues our own geocoding couldn't (tubemap, youtubeplace) ----
  let extEnrich = 0, extNew = 0, extFilled = 0;
  for (const e of EXTERNAL[id] ?? []) {
    const ek = nameKey(e.name);
    const f =
      features.find((ft) => nameKey(ft.properties.name) === ek && distM(ft.geometry.coordinates, [e.lng, e.lat]) < 1500) ||
      features.find((ft) => distM(ft.geometry.coordinates, [e.lng, e.lat]) < 80);
    if (f) {
      if (e.video) {
        const vv = f.properties.visits.find((v) => !v.video);
        if (vv) vv.video = e.video;
      }
      if (e.image && !f.properties.image) f.properties.image = e.image;
      extEnrich++;
      continue;
    }
    // net-new pin — reuse an aired-venue's visits if the name matches an unresolved one
    const ug = unresolved.find((u) => u.k === ek);
    let visits, shows;
    if (ug) {
      visits = dedupeVisits(ug.visits);
      shows = [...new Set(visits.map((v) => v.show))];
      unresolved = unresolved.filter((u) => u !== ug);
      geoUnresolved--; extFilled++;
    } else {
      visits = [{ show }];
      shows = [show];
    }
    if (e.video && visits[0] && !visits[0].video) visits[0].video = e.video;
    const sp = splitAddr(e.addr);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [e.lng, e.lat] },
      properties: {
        id: `kr-${id}-ext-${fold(e.name).slice(0, 32)}-${Math.round(e.lat * 1e4)}`,
        name: e.name,
        city: sp.city,
        country: sp.province,
        kind: e.category,
        emoji: pickEmoji(e.category, e.name),
        status: "unknown",
        note: e.category,
        image: e.image,
        visits,
        shows,
        primaryShow: shows[shows.length - 1] ?? show,
      },
    });
    extNew++;
  }

  const withEp = features.filter((f) => f.properties.visits.length > 0).length;
  const epRestaurants = epIx
    ? new Set(epEntries.flatMap(([k, es]) => es.map((c) => `${k}|${c.area ?? ""}`))).size
    : 0;
  const meta = {
    profile: id,
    generated: new Date().toISOString(),
    counts: {
      places: features.length,
      withEpisodes: withEp,
      fromDiningCode: raw.places.length,
      geocodedAdds: geoAdded,
      externalNew: extNew,
      externalEnriched: extEnrich,
      episodeVenues: epRestaurants,
      episodeUnresolved: geoUnresolved,
    },
  };
  fs.writeFileSync(path.join(OUT, `${id}.geojson`), JSON.stringify({ type: "FeatureCollection", metadata: meta, features }));

  const cov = epRestaurants ? Math.round((withEp / (withEp + geoUnresolved)) * 100) : 0;
  const extStr = (EXTERNAL[id]?.length)
    ? ` · ext +${extNew} new/${extFilled} placed, ${extEnrich} enriched`
    : "";
  summary.push(
    epIx
      ? `${id}: ${features.length} places (${raw.places.length} diningcode + ${geoAdded} geocoded)${extStr} · ${withEp} with episodes · ${geoUnresolved} unresolved (${cov}% placed)`
      : `${id}: ${features.length} places · no episode file`,
  );
}

// ---------- standalone YouTuber profiles (no DiningCode/episode base) ----------
// These come purely from the external YouTube-map sources: every venue the
// creator featured, with Kakao coords + the source video + a thumbnail.
const YOUTUBERS = [
  { id: "jeongyukwang", show: "JYW", chans: [["tube", "정육왕"], ["yp", "정육왕"]] },
];
for (const y of YOUTUBERS) {
  const vens = channelVenues(y.chans);
  const features = vens.map((e, i) => {
    const sp = splitAddr(e.addr);
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [e.lng, e.lat] },
      properties: {
        id: `kr-${y.id}-${fold(e.name).slice(0, 32)}-${i}`,
        name: e.name,
        city: sp.city,
        country: sp.province,
        kind: e.category,
        emoji: pickEmoji(e.category, e.name),
        status: "unknown",
        note: e.category,
        image: e.image,
        visits: e.video ? [{ show: y.show, video: e.video }] : [{ show: y.show }],
        shows: [y.show],
        primaryShow: y.show,
      },
    };
  });
  const meta = { profile: y.id, generated: new Date().toISOString(), counts: { places: features.length, source: "youtube-map" } };
  fs.writeFileSync(path.join(OUT, `${y.id}.geojson`), JSON.stringify({ type: "FeatureCollection", metadata: meta, features }));
  summary.push(`${y.id}: ${features.length} places (external youtube-map)`);
}

// ---------- 육식맨 YOOXICMAN — international food-trip eateries ----------
// From his YouTube video descriptions (🔽장소🔽 blocks): coords via the Google
// Maps place links he lists, reverse-geocoded to city/country. Home-cooking
// recipe videos carry no 장소 block, so only places he actually visited land here.
const yxRaw = loadJson(path.join(RAW, "yooxicman.json"));
if (yxRaw?.restaurants?.length) {
  // his trips span cuisines the KR emoji rules don't cover — match on the (rich)
  // video title first, meat 🍖 as the carnivore-channel default
  const YX_EMOJI = [
    [/pizza|피자/i, "🍕"], [/pasta|파스타|라구|carbonara|cacio|리가토니/i, "🍝"],
    [/ramen|noodle|라멘|미소라멘|국수|면\b|소바/i, "🍜"], [/butadon|부타동|규동|돈부리|덮밥|규나베/i, "🍚"],
    [/bbq|barbecue|바베큐|스테이크|steak|아사도|asado|갈비|한우|생갈비|jamon|하몽|jamón/i, "🥩"],
    [/burger|버거|샌드위치|sandwich|bagel|베이글/i, "🍔"], [/sushi|초밥|스시|오마카세|스시야/i, "🍣"],
    [/sausage|소시지|kebab|케밥|schnitzel|슈니첼|족발|wurst/i, "🌭"], [/beer|맥주|필스너|pilsner|호프|브루/i, "🍺"],
    [/curry|커리|카레/i, "🍛"], [/goulash|굴라시|soup|국밥|육개장|찌개|stew|해장국/i, "🍲"],
    [/pie|파이|dessert|디저트|gelato|젤라또|아이스크림/i, "🥧"], [/chicken|치킨|닭|가라아게/i, "🍗"],
    [/오리|duck|덕/i, "🦆"], [/양고기|lamb|mutton|램/i, "🍖"],
  ];
  const yxEmoji = (title, name) => {
    const hay = `${title ?? ""} ${name ?? ""}`;
    for (const [re, e] of YX_EMOJI) if (re.test(hay)) return e;
    const k = pickEmoji("", name);
    return k === "🍽️" ? "🍖" : k;
  };
  const vidId = (url) => (String(url).match(/[?&]v=([\w-]{11})/) || [])[1];
  const features = yxRaw.restaurants.map((r, i) => {
    const first = vidId(r.videos?.[0]);
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      properties: {
        id: `kr-yooxicman-${fold(r.name).slice(0, 32)}-${i}`,
        name: r.name,
        city: r.city || "",
        country: r.country || "",
        emoji: yxEmoji(r.video_title, r.name),
        status: "unknown",
        image: first ? `https://i.ytimg.com/vi/${first}/hqdefault.jpg` : undefined,
        source: "youtube.com/@YOOXICMAN",
        visits: (r.videos || []).map((v) => ({ show: "YXM", video: v, title: r.video_title })),
        shows: ["YXM"],
        primaryShow: "YXM",
      },
    };
  });
  const meta = { profile: "yooxicman", generated: new Date().toISOString(), counts: { places: features.length, source: "youtube-descriptions" } };
  fs.writeFileSync(path.join(OUT, "yooxicman.geojson"), JSON.stringify({ type: "FeatureCollection", metadata: meta, features }));
  summary.push(`yooxicman: ${features.length} places (youtube food-trip descriptions)`);
}

// ---------- 백년가게 — 소상공인시장진흥공단 지정 음식점 (창업 연대별) ----------
// Scraped from sbiz.or.kr (업종=음식점업 전수): name + full address + 창업일 +
// 선정년도. Bucketed by founding decade so the filter reads as "how old is it".
const bnRaw = loadJson(path.join(RAW, "baeknyeon.json"));
if (bnRaw?.restaurants?.length) {
  const era = (fy) => (!fy ? "B90" : fy <= 1969 ? "B60" : fy < 1980 ? "B70" : fy < 1990 ? "B80" : fy < 2000 ? "B90" : "B00");
  const features = bnRaw.restaurants
    .filter((r) => isFinite(r.lat) && isFinite(r.lng))
    .map((r, i) => {
      const fy = r.foundYear;
      const show = era(fy);
      const note = [fy ? `${fy}년 창업` : null, r.selected ? `${r.selected}년 백년가게 선정` : null].filter(Boolean).join(" · ");
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.lng, r.lat] },
        properties: {
          id: `kr-baeknyeon-${fold(r.name).slice(0, 26)}-${i}`,
          name: r.name,
          city: r.city || "",
          country: r.province || "",
          emoji: pickEmoji("", r.name),
          status: "open",
          award: fy ? `백년가게 · ${fy}년 창업` : "백년가게",
          note,
          shows: [show],
          primaryShow: show,
        },
      };
    });
  const meta = { profile: "baeknyeon", generated: new Date().toISOString(), counts: { places: features.length, source: "sbiz.or.kr 백년가게 음식점업" } };
  fs.writeFileSync(path.join(OUT, "baeknyeon.geojson"), JSON.stringify({ type: "FeatureCollection", metadata: meta, features }));
  const byEra = {};
  for (const f of features) byEra[f.properties.primaryShow] = (byEra[f.properties.primaryShow] || 0) + 1;
  summary.push(`baeknyeon: ${features.length} places (백년가게 음식점 · ${["B60", "B70", "B80", "B90", "B00"].map((e) => `${e}:${byEra[e] || 0}`).join(" ")})`);
}

console.log(summary.join("\n"));
