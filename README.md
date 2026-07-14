# The Bourdain Atlas

An interactive globe of **1,861 restaurants, bars, markets and stops**
Anthony Bourdain visited across his four travel shows:

| Show | Years | Places |
|---|---|---|
| A Cook's Tour | 2002–03 | 134 |
| No Reservations | 2005–12 | 613 |
| The Layover | 2011–13 | 447 |
| Parts Unknown | 2013–18 | 702 |

Each place carries its coordinates, city/country, what Tony ate there, and — where
it can be pinned down — the exact episode (`S08E02 “Hanoi” · 2016`). 33 venues span
multiple shows (e.g. Swan Oyster Depot: Cook's Tour → The Layover → Parts Unknown).

## Stack

- **App** — Vite + React + TypeScript, MapLibre GL (globe projection),
  MapTiler `dataviz-light` basemap (falls back to CARTO positron without a key).
  Markers are emoji stickers 🍜🦪🌮 — the pipeline assigns each venue an emoji from
  its name/category/dish notes, and the app rasterizes them into map icons on the fly.
- **Pipeline** — plain Node (`pipeline/build.mjs`), no dependencies

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

`.env` needs `MAPTILER_API_KEY=…` (free tier is fine). Without it the app still
runs on the CARTO fallback basemap; only pipeline geocoding requires the key.

## Data pipeline

```bash
npm run pipeline               # rebuild public/data/restaurants.geojson from pipeline/raw/
npm run pipeline -- --refetch  # re-download every source first
```

Stages:

1. **Base layer** — five community Google My Maps KML exports (one per show era),
   vendored in `pipeline/raw/`. Venue name + pin + description; season folders for
   The Layover / Parts Unknown; category folders for No Reservations (non-food pins
   — sightseeing, lodging — are dropped: 239 of 852).
2. **Dedupe** — same name within ~800 m merges into one venue with multiple visits.
3. **City/country + dish notes** — joined from the anthonybourdainworldmap.com dump
   (name+proximity match, then nearest-pin match).
4. **Episode attribution** — each visit is matched to the nearest same-show (and
   same-season, when known) episode stop from Christine Zhang's dataset. Cities
   that hosted several episodes of one show stay honest: show-only, no guessed
   episode. ~86 % of visits pin to an exact episode.
5. **Stragglers** — MapTiler reverse geocoding, cached in `pipeline/cache/`.

### Sources & credits

- Venue pins: the five-map **“Anthony Bourdain” Google My Maps series** by Reddit
  user *deannd* (fan compilation)
- City/country + descriptions: **anthonybourdainworldmap.com** (*deannd* & Peter
  Keating)
- Episode stops: **[bourdain-travel-places](https://github.com/underthecurve/bourdain-travel-places)**
  by Christine Zhang (CC BY 4.0)
- Basemap & geocoding: MapTiler · © OpenStreetMap contributors

Raw source files are committed so builds are reproducible offline; the fan APIs are
never hit at app runtime. Unofficial fan project — not affiliated with CNN, Travel
Channel or the Bourdain estate.

### Known limits

- A Cook's Tour KML covers mappable venues only (134 of ~35 episodes' worth)
- No Reservations / Cook's Tour visits in multi-episode cities (NYC, Paris…) carry
  no episode number by design
- 😢 in the UI marks places the source maps flag as permanently closed (53); many
  more have closed since airing
