/** Show/series id — profile-scoped (e.g. "PU" for bourdain, "BB" for 백반기행). */
export type ShowId = string;

export interface ShowMeta {
  id: ShowId;
  name: string;
  short: string;
  years?: string;
  network?: string;
  color: string;
  emoji: string;
  /** person avatar image (ALL view — used as the map marker + filter chip) */
  avatar?: string;
}

export interface Visit {
  show: ShowId;
  season?: number;
  episode?: number;
  /** episode title / topic / chef */
  title?: string;
  year?: number;
  /** pre-formatted episode label (e.g. "132회") — overrides visitLabel */
  label?: string;
  /** source video URL (YouTube shows) */
  video?: string;
}

export type PlaceStatus = "open" | "closed" | "unknown";

export interface PlaceProps {
  id: string;
  name: string;
  city: string;
  country: string;
  /** restaurant · bar · market … */
  kind?: string;
  /** marker emoji assigned by the pipeline */
  emoji?: string;
  status?: PlaceStatus;
  note?: string;
  /** user rating + review count (KR profiles, from DiningCode) */
  rating?: number;
  reviews?: number;
  /** food/thumbnail image URL (KR profiles, from YouTube-map sources) */
  image?: string;
  /** award / grade label — michelin "3 Stars", WBS "World's Best Steaks #7" */
  award?: string;
  /** cuisine type (michelin) */
  cuisine?: string;
  /** price band, e.g. "$$$$" (michelin) */
  price?: string;
  /** michelin green star (sustainability) */
  greenStar?: boolean;
  /** ranking position — best (lowest) across editions (world's best steaks) */
  rank?: number;
  /** per-edition ranks for multi-year awards (WBS): { "2026": 1, "2025": 6 } */
  ranks?: Record<string, number>;
  /** edition year of the best rank */
  bestYear?: number;
  /** external source/detail page — michelin guide, WBS list, google-maps link */
  sourceUrl?: string;
  /** the restaurant's own website */
  websiteUrl?: string;
  visits: Visit[];
  /** denormalized for filtering / styling */
  shows: ShowId[];
  primaryShow: ShowId;
  /** which real profile this place came from (set in the aggregated ALL view) */
  profileId?: string;
}

export interface Place extends PlaceProps {
  lng: number;
  lat: number;
}

export function visitLabel(v: Visit): string {
  if (v.label) return v.label;
  return v.season != null && v.episode != null
    ? `S${String(v.season).padStart(2, "0")}E${String(v.episode).padStart(2, "0")}`
    : v.season != null
      ? `season ${v.season}`
      : "";
}
