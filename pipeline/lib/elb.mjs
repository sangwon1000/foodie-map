/**
 * eatlikebourdain.com integration.
 *
 * The site is a per-city guide database (230 "Anthony Bourdain in X" posts +
 * embedded My Maps). A full extraction lives in raw/eatlikebourdain.json.
 * It is the best-maintained public list (closed statuses updated yearly), so:
 *   - matched venues get episode numbers, closed/open status and notes
 *   - unmatched entries WITH coordinates become new venues
 *   - unmatched entries without coordinates are skipped (we refuse to guess pins)
 */
import { readFile } from "node:fs/promises";
import { haversine, normCountry, slug } from "./util.mjs";

const SHOW_NAMES = {
  "A Cook's Tour": "ACT",
  "No Reservations": "NR",
  "The Layover": "TL",
  "Parts Unknown": "PU",
};

const STATUS_MAP = {
  open: "open",
  seasonal: "open",
  temporarily_closed: "open",
  possibly_closed: "unknown",
  closed: "closed",
};

// pins that can't be found again (private homes, unnamed stalls) stay off the map
const JUNK_RE =
  /\b(unnamed|unknown|unidentified)\b|private (home|residence|beach)|local (meal|dining)|^home of\b/i;

const fold = (s) =>
  (s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const key = (s) => fold(s).replace(/ /g, "");
const STOP = new Set("the and restaurant restaurante cafe bar los las les le la el de du da di at of house grill shop food".split(" "));
const toks = (s) => new Set(fold(s).split(" ").filter((w) => w.length >= 3 && !STOP.has(w)));
const jac = (a, b) => {
  if (!a.size || !b.size) return 0;
  let i = 0;
  for (const t of a) if (b.has(t)) i++;
  return i / (a.size + b.size - i);
};

function adaptEntry(e) {
  const name = e.name.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 3 || JUNK_RE.test(name)) return null;

  // One entry = one show. The extraction's `visits[]` often carries the whole
  // POST's cross-show references (every Buenos Aires PU entry "visited" in NR
  // S3E13; Happy Paradise — opened 2017 — tagged NR 2007), so cross-show rows
  // are dropped. THE show comes from an unambiguous `shows` tag, else the post
  // section header, else a unanimous visits[] list; otherwise the entry only
  // contributes status/notes.
  let show;
  const tags = [...new Set((e.shows ?? []).map((s) => SHOW_NAMES[s]).filter(Boolean))];
  if (tags.length === 1) show = tags[0];
  if (!show) {
    const sec = Object.keys(SHOW_NAMES).find((k) => e.section?.includes(k));
    if (sec) show = SHOW_NAMES[sec];
  }
  if (!show && Array.isArray(e.visits) && e.visits.length > 0) {
    const vShows = [...new Set(e.visits.map((v) => SHOW_NAMES[v.show]).filter(Boolean))];
    if (vShows.length === 1) show = vShows[0];
  }

  let visits = [];
  if (show) {
    for (const v of e.visits ?? []) {
      if (SHOW_NAMES[v.show] !== show) continue;
      visits.push({
        show,
        season: v.season ?? undefined,
        episode: v.episode ?? undefined,
        title: v.episode_title || undefined,
        year: v.visit_year || undefined,
      });
    }
    if (visits.length === 0)
      visits = [
        {
          show,
          season: e.season ?? undefined,
          episode: e.episode ?? undefined,
          title: e.episode_title || undefined,
          year: e.visit_year || undefined,
        },
      ];
    else if (visits.length === 1) {
      visits[0].title ??= e.episode_title || undefined;
      visits[0].year ??= e.visit_year || undefined;
    }
    const seen = new Set();
    visits = visits.filter((v) => {
      const k = `${v.show}|${v.season ?? ""}|${v.episode ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  let country = normCountry(e.country ?? "");
  const city = (e.city ?? "").trim();
  if (/^(hong kong|macau)$/i.test(city)) country = city; // ours tracks these as countries

  return {
    name,
    key: key(name),
    toks: toks(name),
    lat: Number.isFinite(e.lat) ? e.lat : undefined,
    lng: Number.isFinite(e.lng) ? e.lng : undefined,
    city,
    country,
    cityF: fold(city),
    countryF: fold(country),
    status: STATUS_MAP[e.status] ?? "unknown",
    note: (e.notes ?? "").trim(),
    visits,
  };
}

function buildIndex(venues) {
  const grid = new Map();
  const cell = (lat, lng) => `${Math.round(lat * 20)}:${Math.round(lng * 20)}`;
  for (const v of venues) {
    v._key = key(v.name);
    v._toks = toks(v.name);
    v._cityF = fold(v.city);
    v._countryF = fold(v.country);
    const c = cell(v.lat, v.lng);
    if (!grid.has(c)) grid.set(c, []);
    grid.get(c).push(v);
  }
  const near = (lat, lng) => {
    const out = [];
    const cy = Math.round(lat * 20);
    const cx = Math.round(lng * 20);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const b = grid.get(`${cy + dy}:${cx + dx}`);
        if (b) out.push(...b);
      }
    return out;
  };
  return { near };
}

function nameish(e, v) {
  if (v._key === e.key && e.key.length >= 5) return true;
  if (e.key.length >= 6 && v._key.length >= 6 && (v._key.includes(e.key) || e.key.includes(v._key)))
    return true;
  return jac(e.toks, v._toks) >= 0.55;
}

function placeOk(e, v) {
  // fuzzy name matches must also agree on where they are
  if (e.cityF && v._cityF && (e.cityF.includes(v._cityF) || v._cityF.includes(e.cityF))) return true;
  return e.countryF && v._countryF && e.countryF === v._countryF;
}

function findMatch(e, venues, index) {
  if (e.lat != null) {
    let best;
    let bestD = 0.35;
    for (const v of index.near(e.lat, e.lng)) {
      const d = haversine(e.lat, e.lng, v.lat, v.lng);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    if (best) return best;
    for (const v of index.near(e.lat, e.lng))
      if (haversine(e.lat, e.lng, v.lat, v.lng) < 8 && nameish(e, v)) return v;
    return undefined;
  }
  // no coordinates: exact-name (with loose place check), then fuzzy + strict place check
  let fuzzy;
  for (const v of venues) {
    if (v._key === e.key && e.key.length >= 5) {
      if (!e.countryF || !v._countryF || e.countryF === v._countryF) return v;
    } else if (!fuzzy && nameish(e, v) && placeOk(e, v)) {
      fuzzy = v;
    }
  }
  return fuzzy;
}

const titleMatch = (a, b) => {
  const fa = fold(a);
  const fb = fold(b);
  if (!fa || !fb) return false;
  return fa.includes(fb) || fb.includes(fa) || jac(toks(a), toks(b)) >= 0.6;
};

/**
 * eatlikebourdain numbers episodes without the "Prime Cuts" recaps, so its
 * numbers drift off Zhang/Wikipedia by one in later PU seasons. Resolve each
 * ELB episode against Zhang's titles: same title → verified; a neighbouring
 * episode's title matches → shift to it; no title data → unverified (usable
 * for fills, never for overrides).
 */
export function resolveEp(ev, epTitles) {
  if (ev.episode == null || !epTitles) return { ...ev, verified: false };
  const season = epTitles.get(`${ev.show}|${ev.season}`);
  if (!season || !ev.title) return { ...ev, verified: false };
  const own = season.get(ev.episode);
  if (own && titleMatch(own, ev.title)) return { ...ev, verified: true };
  for (const [ep2, t2] of season)
    if (titleMatch(t2, ev.title)) return { ...ev, episode: ep2, verified: true, shifted: true };
  return { ...ev, verified: false };
}

function enrich(v, e, stats, epTitles) {
  if (e.status === "closed" && v.status !== "closed") {
    v.status = "closed";
    stats.statusClosed++;
  } else if (e.status === "open" && v.status === "unknown") {
    v.status = "open";
    stats.statusOpen++;
  }
  if (!v.note && e.note) v.note = e.note;
  for (const raw of e.visits) {
    const sameShow = v.visits.filter((x) => x.show === raw.show);
    if (raw.episode == null && raw.season == null) {
      if (sameShow.length === 0) {
        v.visits.push({ show: raw.show });
        stats.addedVisits++;
      }
      continue;
    }
    const ev = resolveEp(raw, epTitles);
    if (ev.shifted) stats.shifted++;
    const exact = sameShow.find((x) => x.season === ev.season && x.episode === ev.episode);
    if (exact) {
      if (ev.title && !exact.title) exact.title = ev.title;
      if (ev.year && !exact.year) exact.year = ev.year;
      continue;
    }
    const fillable = sameShow.find(
      (x) => x.episode == null && (x.season == null || ev.season == null || x.season === ev.season),
    );
    if (fillable) {
      fillable.season = ev.season ?? fillable.season;
      if (ev.episode != null) {
        fillable.episode = ev.episode;
        stats.filledEpisodes++;
      }
      if (ev.title) fillable.title ??= ev.title;
      if (ev.year) fillable.year ??= ev.year;
      continue;
    }
    // same show+season but a different episode than Zhang's guess — override
    // only when the ELB episode is title-verified against Zhang's own titles
    const conflict = sameShow.find((x) => x.season === ev.season && x.episode != null && ev.episode != null);
    if (conflict) {
      if (ev.verified && conflict.episode !== ev.episode) {
        if (stats.conflictSamples.length < 15)
          stats.conflictSamples.push(
            `${v.name}: ${ev.show} S${conflict.season}E${conflict.episode} → E${ev.episode}${ev.title ? ` (${ev.title})` : ""}`,
          );
        conflict.episode = ev.episode;
        if (ev.title) conflict.title = ev.title;
        if (ev.year) conflict.year = ev.year;
        stats.conflicts++;
      }
      continue;
    }
    delete ev.verified;
    delete ev.shifted;
    v.visits.push({ ...ev });
    stats.addedVisits++;
  }
}

export async function applyElb(venues, rawFile, epTitles) {
  const raw = JSON.parse(await readFile(rawFile, "utf8"));
  // map_only = pins on the site's embedded My Maps with no text section — still
  // real venue pins with coordinates
  const places = raw.filter((e) => e.kind === "place" || e.kind === "map_only");
  const entries = places.map(adaptEntry).filter(Boolean);
  const junkSamples = places
    .filter((e) => adaptEntry(e) === null)
    .map((e) => e.name)
    .slice(0, 20);
  const skippedJunk = places.length - entries.length;

  const index = buildIndex(venues);
  const stats = {
    entries: entries.length,
    matched: 0,
    added: 0,
    skippedNoCoords: 0,
    skippedJunk,
    skippedNoShow: 0,
    filledEpisodes: 0,
    conflicts: 0,
    shifted: 0,
    addedVisits: 0,
    statusClosed: 0,
    statusOpen: 0,
    conflictSamples: [],
    additionNames: [],
    junkSamples,
    noCoordEntries: [],
  };

  const additions = [];
  for (const e of entries) {
    const hit = findMatch(e, venues, index);
    if (hit) {
      stats.matched++;
      enrich(hit, e, stats, epTitles);
      continue;
    }
    if (e.visits.length === 0) {
      stats.skippedNoShow++;
      continue;
    }
    if (e.lat == null) {
      stats.skippedNoCoords++;
      stats.noCoordEntries.push(e); // forward-geocoding stage picks these up
      continue;
    }
    // dedupe among the additions themselves (same place in two city guides)
    const dupe = additions.find(
      (a) => haversine(e.lat, e.lng, a.lat, a.lng) < 0.3 && (a.slug === slug(e.name) || nameish(e, { _key: key(a.name), _toks: toks(a.name) })),
    );
    if (dupe) continue;
    stats.additionNames.push(`${e.name} (${e.visits.map((v) => v.show).join("/")} · ${e.city || "?"}, ${e.country || "?"})`);
    additions.push({
      name: e.name,
      slug: slug(e.name),
      lat: e.lat,
      lng: e.lng,
      visits: e.visits.map((v) => {
        const r = resolveEp(v, epTitles);
        delete r.verified;
        delete r.shifted;
        return r;
      }),
      kind: undefined,
      status: e.status,
      note: e.note,
      city: e.city,
      country: e.country,
    });
  }
  venues.push(...additions);
  stats.added = additions.length;

  for (const v of venues) {
    delete v._key;
    delete v._toks;
    delete v._cityF;
    delete v._countryF;
  }
  return stats;
}
