/**
 * Forward geocoding for venues that exist in public lists but ship without
 * coordinates. Two backends:
 *   - MapTiler  — street addresses (noreservationslocations.com rows)
 *   - Nominatim — name+city POI lookups (eatlikebourdain no-coord entries),
 *                 1.1 s between calls per the OSM usage policy
 * Both are strict: a result that doesn't verify against the expected country
 * (and city, when we have one) is rejected — a missing pin beats a wrong pin.
 * Everything is cached in pipeline/cache/geocode-fwd.json, so re-runs are free
 * and the vendored cache keeps builds reproducible offline.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const UA = "bourdain-atlas-pipeline/1.0 (personal fan project; contact via repo)";

const fold = (s) =>
  (s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function loadFwdCache(cacheDir) {
  const file = path.join(cacheDir, "geocode-fwd.json");
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  return {};
}

export async function saveFwdCache(cacheDir, cache) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, "geocode-fwd.json"), JSON.stringify(cache, null, 1));
}

/** MapTiler forward geocode of a street address; verify country text. */
export async function geocodeAddress(address, country, key, cache) {
  const ck = `mt|${address}`;
  if (ck in cache) return cache[ck];
  let result = null;
  try {
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(address)}.json?key=${key}&limit=3`;
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.ok) {
      const gj = await res.json();
      for (const f of gj.features ?? []) {
        const blob = fold(JSON.stringify([f.place_name, f.context ?? []]));
        if (country && !blob.includes(fold(country))) continue;
        result = { lat: f.center[1], lng: f.center[0], src: "maptiler" };
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

/** Nominatim POI lookup by name (+city) with country/city verification. */
export async function geocodePoi(name, city, country, cache) {
  const q = [name, city, country].filter(Boolean).join(", ");
  const ck = `nm|${q}`;
  if (ck in cache) return cache[ck];
  let result = null;
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&accept-language=en&q=` +
      encodeURIComponent(q);
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.ok) {
      const rows = await res.json();
      for (const r of rows) {
        const a = r.address ?? {};
        if (country && fold(a.country) !== fold(country)) continue;
        const rCity = fold([a.city, a.town, a.village, a.municipality, a.suburb, a.county, a.state].filter(Boolean).join(" "));
        if (city && rCity && !rCity.includes(fold(city)) && !fold(city).includes(fold(a.city ?? a.town ?? ""))) {
          // city mismatch is fatal only when both sides actually name a city
          if (fold(city) && (a.city || a.town || a.village)) continue;
        }
        // POI-ish categories only — a bare street or region match is not a venue
        // (jsonv2 calls the field `category`; classic json calls it `class`)
        const cat = r.category ?? r.class;
        if (!["amenity", "shop", "tourism", "leisure", "craft", "building", "historic"].includes(cat)) continue;
        result = { lat: Number(r.lat), lng: Number(r.lon), src: "nominatim" };
        break;
      }
    }
  } catch {
    return null; // transient failure: don't cache
  } finally {
    await new Promise((r) => setTimeout(r, 1100)); // OSM policy: max ~1 req/s
  }
  cache[ck] = result;
  return result;
}
