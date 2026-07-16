import type { Place, PlaceProps, ShowId } from "../types";
import type { Profile } from "../profiles";
import { ALL_SOURCES } from "../profiles";

export interface CountryCount {
  name: string;
  count: number;
}

export interface AtlasStats {
  places: number;
  countries: number;
  episodes: number;
}

export interface Atlas {
  profileId: string;
  places: Place[];
  countries: CountryCount[];
  stats: AtlasStats;
}

interface RawFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: PlaceProps;
}

export async function loadAtlas(profile: Profile): Promise<Atlas> {
  if (profile.id === "all") return loadAllAtlas();
  const res = await fetch(`${import.meta.env.BASE_URL}${profile.dataUrl}`);
  if (!res.ok) throw new Error(`failed to load atlas data: ${res.status}`);
  const fc = (await res.json()) as { features: RawFeature[] };
  const showOrder = profile.shows.map((s) => s.id);

  const places: Place[] = fc.features
    .filter((f) => f.geometry?.type === "Point")
    .map((f) => {
      const p = f.properties;
      const visits = Array.isArray(p.visits) ? p.visits : [];
      const shows =
        p.shows && p.shows.length > 0
          ? p.shows
          : showOrder.filter((s) => visits.some((v) => v.show === s));
      return {
        ...p,
        visits,
        shows,
        primaryShow: p.primaryShow ?? shows[shows.length - 1] ?? showOrder[0],
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      };
    });

  const byCountry = new Map<string, number>();
  const episodeKeys = new Set<string>();
  for (const p of places) {
    byCountry.set(p.country, (byCountry.get(p.country) ?? 0) + 1);
    for (const v of p.visits) {
      episodeKeys.add(`${v.show}-${v.season ?? "?"}-${v.episode ?? "?"}-${v.title ?? ""}`);
    }
  }

  const countries = [...byCountry.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    profileId: profile.id,
    places,
    countries,
    stats: {
      places: places.length,
      countries: countries.length,
      episodes: episodeKeys.size,
    },
  };
}

/** ALL view — load every real profile and merge into one atlas, re-keying each
 *  place's `shows`/`primaryShow` to its PROFILE id so the source-filter, the
 *  marker badge and the counts all work off a single dimension. */
async function loadAllAtlas(): Promise<Atlas> {
  const atlases = await Promise.all(ALL_SOURCES.map((p) => loadAtlas(p)));
  const places: Place[] = [];
  atlases.forEach((atlas, i) => {
    const pid = ALL_SOURCES[i].id;
    for (const p of atlas.places)
      places.push({ ...p, profileId: pid, shows: [pid], primaryShow: pid });
  });

  const byCountry = new Map<string, number>();
  const episodeKeys = new Set<string>();
  for (const p of places) {
    byCountry.set(p.country, (byCountry.get(p.country) ?? 0) + 1);
    for (const v of p.visits)
      episodeKeys.add(`${p.profileId}-${v.show}-${v.season ?? "?"}-${v.episode ?? "?"}-${v.title ?? ""}`);
  }
  const countries = [...byCountry.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    profileId: "all",
    places,
    countries,
    stats: { places: places.length, countries: countries.length, episodes: episodeKeys.size },
  };
}

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function matchesQuery(p: Place, q: string): boolean {
  if (!q) return true;
  const hay = fold(
    `${p.name} ${p.city} ${p.country} ${p.kind ?? ""} ${p.note ?? ""} ${p.visits
      .map((v) => v.title ?? "")
      .join(" ")}`,
  );
  return fold(q)
    .split(/\s+/)
    .every((term) => hay.includes(term));
}

export function filterPlaces(
  places: Place[],
  opts: { query: string; shows: Set<ShowId>; country: string },
): Place[] {
  return places.filter((p) => {
    if (opts.country !== "all" && p.country !== opts.country) return false;
    if (!p.shows.some((s) => opts.shows.has(s))) return false;
    return matchesQuery(p, opts.query);
  });
}

// ---- overlap-free pin layout ------------------------------------------------
// Pins are decluttered in screen space at the zoom where clusters fully unfold
// (z18): same-spot stacks fan out and near-duplicates separate, so every place
// gets its own visible, clickable pin — nothing ever hides behind a neighbour.
// Pins that already have room don't move, so street geography stays true.

const UNFOLD_Z = 18;
const WORLD_PX = 512 * 2 ** UNFOLD_Z;
const MIN_SEP = 46; // px between pin centres at z18 — just over the 43.5px icon
const CELL_MUL = 6291469; // > WORLD_PX / MIN_SEP, so (cx, cy) → one number is collision-free

function project(lng: number, lat: number): [number, number] {
  const s = Math.sin((lat * Math.PI) / 180);
  return [
    ((lng + 180) / 360) * WORLD_PX,
    (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD_PX,
  ];
}

function unproject(x: number, y: number): [number, number] {
  const n = Math.PI - (2 * Math.PI * y) / WORLD_PX;
  return [(x / WORLD_PX) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))];
}

/** Push pins apart (in z18 px space) until every pair is ≥ MIN_SEP. Exact-duplicate
 *  coordinates get a deterministic golden-angle nudge first so repulsion has a
 *  direction to work with. Marks the indices it moved in `moved`. */
function declutter(px: Float64Array, moved: Uint8Array): void {
  const n = moved.length;
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = `${px[2 * i].toFixed(1)},${px[2 * i + 1].toFixed(1)}`;
    const c = seen.get(k) ?? 0;
    seen.set(k, c + 1);
    if (c > 0) {
      const a = c * 2.39996;
      px[2 * i] += 0.5 * Math.cos(a);
      px[2 * i + 1] += 0.5 * Math.sin(a);
    }
  }

  for (let iter = 0; iter < 40; iter++) {
    const grid = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const k =
        Math.floor(px[2 * i] / MIN_SEP) * CELL_MUL + Math.floor(px[2 * i + 1] / MIN_SEP);
      const cell = grid.get(k);
      if (cell) cell.push(i);
      else grid.set(k, [i]);
    }
    let bumped = false;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(px[2 * i] / MIN_SEP);
      const cy = Math.floor(px[2 * i + 1] / MIN_SEP);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const cell = grid.get(gx * CELL_MUL + gy);
          if (!cell) continue;
          for (const j of cell) {
            if (j <= i) continue;
            let dx = px[2 * j] - px[2 * i];
            let dy = px[2 * j + 1] - px[2 * i + 1];
            let d2 = dx * dx + dy * dy;
            if (d2 >= MIN_SEP * MIN_SEP) continue;
            if (d2 === 0) {
              const a = (i + j) * 2.39996;
              dx = 0.01 * Math.cos(a);
              dy = 0.01 * Math.sin(a);
              d2 = 0.0001;
            }
            const d = Math.sqrt(d2);
            const push = (MIN_SEP - d) / 2 + 0.5;
            const ux = dx / d;
            const uy = dy / d;
            px[2 * i] -= ux * push;
            px[2 * i + 1] -= uy * push;
            px[2 * j] += ux * push;
            px[2 * j + 1] += uy * push;
            moved[i] = 1;
            moved[j] = 1;
            bumped = true;
          }
        }
      }
    }
    if (!bumped) break;
  }
}

export function toFeatureCollection(places: Place[]) {
  const px = new Float64Array(places.length * 2);
  const movedFlags = new Uint8Array(places.length);
  places.forEach((p, i) => {
    const [x, y] = project(p.lng, p.lat);
    px[2 * i] = x;
    px[2 * i + 1] = y;
  });
  declutter(px, movedFlags);

  return {
    type: "FeatureCollection" as const,
    features: places.map((p, i) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: movedFlags[i]
          ? unproject(px[2 * i], px[2 * i + 1])
          : ([p.lng, p.lat] as [number, number]),
      },
      properties: {
        id: p.id,
        name: p.name,
        city: p.city,
        country: p.country,
        emoji: p.emoji ?? "🍽️",
        primaryShow: p.primaryShow,
        ...(p.profileId ? { profileId: p.profileId } : {}),
      },
    })),
  };
}

export function placeMapUrl(p: Place, service: "google" | "naver"): string {
  if (service === "naver") {
    const q = encodeURIComponent(`${p.name} ${p.city.split(" ")[0] ?? ""}`.trim());
    return `https://map.naver.com/p/search/${q}`;
  }
  const q = encodeURIComponent(`${p.name}, ${p.city}, ${p.country}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
