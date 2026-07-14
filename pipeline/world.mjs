// World profiles — global sources that aren't Korean TV shows:
//   michelin.csv        → public/data/world/michelin.geojson       (19k, by star grade)
//   wiens.json          → public/data/world/wiens.geojson          (Mark Wiens, 1k, a person)
//   worldbeststeaks-*.json → public/data/world/worldbeststeaks.geojson (by year: one pin/restaurant)
//
// Sources:
//   Michelin  — ngshiheng/michelin-my-maps (historical DB, coords + award + desc)
//   Wiens     — wiensmap.com /places_with_coords.json (his whole eating map)
//   WBS       — worldbeststeaks.com "The List" 2022/2024/2025/2026, forward-geocoded here
//
// Each feature keeps a `profileId` = its GRADE / YEAR / person key so the map's
// avatar-ring machinery colours pins by that key, and `shows`/`primaryShow` so
// the existing show-filter becomes a grade / year filter.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, slug, normCountry, haversine } from "./lib/util.mjs";
import { geocodePoi, loadFwdCache, saveFwdCache } from "./lib/fwdgeo.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, "raw/world");
const OUT = path.join(HERE, "../public/data/world");
const CACHE = path.join(HERE, "cache");
fs.mkdirSync(OUT, { recursive: true });

const UA = "foodie-atlas-pipeline/1.0 (personal fan project; contact via repo)";
const ytId = (u) => (/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/.exec(u ?? "") || [])[1] || null;
const ytThumb = (u) => { const id = ytId(u); return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined; };
const titleCase = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/\p{Letter}[\p{Letter}'’]*/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1))
    .replace(/\bAnd\b/g, "and").replace(/\bDe\b/g, "de").replace(/\bDi\b/g, "di")
    .replace(/\bY\b/g, "y").replace(/\bAt The\b/g, "at the").replace(/\bBy\b/g, "by")
    .trim();

const feature = (lng, lat, props) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))] },
  properties: props,
});
const writeFc = (file, feats) => {
  fs.writeFileSync(path.join(OUT, file), JSON.stringify({ type: "FeatureCollection", features: feats }));
  return feats.length;
};

// ─────────────────────────────────────────────────────────── 1. MICHELIN ────
// grade → filter key + marker style. Stars are a magnitude ramp (gold→red);
// Bib Gourmand and the Plate are their own categories.
const GRADE = {
  "3 Stars": { id: "M3", short: "3 Stars", emoji: "⭐", color: "#c1121f" },
  "2 Stars": { id: "M2", short: "2 Stars", emoji: "⭐", color: "#e8702a" },
  "1 Star": { id: "M1", short: "1 Star", emoji: "⭐", color: "#e0aa1e" },
  "Bib Gourmand": { id: "MB", short: "Bib Gourmand", emoji: "😋", color: "#4a9d5b" },
  "Selected Restaurants": { id: "MS", short: "The Plate", emoji: "🍽️", color: "#8a97a8" },
};
const MICHELIN_COUNTRY = {
  "Hong Kong SAR China": "Hong Kong",
  "Macau SAR China": "Macau",
  "Chinese Mainland": "China",
};

function buildMichelin() {
  const csv = fs.readFileSync(path.join(RAW, "michelin.csv"), "utf8");
  const rows = parseCsv(csv);
  const feats = [];
  const tally = {};
  for (const r of rows) {
    const lat = Number(r.Latitude), lng = Number(r.Longitude);
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) continue;
    const g = GRADE[r.Award];
    if (!g) continue;
    const parts = (r.Location || "").split(",").map((s) => s.trim()).filter(Boolean);
    const city = parts[0] || "";
    let country = parts[parts.length - 1] || "";
    country = MICHELIN_COUNTRY[country] || normCountry(country);
    const desc = (r.Description || "").replace(/\s+/g, " ").trim();
    const closed = /permanently closed/i.test(desc);
    // keep the editorial writeup for the notable tiers; drop it for the ~12k
    // "Plate" entries to keep the on-demand payload lean
    const keepNote = g.id !== "MS" && desc;
    feats.push(
      feature(lng, lat, {
        id: `mich-${feats.length}`,
        name: r.Name,
        city,
        country,
        emoji: g.emoji,
        kind: r.Cuisine || undefined,
        status: closed ? "closed" : undefined,
        note: keepNote ? (desc.length > 180 ? desc.slice(0, 177).trimEnd() + "…" : desc) : undefined,
        award: g.short,
        cuisine: r.Cuisine || undefined,
        price: r.Price || undefined,
        greenStar: r.GreenStar === "1" || undefined,
        sourceUrl: r.Url || undefined,
        websiteUrl: r.WebsiteUrl || undefined,
        shows: [g.id],
        primaryShow: g.id,
        profileId: g.id,
        visits: [],
      }),
    );
    tally[g.short] = (tally[g.short] || 0) + 1;
  }
  const n = writeFc("michelin.geojson", feats);
  console.log(`  michelin: ${n} restaurants`, tally);
  return n;
}

// ──────────────────────────────────────────────────────────── 2. WIENS ──────
function buildWiens() {
  const data = JSON.parse(fs.readFileSync(path.join(RAW, "wiens.json"), "utf8"));
  const feats = [];
  for (const p of data.places || []) {
    const lat = Number(p.lat), lng = Number(p.lng);
    if (!isFinite(lat) || !isFinite(lng)) continue;
    if (!p.place_name) continue; // a few source rows have a null name — skip them
    const country = p.country ? normCountry(p.country) : "Elsewhere";
    const video = p.video_url || undefined;
    feats.push(
      feature(lng, lat, {
        id: `wiens-${feats.length}`,
        name: p.place_name,
        city: "",
        country,
        emoji: "🍜",
        rating: typeof p.rating === "number" && isFinite(p.rating) ? p.rating : undefined,
        image: ytThumb(video) || undefined,
        sourceUrl: p.google_maps_link || undefined,
        shows: ["MW"],
        primaryShow: "MW",
        visits: video ? [{ show: "MW", title: p.video_title || undefined, video }] : [],
      }),
    );
  }
  const n = writeFc("wiens.geojson", feats);
  console.log(`  wiens: ${n} places`);
  return n;
}

// ────────────────────────────────── 3. WORLD'S BEST STEAKS (multi-year) ───────
// worldbeststeaks.com publishes an annual "World's Best Steak Restaurants" 101.
// We keep ONE pin per restaurant carrying every edition it ranked in + that
// year's position, so the year chips become a ranking-history filter. Editions:
// 2026 (live scrape) + 2022/2024/2025 (recovered from the Wayback Machine).
const WBS_YEARS = [2026, 2025, 2024, 2022]; // newest first → chip order

const WBS_STOP = new Set(["the","de","del","la","el","le","los","las","di","da","by","at","and","y","a","of",
  "restaurant","restaurante","steakhouse","steak","house","parrilla","bodega","asador","grill","grille",
  "tavern","churrascaria","steaks","room","brasa","carnes"]);
const wbsFold = (s) => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
function wbsNameKey(name) {
  const t = wbsFold(name).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w && !WBS_STOP.has(w));
  return t.join(" ") || wbsFold(name).replace(/[^a-z0-9]+/g, "");
}
const wbsCityTok = (c) => wbsFold(c).replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)[0] || "";

// villages no geocoder resolves by street or name — hand-placed (León ox-steak
// house: the "Bodega"/"La Cúpula" rooms share El Capricho's cellar in Jiménez de Jamuz)
const WBS_MANUAL = {
  "capricho": { lat: 42.2531, lng: -5.8850, country: "Spain" },
  "cupula capricho": { lat: 42.2531, lng: -5.8850, country: "Spain" },
  "fat rabbit": { lat: 43.1594, lng: -79.2469, country: "Canada" },
  // Guatemala 4699, Palermo — the source street has a typo (46699) that fuzzy-
  // matched a wrong "Calle Guatemala" in Buenos Aires province
  "don julio": { lat: -34.5886, lng: -58.4305, country: "Argentina" },
};

// MapTiler forward-geocode verifying the CITY appears in the result (MapTiler
// localises country names — "Italia", "日本" — so an English-country check
// wrongly rejects valid hits; the city token is the reliable signal here).
async function mtGeocode(query, cityTok, key, cache, approx) {
  const ck = `wbsmt|${query}`;
  if (ck in cache) return cache[ck];
  let result = null;
  try {
    const res = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${key}&limit=5&language=en`, { headers: { "user-agent": UA } });
    if (res.ok) {
      const gj = await res.json();
      for (const f of gj.features ?? []) {
        const blob = wbsFold(JSON.stringify([f.place_name, f.text, f.context ?? []]));
        if (cityTok && !blob.includes(cityTok)) continue;
        result = { lat: f.center[1], lng: f.center[0], approx: !!approx };
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 130));
  } catch {
    return null; // transient failure: don't cache, retry next run
  }
  cache[ck] = result;
  return result;
}

// Reliable city centre via Nominatim (ranks by importance, so "New York" →
// Manhattan, not New York, Kentucky — MapTiler's bare-city ranking gets this
// wrong). Used as the geocode anchor and the fallback pin.
async function nomCity(city, country, cache) {
  const q = [city, country].filter(Boolean).join(", ");
  const ck = `nmcity|${q}`;
  if (ck in cache) return cache[ck];
  let result = null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&featuretype=city&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.ok) { const rows = await res.json(); const r = rows[0]; if (r) result = { lat: Number(r.lat), lng: Number(r.lon) }; }
  } catch {
    return null; // transient: don't cache
  } finally {
    await new Promise((r) => setTimeout(r, 1100));
  }
  cache[ck] = result;
  return result;
}

// Resolve one restaurant to coords: precise attempts are ACCEPTED ONLY IF within
// ~45 km of the city centre, so a same-named place in the wrong town (a "16 W
// 22nd St" in New Rochelle, a "Daniel's" in Indiana) can't win. A venue is never
// dropped — worst case it pins at its city centre.
async function geocodeWbs(e, mtKey, cache) {
  const ct = wbsCityTok(e.city);
  const anchor = await nomCity(e.city, e.country, cache);
  const near = (p) => !anchor || haversine(p.lat, p.lng, anchor.lat, anchor.lng) <= 45;
  if (mtKey && e.street) {
    const hit = await mtGeocode([e.street, e.city, e.country].filter(Boolean).join(", "), ct, mtKey, cache, false);
    if (hit && near(hit)) return { ...hit, src: "maptiler" };
  }
  const poi = await geocodePoi(e.name, e.city, e.country, cache); // real OSM POI lookup
  if (poi && near(poi)) return { lat: poi.lat, lng: poi.lng, approx: false, src: "nominatim" };
  if (mtKey) {
    const byName = await mtGeocode([e.name, e.city, e.country].filter(Boolean).join(", "), ct, mtKey, cache, false);
    if (byName && near(byName)) return { ...byName, src: "maptiler" };
  }
  if (anchor) return { lat: anchor.lat, lng: anchor.lng, approx: true, src: "citycenter" };
  return null;
}

async function buildWorldBestSteaks() {
  const editions = WBS_YEARS
    .map((y) => ({ year: y, file: path.join(RAW, `worldbeststeaks-${y}.json`) }))
    .filter((e) => fs.existsSync(e.file))
    .map((e) => ({ year: e.year, restaurants: JSON.parse(fs.readFileSync(e.file, "utf8")).restaurants }));

  // city-qualify the match key ONLY for names that repeat within a single
  // edition (two different "BISTECCA"), so a venue still matches itself across
  // years despite tiny city-label drift.
  const ambig = new Set();
  for (const ed of editions) {
    const seen = new Map();
    for (const r of ed.restaurants) { const k = wbsNameKey(r.name); seen.set(k, (seen.get(k) || 0) + 1); }
    for (const [k, n] of seen) if (n > 1) ambig.add(k);
  }
  const keyOf = (name, city) => { const nk = wbsNameKey(name); return ambig.has(nk) ? `${nk}|${wbsCityTok(city)}` : nk; };
  const isUpper = (s) => s && s === s.toUpperCase() && /[A-Z]/.test(s);

  // merge editions into a registry — richest first so proper city/street/notes win
  const SEED = [2025, 2024, 2026, 2022];
  const reg = new Map();
  for (const y of SEED) {
    const ed = editions.find((e) => e.year === y);
    if (!ed) continue;
    for (const r of ed.restaurants) {
      const k = keyOf(r.name, r.city);
      let e = reg.get(k);
      if (!e) { e = { key: k, name: r.name, city: r.city || "", country: normCountry(r.country) || "", street: "", website: "", notes: "", ranks: {} }; reg.set(k, e); }
      if (r.city && (!e.city || isUpper(e.city))) e.city = r.city; // prefer mixed-case
      if (r.country && !e.country) e.country = normCountry(r.country);
      if (r.street && !e.street) e.street = r.street;
      if (r.website && !e.website) e.website = r.website;
      if (r.notes && !e.notes) e.notes = r.notes;
      e.ranks[y] = r.rank;
    }
  }
  const entries = [...reg.values()];

  // Backfill country for entries that lack one (2022/2026 ship none) from a
  // city→country map learned across the richer editions, plus a tiny gazetteer
  // for cities that appear only in the country-less editions. Without a country,
  // ambiguous names ("London", "Melbourne", "New Plymouth") geocode to the wrong
  // same-named town.
  const cityKey = (c) => wbsFold(c).replace(/[^a-z0-9]+/g, " ").trim();
  const cityCountry = new Map();
  for (const e of entries) { if (!e.country) continue; const k = cityKey(e.city); if (k && !cityCountry.has(k)) cityCountry.set(k, e.country); }
  const CITY_COUNTRY = {
    "new plymouth": "New Zealand", "jose ignacio": "Uruguay", "moscow": "Russia",
    "amsterdam": "Netherlands", "dublin": "Ireland", "prague": "Czech Republic",
    "monte carlo": "Monaco", "marbella": "Spain", "napoli": "Italy", "geneva": "Switzerland",
    "adelaide": "Australia", "brisbane": "Australia", "auckland": "New Zealand",
    "barcelona": "Spain", "beverly hills": "United States", "philadelphia": "United States",
    "miami beach": "United States", "seattle": "United States", "las vegas": "United States",
    "montreal": "Canada", "saint catharines": "Canada", "lyon": "France", "milano": "Italy",
    "frankfurt a main": "Germany", "lugano": "Switzerland", "panzano in chianti": "Italy",
    "scarperia e san piero": "Italy",
  };
  for (const e of entries) if (!e.country) e.country = cityCountry.get(cityKey(e.city)) || CITY_COUNTRY[cityKey(e.city)] || "";
  const noCountry = entries.filter((e) => !e.country);
  if (noCountry.length) console.log(`  ⚠ ${noCountry.length} entries still without country:`, noCountry.map((e) => `${e.name} (${e.city})`).join("; "));

  // reuse coords + country already resolved in the current geojson (free re-runs)
  const prior = new Map();
  const existingFile = path.join(OUT, "worldbeststeaks.geojson");
  if (fs.existsSync(existingFile)) {
    for (const f of JSON.parse(fs.readFileSync(existingFile, "utf8")).features) {
      const p = f.properties;
      prior.set(keyOf(p.name, p.city), { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], country: p.country });
    }
  }

  const cache = await loadFwdCache(CACHE);
  const mtKey = process.env.MAPTILER_API_KEY;
  const feats = [];
  const stats = { manual: 0, prior: 0, maptiler: 0, nominatim: 0, citycenter: 0, miss: 0 };

  for (const e of entries) {
    let geo = null, country = e.country, approx = false;
    if (WBS_MANUAL[e.key]) { geo = WBS_MANUAL[e.key]; country ||= geo.country; stats.manual++; }
    else if (prior.has(e.key)) { geo = prior.get(e.key); country ||= normCountry(geo.country); stats.prior++; }
    else {
      const hit = await geocodeWbs(e, mtKey, cache);
      await saveFwdCache(CACHE, cache); // checkpoint (network is slow)
      if (hit) { geo = hit; approx = hit.approx; stats[hit.src === "citycenter" ? "citycenter" : hit.src]++; }
    }
    if (!geo) { stats.miss++; console.log(`    ✗ no coords: ${Object.entries(e.ranks).map(([y, r]) => y + "#" + r).join(" ")}  ${e.name} (${e.city})`); continue; }

    const years = Object.keys(e.ranks).map(Number).sort((a, b) => b - a);  // newest first
    const bestYear = years.reduce((b, y) => (e.ranks[y] < e.ranks[b] ? y : b), years[0]);
    feats.push(
      feature(geo.lng, geo.lat, {
        id: `wbs-${slug(e.name)}-${wbsCityTok(e.city) || "x"}`,
        name: titleCase(e.name),
        city: titleCase(e.city),
        country: normCountry(country) || "",
        emoji: "🥩",
        kind: "steakhouse",
        rank: e.ranks[bestYear],       // best (lowest) rank ever — for list sorting
        ranks: e.ranks,                // { "2026": 1, "2025": 6, ... } per-year history
        bestYear,
        award: "World's Best Steaks",
        note: e.notes || undefined,
        websiteUrl: e.website || undefined,
        sourceUrl: "https://www.worldbeststeaks.com/the-list",
        shows: years.map((y) => `Y${y}`),
        primaryShow: `Y${years[0]}`,   // ring colour = most-recent edition it made
        profileId: `Y${years[0]}`,
        visits: [],
      }),
    );
  }
  feats.sort((a, b) => a.properties.rank - b.properties.rank || (b.properties.bestYear - a.properties.bestYear));
  const n = writeFc("worldbeststeaks.geojson", feats);
  console.log(`  worldbeststeaks: ${n} restaurants across ${editions.map((e) => e.year).join("/")}`, stats);
  return n;
}

// ─────────────────────────────────────────────────────────────── run ────────
const only = process.argv[2]; // optional: michelin | wiens | wbs
console.log("building world profiles…");
if (!only || only === "michelin") buildMichelin();
if (!only || only === "wiens") buildWiens();
if (!only || only === "wbs") await buildWorldBestSteaks();
console.log("done → public/data/world/");
