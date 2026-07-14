// World profiles — global sources that aren't Korean TV shows:
//   michelin.csv        → public/data/world/michelin.geojson       (19k, by star grade)
//   wiens.json          → public/data/world/wiens.geojson          (Mark Wiens, 1k, a person)
//   worldbeststeaks*.json → public/data/world/worldbeststeaks.geojson (101, by year)
//
// Sources:
//   Michelin  — ngshiheng/michelin-my-maps (historical DB, coords + award + desc)
//   Wiens     — wiensmap.com /places_with_coords.json (his whole eating map)
//   WBS       — worldbeststeaks.com "The List" 2026, forward-geocoded here
//
// Each feature keeps a `profileId` = its GRADE / YEAR / person key so the map's
// avatar-ring machinery colours pins by that key, and `shows`/`primaryShow` so
// the existing show-filter becomes a grade / year filter.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, slug, normCountry } from "./lib/util.mjs";
import { loadFwdCache, saveFwdCache } from "./lib/fwdgeo.mjs";

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

// ───────────────────────────────────────────────────── 3. WORLD BEST STEAKS ──
// Nominatim POI lookup that also returns the resolved country (WBS ships none).
async function geocodeSteak(name, city, cache) {
  const ck = `wbs|${name}|${city}`;
  if (ck in cache) return cache[ck];
  const fold = (s) => (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let result = null;
  const tryQuery = async (q, poiOnly) => {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&accept-language=en&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return null;
    const rows = await res.json();
    for (const r of rows) {
      const cat = r.category ?? r.class;
      if (poiOnly && !["amenity", "shop", "tourism", "leisure", "craft", "building", "historic"].includes(cat)) continue;
      const a = r.address ?? {};
      const rCity = fold([a.city, a.town, a.village, a.municipality, a.county].filter(Boolean).join(" "));
      if (city && rCity && !rCity.includes(fold(city.split(" ")[0]))) continue;
      return { lat: Number(r.lat), lng: Number(r.lon), country: a.country || "", approx: !poiOnly };
    }
    return null;
  };
  try {
    result = await tryQuery(`${name}, ${city}`, true);
    if (!result) { await new Promise((r) => setTimeout(r, 1100)); result = await tryQuery(`${city}`, false); }
  } catch { return null; }
  finally { await new Promise((r) => setTimeout(r, 1100)); }
  cache[ck] = result;
  return result;
}

// small villages Nominatim can't resolve by name — hand-placed from the venue's
// own map (El Capricho / La Cúpula share the famous ox-steak house in León)
const WBS_MANUAL = {
  "la-cúpula": { lat: 42.2531, lng: -5.8850, country: "Spain" },
  "el-capricho": { lat: 42.2531, lng: -5.8850, country: "Spain" },
  "fat-rabbit": { lat: 43.1594, lng: -79.2469, country: "Canada" },
};

async function buildWorldBestSteaks() {
  const src = JSON.parse(fs.readFileSync(path.join(RAW, "worldbeststeaks-2026.json"), "utf8"));
  const cache = await loadFwdCache(CACHE);
  const yearId = `Y${src.year}`;
  const feats = [];
  let approx = 0, miss = 0;
  for (const r of src.restaurants) {
    let geo = WBS_MANUAL[r.slug];
    if (!geo) {
      geo = await geocodeSteak(r.name, r.city, cache);
      await saveFwdCache(CACHE, cache); // checkpoint each step (network is slow)
    }
    if (!geo) { miss++; console.log(`    ✗ no coords: #${r.rank} ${r.name} (${r.city})`); continue; }
    if (geo.approx) approx++;
    const display = titleCase([r.name, r.subtitle].filter(Boolean).join(" "));
    feats.push(
      feature(geo.lng, geo.lat, {
        id: `wbs-${r.rank}`,
        name: display,
        city: titleCase(r.city),
        country: normCountry(geo.country) || "",
        emoji: "🥩",
        kind: "steakhouse",
        rank: r.rank,
        award: `World's Best Steaks #${r.rank}`,
        sourceUrl: `https://www.worldbeststeaks.com/${src.year}-list-1-101/${r.slug}`,
        shows: [yearId],
        primaryShow: yearId,
        profileId: yearId,
        visits: [], // rank lives in `award`; no per-visit episodes for a ranked list
      }),
    );
  }
  feats.sort((a, b) => a.properties.rank - b.properties.rank);
  const n = writeFc("worldbeststeaks.geojson", feats);
  console.log(`  worldbeststeaks: ${n} placed (${approx} approx, ${miss} missed)`);
  return n;
}

// ─────────────────────────────────────────────────────────────── run ────────
const only = process.argv[2]; // optional: michelin | wiens | wbs
console.log("building world profiles…");
if (!only || only === "michelin") buildMichelin();
if (!only || only === "wiens") buildWiens();
if (!only || only === "wbs") await buildWorldBestSteaks();
console.log("done → public/data/world/");
