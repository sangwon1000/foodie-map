import type { Place, PlaceProps, ShowId } from "../types";
import { SHOW_ORDER } from "../types";

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
  places: Place[];
  countries: CountryCount[];
  stats: AtlasStats;
}

interface RawFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: PlaceProps;
}

export async function loadAtlas(): Promise<Atlas> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/restaurants.geojson`);
  if (!res.ok) throw new Error(`failed to load atlas data: ${res.status}`);
  const fc = (await res.json()) as { features: RawFeature[] };

  const places: Place[] = fc.features
    .filter((f) => f.geometry?.type === "Point")
    .map((f) => {
      const p = f.properties;
      const visits = Array.isArray(p.visits) ? p.visits : [];
      const shows =
        p.shows && p.shows.length > 0
          ? p.shows
          : SHOW_ORDER.filter((s) => visits.some((v) => v.show === s));
      return {
        ...p,
        visits,
        shows,
        primaryShow: p.primaryShow ?? shows[shows.length - 1] ?? "PU",
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
    places,
    countries,
    stats: {
      places: places.length,
      countries: countries.length,
      episodes: episodeKeys.size,
    },
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
    `${p.name} ${p.city} ${p.country} ${p.visits.map((v) => v.title ?? "").join(" ")}`,
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

export function toFeatureCollection(places: Place[]) {
  return {
    type: "FeatureCollection" as const,
    features: places.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        name: p.name,
        city: p.city,
        country: p.country,
        emoji: p.emoji ?? "🍽️",
        primaryShow: p.primaryShow,
      },
    })),
  };
}

export function googleMapsUrl(p: Place): string {
  const q = encodeURIComponent(`${p.name}, ${p.city}, ${p.country}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
