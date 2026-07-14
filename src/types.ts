export type ShowId = "ACT" | "NR" | "TL" | "PU";

export interface ShowMeta {
  id: ShowId;
  name: string;
  short: string;
  years: string;
  network: string;
  color: string;
  emoji: string;
}

/** Chronological, fixed categorical order — colors/emoji follow the entity, never reshuffled. */
export const SHOW_ORDER: ShowId[] = ["ACT", "NR", "TL", "PU"];

export const SHOWS: Record<ShowId, ShowMeta> = {
  ACT: {
    id: "ACT",
    name: "A Cook's Tour",
    short: "cook's tour",
    years: "2002–03",
    network: "Food Network",
    color: "#0fa48f",
    emoji: "🧑‍🍳",
  },
  NR: {
    id: "NR",
    name: "No Reservations",
    short: "no reservations",
    years: "2005–12",
    network: "Travel Channel",
    color: "#c08a0a",
    emoji: "🌶️",
  },
  TL: {
    id: "TL",
    name: "The Layover",
    short: "the layover",
    years: "2011–13",
    network: "Travel Channel",
    color: "#4a82e8",
    emoji: "✈️",
  },
  PU: {
    id: "PU",
    name: "Parts Unknown",
    short: "parts unknown",
    years: "2013–18",
    network: "CNN",
    color: "#e8482f",
    emoji: "🧭",
  },
};

export interface Visit {
  show: ShowId;
  season?: number;
  episode?: number;
  /** episode title */
  title?: string;
  year?: number;
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
  visits: Visit[];
  /** denormalized for filtering / styling */
  shows: ShowId[];
  primaryShow: ShowId;
}

export interface Place extends PlaceProps {
  lng: number;
  lat: number;
}

export function visitLabel(v: Visit): string {
  const se =
    v.season != null && v.episode != null
      ? `S${String(v.season).padStart(2, "0")}E${String(v.episode).padStart(2, "0")}`
      : v.season != null
        ? `season ${v.season}`
        : "";
  return se;
}
