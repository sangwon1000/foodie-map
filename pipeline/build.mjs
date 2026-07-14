/**
 * Bourdain Atlas data pipeline
 *
 *   raw KML (5 fan maps, all 4 shows)          → venue base layer (name, coords, season/category)
 *   + anthonybourdainworldmap.com API dump     → city / country / what-he-ate for NR + PU
 *     (+ a hand-curated recovery list of real food spots the NR map filed
 *        under "Other Activities" — found in the 2026-07 completeness audit)
 *   + Christine Zhang episode-stop CSVs (CC BY) → episode attribution + city fallback
 *   + eatlikebourdain.com full extraction       → new venues (with coords), episode
 *     numbers the Zhang data can't reach (e.g. PU S12), closed/open statuses
 *   + MapTiler reverse geocoding (cached)       → city/country for the last stragglers
 *   ────────────────────────────────────────────────────────────────────────────
 *   = public/data/restaurants.geojson
 *
 * Usage:  npm run pipeline            (uses vendored files in pipeline/raw)
 *         npm run pipeline -- --refetch   (re-download every source first)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseKml } from "./lib/kml.mjs";
import { emojiFor } from "./lib/emoji.mjs";
import { applyElb, resolveEp } from "./lib/elb.mjs";
import { geocodeAddress, geocodePoi, loadFwdCache, saveFwdCache } from "./lib/fwdgeo.mjs";
import { haversine, normCountry, parseCsv, slug } from "./lib/util.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, "raw");
const CACHE = path.join(HERE, "cache");
const OUT = path.join(HERE, "..", "public", "data", "restaurants.geojson");
const UA = "bourdain-atlas-pipeline/1.0 (personal fan project)";

const SHOW_ORDER = ["ACT", "NR", "TL", "PU"];
const SHOW_NAMES = {
  "A Cook's Tour": "ACT",
  "No Reservations": "NR",
  "The Layover": "TL",
  "Parts Unknown": "PU",
};

const KML_SOURCES = [
  { file: "act.kml", show: "ACT", mid: "19485y2CHKWkmt58We00rYTJiUhVnD1u9" },
  { file: "layover.kml", show: "TL", mid: "1Lf_CJhnpm9Swvteq4xoKsEzQFUTgzs54" },
  { file: "no-reservations.kml", show: "NR", mid: "1v5dRvcj5mxIyml9plKbixS2VyUhgseyQ" },
  { file: "parts-unknown-s1-6.kml", show: "PU", mid: "1D9EZ9x7M_fZai0FApdoqkwlSxGBTvW90" },
  { file: "parts-unknown-s7-12.kml", show: "PU", mid: "1OWBVG0VoE1aPNa4SlmMtO3KTqbfeaOqC" },
];

const OTHER_SOURCES = [
  { file: "abwm-all-places.json", url: "https://www.anthonybourdainworldmap.com/api/all-places" },
  {
    file: "zhang-places.csv",
    url: "https://raw.githubusercontent.com/underthecurve/bourdain-travel-places/master/bourdain_travel_places.csv",
  },
  {
    file: "zhang-map-data.csv",
    url: "https://raw.githubusercontent.com/underthecurve/bourdain-travel-places/master/Map_data.csv",
  },
];

/** No Reservations map folders are categories — only food folders become venues. */
const NR_KIND = new Map([
  ["Restaurants and Bars", "restaurant / bar"],
  ["Food markets", "market"],
]);
const NR_EXCLUDED = new Set(["Sightseeing", "Other Activities", "Lodging"]);

const CLOSED_RE = /\s*[-–—(]\s*(permanently\s+)?closed(\?)?[)!]?\s*$/i;

/**
 * Real food venues the NR fan map filed under "Other Activities" (wineries,
 * farm kitchens, one legendary mussels-and-feather-bowling café…). The folder
 * as a whole stays dropped; these ABWM ids are re-added individually.
 * Curated in the 2026-07 cross-validation audit.
 */
const ABWM_RECOVER_IDS = new Set([
  "ucc-craighton-estates-18053--76722", // UCC Craighton Estates — coffee estate, Jamaica
  "shields-date-garden-33707--116266", // Shields Date Garden — date-shake café, California
  "d-c-central-kitchen-inc-38908--77038", // DC Central Kitchen — Washington
  "gubbeen-farm-house-products-limited-51519--9576", // Gubbeen Farm — Cork
  "vi-a-casa-silva--34539--70967", // Viña Casa Silva — winery, Chile
  "cadieux-cafe-42402--82926", // Cadieux Cafe — Detroit
  "bahia-bar-de-kep-cocktail-bieres-belges-les-pieds-dans-l-rau-10478-104309", // Kep beach bar, Cambodia
  "bibich-winery-43881-15919", // BIBICh Winery — Croatia
  "konoba-sandra-43880-15286", // Konoba Sandra — Croatia
  "popotla-32302--117042", // Popotla fishing-village seafood — Baja
  "az-agr-pedroni-di-pedroni-giuseppe-44651-11041", // Acetaia Pedroni — Modena
  "sorgente-su-gologone-40289-9495", // Su Gologone — Sardinia
]);

// ————————————————————————————————— fetch (opt-in)

async function refetchAll() {
  for (const s of KML_SOURCES) {
    const url = `https://www.google.com/maps/d/kml?mid=${s.mid}&forcekml=1`;
    await fetchTo(url, path.join(RAW, s.file));
  }
  for (const s of OTHER_SOURCES) {
    await fetchTo(s.url, path.join(RAW, s.file));
  }
}

async function fetchTo(url, file) {
  process.stdout.write(`  fetching ${url} … `);
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const body = Buffer.from(await res.arrayBuffer());
  await writeFile(file, body);
  console.log(`${(body.length / 1024).toFixed(0)} KB`);
}

// ————————————————————————————————— load & parse

function seasonOf(folder) {
  const m = folder.match(/season\s*(\d+)/i);
  return m ? Number(m[1]) : undefined;
}

async function loadVenueDrafts() {
  const drafts = [];
  const dropped = { nonFood: 0 };
  for (const src of KML_SOURCES) {
    const xml = await readFile(path.join(RAW, src.file), "utf8");
    const marks = parseKml(xml);
    for (const p of marks) {
      let kind;
      if (src.show === "NR") {
        if (NR_EXCLUDED.has(p.folder)) {
          dropped.nonFood++;
          continue;
        }
        kind = NR_KIND.get(p.folder);
      }
      let name = p.name.replace(/\s+/g, " ").trim();
      let status = "unknown";
      const closedM = name.match(CLOSED_RE);
      if (closedM) {
        // "(Closed?)" = the mapper wasn't sure — strip the tag but stay "unknown"
        status = closedM[2] ? "unknown" : "closed";
        name = name.slice(0, closedM.index).trim();
      }
      drafts.push({
        name,
        slug: slug(name),
        lng: p.lng,
        lat: p.lat,
        show: src.show,
        season: seasonOf(p.folder),
        kind,
        status,
        note: p.description,
      });
    }
    console.log(`  ${src.file}: ${marks.length} placemarks`);
  }
  console.log(`  (dropped ${dropped.nonFood} non-food No Reservations pins: sightseeing/lodging/other)`);
  return drafts;
}

// ————————————————————————————————— merge duplicates

function mergeDrafts(drafts) {
  // primary key: slug + ~110 m coordinate cell; then same-slug clusters within 300 m
  const bySlug = new Map();
  for (const d of drafts) {
    if (!bySlug.has(d.slug)) bySlug.set(d.slug, []);
    bySlug.get(d.slug).push(d);
  }
  const venues = [];
  for (const group of bySlug.values()) {
    const clusters = [];
    for (const d of group) {
      const home = clusters.find(
        (c) => haversine(c.lat, c.lng, d.lat, d.lng) < 0.8,
      );
      if (home) {
        home.members.push(d);
      } else {
        clusters.push({ lat: d.lat, lng: d.lng, members: [d] });
      }
    }
    for (const c of clusters) {
      const m0 = c.members[0];
      const visitKeys = new Map();
      for (const m of c.members) {
        const k = `${m.show}|${m.season ?? ""}`;
        if (!visitKeys.has(k)) visitKeys.set(k, { show: m.show, season: m.season });
      }
      venues.push({
        name: m0.name,
        slug: m0.slug,
        lat: c.lat,
        lng: c.lng,
        rawVisits: [...visitKeys.values()],
        kind: c.members.map((m) => m.kind).find(Boolean),
        status: c.members.some((m) => m.status === "closed") ? "closed" : "unknown",
        note: c.members.map((m) => m.note).sort((a, b) => b.length - a.length)[0] ?? "",
        city: "",
        country: "",
      });
    }
  }
  return venues;
}

// ————————————————————————————————— enrichment sources

async function loadAbwm() {
  const raw = JSON.parse(await readFile(path.join(RAW, "abwm-all-places.json"), "utf8"));
  const list = Array.isArray(raw) ? raw : raw.places ?? [];
  return list.map((p) => ({
    id: p.id,
    name: (p.name ?? "").trim(),
    show: SHOW_NAMES[p.show],
    slug: slug(p.name ?? ""),
    lat: Number(p.lat),
    lng: Number(p.lng),
    city: (p.city ?? "").trim(),
    country: normCountry(p.country),
    description: (p.description ?? "").trim(),
  }));
}

async function loadStops() {
  const places = parseCsv(await readFile(path.join(RAW, "zhang-places.csv"), "utf8"));
  const mapData = parseCsv(await readFile(path.join(RAW, "zhang-map-data.csv"), "utf8"));

  const stops = [];
  for (const r of places) {
    const show = SHOW_NAMES[r.show];
    const [lat, lng] = (r.coordinates ?? "").split(",").map(Number);
    if (!show || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    stops.push({
      show,
      season: Number(r.season) || undefined,
      ep: Number(r.ep) || undefined,
      title: r.title,
      city: r.city_or_area,
      country: normCountry(r.country),
      lat,
      lng,
    });
  }
  // A Cook's Tour stops only exist in Map_data.csv
  const years = new Map();
  for (const r of mapData) {
    const show = SHOW_NAMES[r.Show];
    if (!show) continue;
    const season = Number(r.Season) || undefined;
    const ep = Number(r.Episode) || undefined;
    const year = Number(r.Year) || undefined;
    if (season && ep && year) years.set(`${show}|${season}|${ep}`, year);
    if (show === "ACT") {
      const lat = Number(r.Latitude);
      const lng = Number(r.Longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      stops.push({
        show,
        season,
        ep,
        title: r.Title,
        city: r.City,
        country: normCountry(r.Country),
        lat,
        lng,
      });
    }
  }
  const byShow = {};
  for (const s of stops) (byShow[s.show] ??= []).push(s);
  return { byShow, all: stops, years };
}

// ————————————————————————————————— geocoding (cached, optional)

async function loadGeocodeCache() {
  const file = path.join(CACHE, "geocode.json");
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  return {};
}

async function saveGeocodeCache(cache) {
  await mkdir(CACHE, { recursive: true });
  await writeFile(path.join(CACHE, "geocode.json"), JSON.stringify(cache, null, 1));
}

async function reverseGeocode(lng, lat, key, cache) {
  const ck = `${lng.toFixed(3)},${lat.toFixed(3)}`;
  if (cache[ck]) return cache[ck];
  const url = `https://api.maptiler.com/geocoding/${lng.toFixed(6)},${lat.toFixed(6)}.json?key=${key}`;
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const gj = await res.json();
  const feats = gj.features ?? [];
  const byType = (t) =>
    feats.find((f) => (f.place_type ?? []).includes(t))?.text ?? "";
  const result = {
    city: byType("place") || byType("municipality") || byType("region") || "",
    country: normCountry(byType("country")),
  };
  cache[ck] = result;
  await new Promise((r) => setTimeout(r, 120)); // stay polite
  return result;
}

// ————————————————————————————————— attribution

function attributeVisit(venue, rawVisit, stopsByShow, years) {
  const { show, season } = rawVisit;
  let cands = stopsByShow[show] ?? [];
  if (season != null) {
    const sub = cands.filter((s) => s.season === season);
    if (sub.length > 0) cands = sub;
  }
  const scored = cands
    .map((s) => ({ s, d: haversine(venue.lat, venue.lng, s.lat, s.lng) }))
    .sort((a, b) => a.d - b.d);
  if (scored.length === 0 || scored[0].d > 250) return { show, season };

  // a city that hosted several episodes of the same show is ambiguous — don't guess
  const near = scored.filter((x) => x.d < 25);
  const episodes = new Set(near.map((x) => `${x.s.season}|${x.s.ep}`));
  if (episodes.size > 1) return { show, season };

  const best = scored[0].s;
  const year = years.get(`${show}|${best.season}|${best.ep}`);
  return {
    show,
    season: best.season,
    episode: best.ep,
    title: best.title || undefined,
    year,
  };
}

// ————————————————————————————————— main

async function main() {
  const refetch = process.argv.includes("--refetch");
  if (refetch) {
    console.log("re-fetching sources →  pipeline/raw/");
    await refetchAll();
  }

  console.log("parsing KML base layer");
  const drafts = await loadVenueDrafts();
  let venues = mergeDrafts(drafts);
  console.log(`  ${drafts.length} placemarks → ${venues.length} unique venues`);

  console.log("joining anthonybourdainworldmap.com dump (city/country/description)");
  const abwm = await loadAbwm();
  const abwmBySlug = new Map();
  for (const a of abwm) {
    if (!abwmBySlug.has(a.slug)) abwmBySlug.set(a.slug, []);
    abwmBySlug.get(a.slug).push(a);
  }
  let abwmHits = 0;
  for (const v of venues) {
    let match;
    const named = (abwmBySlug.get(v.slug) ?? [])
      .map((a) => ({ a, d: haversine(v.lat, v.lng, a.lat, a.lng) }))
      .filter((x) => x.d < 5)
      .sort((x, y) => x.d - y.d)[0];
    if (named) {
      match = named.a;
    } else {
      // same pin, renamed: nearest dump entry within 120 m
      let bestD = 0.12;
      for (const a of abwm) {
        const d = haversine(v.lat, v.lng, a.lat, a.lng);
        if (d < bestD) {
          bestD = d;
          match = a;
        }
      }
    }
    if (match) {
      abwmHits++;
      v.city = match.city;
      v.country = match.country;
      if (!v.note && match.description) v.note = match.description;
    }
  }
  console.log(`  matched ${abwmHits}/${venues.length}`);

  console.log("recovering curated food venues from the dropped NR folders");
  let recovered = 0;
  for (const a of abwm) {
    if (!ABWM_RECOVER_IDS.has(a.id) || !a.show) continue;
    const covered = venues.some(
      (v) =>
        haversine(v.lat, v.lng, a.lat, a.lng) < 0.12 ||
        (v.slug === a.slug && haversine(v.lat, v.lng, a.lat, a.lng) < 5),
    );
    if (covered) continue;
    venues.push({
      name: a.name,
      slug: a.slug,
      lat: a.lat,
      lng: a.lng,
      rawVisits: [{ show: a.show, season: undefined }],
      kind: undefined,
      status: "unknown",
      note: a.description,
      city: a.city,
      country: a.country,
    });
    recovered++;
  }
  console.log(`  recovered: ${recovered}/${ABWM_RECOVER_IDS.size}`);

  console.log("episode attribution via Zhang episode stops (CC BY 4.0)");
  const { byShow, all: allStops, years } = await loadStops();
  let attributed = 0;
  let visitsTotal = 0;
  for (const v of venues) {
    v.visits = v.rawVisits
      .map((rv) => attributeVisit(v, rv, byShow, years))
      .sort(
        (a, b) =>
          SHOW_ORDER.indexOf(a.show) - SHOW_ORDER.indexOf(b.show) ||
          (a.season ?? 99) - (b.season ?? 99) ||
          (a.episode ?? 99) - (b.episode ?? 99),
      );
    visitsTotal += v.visits.length;
    attributed += v.visits.filter((x) => x.episode != null).length;
    delete v.rawVisits;
  }
  console.log(`  ${attributed}/${visitsTotal} visits pinned to a specific episode`);

  console.log("merging eatlikebourdain.com (new venues, episode fills, closed statuses)");
  // Zhang's episode titles, used to verify/shift ELB episode numbers
  const epTitles = new Map();
  for (const s of allStops) {
    if (!s.season || !s.ep || !s.title) continue;
    const k = `${s.show}|${s.season}`;
    if (!epTitles.has(k)) epTitles.set(k, new Map());
    epTitles.get(k).set(s.ep, s.title);
  }
  const elbStats = await applyElb(venues, path.join(RAW, "eatlikebourdain.json"), epTitles);
  console.log(
    `  ${elbStats.entries} entries → matched ${elbStats.matched} · added ${elbStats.added}` +
      ` · skipped ${elbStats.skippedNoCoords} (no coords) + ${elbStats.skippedJunk} (unmappable)`,
  );
  console.log(
    `  episode numbers filled: ${elbStats.filledEpisodes} (${elbStats.shifted} title-shifted, ${elbStats.conflicts} corrected)` +
      ` · new visits: ${elbStats.addedVisits} · status: +${elbStats.statusClosed} closed, +${elbStats.statusOpen} confirmed open`,
  );
  if (process.env.ELB_DEBUG) {
    console.log("  [debug] correction samples:");
    for (const s of elbStats.conflictSamples) console.log(`    ${s}`);
    console.log("  [debug] junk samples:", elbStats.junkSamples.join(" · "));
    console.log("  [debug] additions:");
    for (const s of elbStats.additionNames) console.log(`    ${s}`);
  }

  console.log("merging philazar NYC list (coordinates for famous NYC gaps)");
  const phRows = parseCsv(await readFile(path.join(RAW, "philazar-nyc.csv"), "utf8"));
  let phAdded = 0;
  for (const r of phRows) {
    const show = SHOW_NAMES[r.show];
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (!r.restaurant || !show || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    // NYC is dense — plain proximity needs to be tight, name matches can be wide
    const rk = slug(r.restaurant).replace(/-/g, "");
    const covered = venues.some((v) => {
      const d = haversine(lat, lng, v.lat, v.lng);
      if (d < 0.12) return true;
      if (d > 15) return false; // metro-wide: this list's geocoding is occasionally off by boroughs
      const vk = v.slug.replace(/-/g, "");
      return vk.length >= 6 && rk.length >= 6 && (vk.includes(rk) || rk.includes(vk));
    });
    if (covered) continue;
    venues.push({
      name: r.restaurant,
      slug: slug(r.restaurant),
      lat,
      lng,
      visits: [{ show }],
      kind: undefined,
      status: "unknown",
      note: "",
      city: "",
      country: "",
    });
    phAdded++;
  }
  console.log(`  ${phRows.length} rows → added ${phAdded}`);

  console.log("forward geocoding coordinate-less venues from the web lists");
  {
    const fwdCache = await loadFwdCache(CACHE);
    const kOf = (s) => slug(s).replace(/-/g, "");
    const vKeys = venues.map((v) => ({ k: kOf(v.name), c: v.country }));
    const existsByName = (nm, country) => {
      const k = kOf(nm);
      if (k.length < 5) return true; // too generic to trust a name-only add
      return vKeys.some(
        (v) =>
          (v.k === k || (v.k.length >= 6 && k.length >= 6 && (v.k.includes(k) || k.includes(v.k)))) &&
          (!country || !v.c || v.c === country),
      );
    };
    const countryFromAddress = (addr) => {
      if (!addr) return "";
      if (/\b[A-Z]{2},?\s+\d{5}/.test(addr) || /,\s*[A-Z]{2}\s*$/.test(addr.trim()) || /\bUSA\b/i.test(addr))
        return "United States";
      const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
      let last = parts[parts.length - 1] ?? "";
      last = last.replace(/[\d-]+/g, "").trim();
      if (!last && parts.length >= 2) last = parts[parts.length - 2].replace(/[\d-]+/g, "").trim();
      return normCountry(last);
    };

    // candidates: eatlikebourdain entries without coordinates + unmatched
    // noreservationslocations.com restaurants (street addresses)
    const cands = new Map();
    const addCand = (c) => {
      const key = `${kOf(c.name)}|${c.country}`;
      const prev = cands.get(key);
      if (!prev) {
        cands.set(key, c);
        return;
      }
      prev.address ||= c.address;
      prev.city ||= c.city;
      if (c.status === "closed" || (c.status === "open" && prev.status === "unknown")) prev.status = c.status;
      if ((c.note ?? "").length > (prev.note ?? "").length) prev.note = c.note;
      for (const nv of c.visits)
        if (!prev.visits.some((pv) => pv.show === nv.show && pv.season === nv.season && pv.episode === nv.episode))
          prev.visits.push(nv);
    };

    for (const e of elbStats.noCoordEntries) {
      if (existsByName(e.name, e.country)) continue;
      // same episode-trust rule as matched entries: keep an ELB episode number
      // only when Zhang's titles verify it (their numbering skips recap eps)
      const visits = e.visits.map((v) => {
        if (v.episode == null) return v;
        const r = resolveEp(v, epTitles);
        return r.verified
          ? { show: v.show, season: r.season ?? v.season, episode: r.episode, title: v.title, year: v.year }
          : { show: v.show, season: v.season, year: v.year };
      });
      addCand({ name: e.name, city: e.city, country: e.country, address: "", status: e.status, note: e.note, visits });
    }
    const nrlRows = parseCsv(await readFile(path.join(RAW, "nrl-places.csv"), "utf8"));
    let nrlSeen = 0;
    for (const r of nrlRows) {
      if (r.category !== "restaurant" || !r.name || r.name.length < 3) continue;
      nrlSeen++;
      const country = countryFromAddress(r.address);
      if (existsByName(r.name, country)) continue;
      const visit = { show: "NR", season: Number(r.season) || undefined, episode: Number(r.episode) || undefined, title: r.episode_title || undefined };
      if (visit.episode != null) {
        const res = resolveEp(visit, epTitles);
        // the site's numbering is unvetted — keep an episode only when Zhang's titles confirm it
        if (res.verified) visit.episode = res.episode;
        else visit.episode = undefined;
      }
      // the episode title is usually the city — use it as a POI hint, but only
      // when it actually looks like a place name
      const cityHint = /^[\p{L} .'-]{2,24}$/u.test((r.episode_title ?? "").trim()) ? r.episode_title.trim() : "";
      addCand({ name: r.name, city: cityHint, country, address: r.address ?? "", status: "unknown", note: (r.note ?? "").trim(), visits: [visit] });
    }

    // explorepartsunknown.com (CNN's official Parts Unknown site, via Wayback):
    // only entries whose note marks an actual Bourdain visit — the site also
    // published editorial "perfect day" itineraries he never filmed
    const epuRaw = JSON.parse(await readFile(path.join(RAW, "epu-venues.json"), "utf8"));
    const BOURDAIN_RE = /bourdain\s+(ate|had|visited|went|order|tried|drank|stopped|dined)|tony\s+(ate|had|visited)/i;
    let epuMarked = 0;
    for (const e of epuRaw) {
      if (!e.name || e.name.length < 3 || !BOURDAIN_RE.test(e.note ?? "")) continue;
      epuMarked++;
      const country = normCountry(e.country ?? "");
      if (existsByName(e.name, country)) continue;
      const season = Number(String(e.season ?? "").replace(/\D/g, "")) || undefined;
      addCand({
        name: e.name,
        city: (e.city ?? "").trim(),
        country,
        address: e.address ?? "",
        status: "unknown",
        note: (e.note ?? "").trim(),
        visits: [{ show: "PU", season }],
      });
    }

    let added = 0;
    let viaAddr = 0;
    let viaPoi = 0;
    let unresolved = 0;
    for (const c of cands.values()) {
      let hit = null;
      const mtKey = process.env.MAPTILER_API_KEY;
      if (c.address && mtKey) {
        hit = await geocodeAddress(c.address, c.country, mtKey, fwdCache);
        if (hit) viaAddr++;
      }
      if (!hit) {
        hit = await geocodePoi(c.name, c.city, c.country, fwdCache);
        if (!hit && c.city) hit = await geocodePoi(c.name, "", c.country, fwdCache);
        if (hit) viaPoi++;
      }
      if (!hit) {
        unresolved++;
        continue;
      }
      const v = {
        name: c.name,
        slug: slug(c.name),
        lat: hit.lat,
        lng: hit.lng,
        visits: c.visits,
        kind: undefined,
        status: c.status,
        note: c.note,
        city: c.city,
        country: c.country,
      };
      // geocoded venues never went through the Zhang attribution stage — pin
      // their episode-less visits the same way (same honesty rules)
      v.visits = v.visits.map((x) =>
        x.episode == null && !x.title ? attributeVisit(v, { show: x.show, season: x.season }, byShow, years) : x,
      );
      venues.push(v);
      added++;
    }
    await saveFwdCache(CACHE, fwdCache);
    console.log(
      `  candidates ${cands.size} (nrl rows: ${nrlSeen} · CNN field-guide entries: ${epuMarked}) → geocoded ${added}` +
        ` (${viaAddr} by address, ${viaPoi} by POI) · unresolved ${unresolved} (left unmapped, no guessed pins)`,
    );
  }

  console.log("collapsing near-duplicate pins (<150 m, containing names)");
  {
    const removed = new Set();
    const k = (v) => v.slug.replace(/-/g, "");
    for (let i = 0; i < venues.length; i++) {
      const a = venues[i];
      if (removed.has(a)) continue;
      for (let j = i + 1; j < venues.length; j++) {
        const b = venues[j];
        if (removed.has(b)) continue;
        if (Math.abs(a.lat - b.lat) > 0.006 || Math.abs(a.lng - b.lng) > 0.012) continue;
        const ka = k(a);
        const kb = k(b);
        if (ka.length < 6 || kb.length < 6 || !(ka.includes(kb) || kb.includes(ka))) continue;
        // identical names collapse across a wider radius than mere containment
        if (haversine(a.lat, a.lng, b.lat, b.lng) > (ka === kb ? 0.6 : 0.15)) continue;
        for (const bv of b.visits)
          if (!a.visits.some((av) => av.show === bv.show && av.season === bv.season && av.episode === bv.episode))
            a.visits.push(bv);
        if (b.status === "closed" || (b.status === "open" && a.status === "unknown")) a.status = b.status;
        if ((b.note ?? "").length > (a.note ?? "").length) a.note = b.note;
        a.kind ??= b.kind;
        removed.add(b);
      }
    }
    if (removed.size) venues = venues.filter((v) => !removed.has(v));
    console.log(`  merged: ${removed.size}`);
  }

  console.log("city/country fallback (nearest episode stop ≤ 100 km, then geocoder)");
  let stopCity = 0;
  const needGeocode = [];
  for (const v of venues) {
    if (v.city && v.country) continue;
    let best;
    let bestD = 100;
    for (const s of allStops) {
      const d = haversine(v.lat, v.lng, s.lat, s.lng);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (best) {
      stopCity++;
      v.city = v.city || best.city;
      v.country = v.country || best.country;
    } else {
      needGeocode.push(v);
    }
  }
  console.log(`  from stops: ${stopCity} · needs geocoder: ${needGeocode.length}`);

  for (const v of venues) {
    if (!v.country && v.lat < -60) v.country = "Antarctica";
  }

  const key = process.env.MAPTILER_API_KEY;
  if (needGeocode.length > 0 && key) {
    const cache = await loadGeocodeCache();
    let done = 0;
    for (const v of needGeocode) {
      try {
        const g = await reverseGeocode(v.lng, v.lat, key, cache);
        v.city = v.city || g.city;
        // cache hits skip the fetch path, so normalize here
        v.country = v.country || normCountry(g.country);
        done++;
      } catch (e) {
        console.warn(`  geocode failed for ${v.name}: ${e.message}`);
      }
    }
    await saveGeocodeCache(cache);
    console.log(`  geocoded: ${done}`);
  } else if (needGeocode.length > 0) {
    console.warn(`  MAPTILER_API_KEY missing — ${needGeocode.length} venues keep empty city`);
  }

  // ——— emit
  const visitCmp = (a, b) =>
    SHOW_ORDER.indexOf(a.show) - SHOW_ORDER.indexOf(b.show) ||
    (a.season ?? 99) - (b.season ?? 99) ||
    (a.episode ?? 99) - (b.episode ?? 99);
  for (const v of venues) v.visits.sort(visitCmp);

  const feats = venues
    .sort(
      (a, b) =>
        a.country.localeCompare(b.country) ||
        a.city.localeCompare(b.city) ||
        a.name.localeCompare(b.name),
    )
    .map((v) => {
      const shows = SHOW_ORDER.filter((s) => v.visits.some((x) => x.show === s));
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [Number(v.lng.toFixed(6)), Number(v.lat.toFixed(6))],
        },
        properties: {
          id: `${v.slug}@${v.lat.toFixed(4)},${v.lng.toFixed(4)}`,
          name: v.name,
          city: v.city,
          country: v.country || "—",
          kind: v.kind,
          emoji: emojiFor(v.name, v.kind, v.note),
          status: v.status,
          note: v.note ? (v.note.length > 600 ? `${v.note.slice(0, 597)}…` : v.note) : undefined,
          visits: v.visits,
          shows,
          primaryShow: shows[shows.length - 1],
        },
      };
    });

  const fc = {
    type: "FeatureCollection",
    metadata: {
      name: "Bourdain Atlas",
      built: new Date().toISOString(),
      counts: Object.fromEntries(
        SHOW_ORDER.map((s) => [s, feats.filter((f) => f.properties.shows.includes(s)).length]),
      ),
      credits: [
        "Venue pins: community Google My Maps by Reddit user deannd (5-map series)",
        "City/country + dish notes: anthonybourdainworldmap.com (deannd & Peter Keating)",
        "Episode stops: Christine Zhang, bourdain-travel-places (CC BY 4.0)",
        "Additional venues, episode numbers & closed statuses: eatlikebourdain.com",
        "Geocoding: MapTiler",
      ],
    },
    features: feats,
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(fc));
  console.log(`\nwrote ${OUT}`);
  console.log(`  venues: ${feats.length}`);
  console.log(`  per show:`, fc.metadata.counts);
  const noCity = feats.filter((f) => !f.properties.city).length;
  console.log(`  venues without city: ${noCity}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
