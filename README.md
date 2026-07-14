# The Foodie Atlas

An interactive globe of every place a food show sent its host — one **profile** per
show, switchable from the panel. The flagship is **The Bourdain Atlas**; a second
family covers the Korean food-TV canon.

## 🧭 The Bourdain Atlas

**2,412 restaurants, bars, markets and stops** Anthony Bourdain visited across his
four travel shows, in 109 countries:

| Show | Years | Places |
|---|---|---|
| A Cook's Tour | 2002–03 | 172 |
| No Reservations | 2005–12 | 1,029 |
| The Layover | 2011–13 | 469 |
| Parts Unknown | 2013–18 | 837 |

Each place carries its coordinates, city/country, what Tony ate there, open/closed
status, and — where it can be pinned down — the exact episode
(`S08E02 “Hanoi” · 2016`). 91 venues span multiple shows (e.g. Swan Oyster Depot:
Cook's Tour → The Layover → Parts Unknown).

## 🇰🇷 Korean profiles

Six Korean food shows, **~2,880 places**. The spine of each is the show's own
episode/visit history — every restaurant it actually featured; coordinates come
from DiningCode's community "인증맛집" lists and, for venues those lists miss, a
DiningCode name-search (+ Nominatim for overseas stops):

| Profile | Show | Pins | Aired venues placed |
|---|---|---|---|
| 🍚 백반기행 | 식객 허영만의 백반기행 (TV조선, 2019~) | 1,285 | 91% |
| 🍽️ 수요미식회 | 수요미식회 (tvN, 2015–19) | 563 | 90% |
| 🎤 먹을텐데 | 성시경의 먹을텐데 (YouTube, 2021~) | 305 | 90% |
| ⚔️ 흑백요리사 | 흑백요리사 (Netflix, 2024–25) | 229 | 87% |
| 🎧 최자로드 | 최자로드 (딩고·YouTube, 2018~) | 226 | 87% |
| 🌾 한국인의밥상 | 한국인의 밥상 (KBS, 2011~) | 274 | documentary¹ |

Each pin carries the airdate, the round/episode label (`67회`, `시즌9`), the topic
or region, and — for 먹을텐데 — the source YouTube link. 흑백요리사 is chef-indexed
(each place tagged with the chef and their result, e.g. `나폴리 맛피아 · 우승`).
Place cards link out to Naver Map.

The unplaced remainder (~10%) is venues no structured Korean source lists —
long-closed, renamed, or too small/rural for DiningCode — plus a few overseas
street-food stalls. No coordinates are guessed; a missing pin beats a wrong one.

¹ 한국인의 밥상 is a producer/regional-food documentary: only ~14 of its 744
episodes name a specific restaurant, so it ships as the DiningCode list with those
few episode links attached.

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
   — sightseeing, lodging — are dropped: 239 of 852, minus a hand-curated recovery
   list of 12 real food spots misfiled there, e.g. Cadieux Cafe).
2. **Dedupe** — same name within ~800 m merges into one venue with multiple visits.
3. **City/country + dish notes** — joined from the anthonybourdainworldmap.com dump
   (name+proximity match, then nearest-pin match).
4. **Episode attribution** — each visit is matched to the nearest same-show (and
   same-season, when known) episode stop from Christine Zhang's dataset. Cities
   that hosted several episodes of one show stay honest: show-only, no guessed
   episode.
5. **eatlikebourdain.com merge** — a full extraction of the best-maintained fan
   database (vendored, `raw/eatlikebourdain.json`) adds ~190 venues that have
   coordinates, fills episode numbers Zhang's data can't reach (it predates
   Parts Unknown S12), and supplies open/closed statuses. The site numbers
   episodes without the "Prime Cuts" recaps, so its episode numbers are only
   used when they verify against Zhang's episode titles (off-by-ones get
   title-shifted). Entries without coordinates (~280) are skipped — no guessed
   pins. Cross-show tags are ignored (they belong to the city guide, not the
   venue). ~78 % of visits pin to an exact episode.
6. **NYC top-up** — a small coordinate list (philazar's NYC set) restores famous
   New York gaps (Le Bernardin, Momofuku, Kebab Cafe…).
7. **Forward geocoding of coordinate-less web lists** — venues published without
   pins (eatlikebourdain no-coord entries, noreservationslocations.com street
   addresses, and CNN's official explorepartsunknown.com field guides — only
   entries the guides explicitly mark as Bourdain's, not editorial picks) are
   geocoded via MapTiler (addresses) and Nominatim (POIs). Strict acceptance:
   the result must verify against the expected country/city and be a real POI —
   ~400 entries that don't verify stay unmapped, because a wrong pin is worse
   than a missing one. Cached in `pipeline/cache/geocode-fwd.json`. Geocoded
   venues then run through the same Zhang episode attribution.
8. **Dedupe sweep + stragglers** — near-identical pins (<150 m, containing
   names) collapse into one; remaining blank cities get MapTiler reverse
   geocoding, cached in `pipeline/cache/`.

## Korean pipeline

Separate, self-contained, and independent of the Bourdain pipeline:

```bash
npm run fetch:kr       # (re)pull the six DiningCode 인증맛집 lists → pipeline/raw/kr/
npm run geocode:kr     # geocode episode venues the lists miss → pipeline/cache/kr-geocode.json
npm run pipeline:kr    # build public/data/kr/<profile>.geojson from raw/kr/ + the cache
```

- **Fetch** (`pipeline/kr/fetch-diningcode.mjs`) — DiningCode's `isearch` API caps
  every query at 100 rows, so the fetcher recurses nationwide → 시/도 → 시/군/구
  until each slice fits, then merges by venue id. Coordinates, address, category,
  rating and live open-status come straight from DiningCode.
- **Geocode** (`pipeline/kr/geocode-episodes.mjs`) — for every episode restaurant a
  tagged list doesn't already cover, looks the name up: DiningCode name-search for
  Korean venues (province-verified, with a market-prefix strip and a nationwide
  unique-match fallback), Nominatim for overseas stops (country-verified). Clear
  non-eateries the episode boards over-include (markets, shops, sights) are skipped.
  Results — including verified misses — cache in `pipeline/cache/kr-geocode.json`.
- **Build** (`pipeline/kr/build.mjs`) — treats the episode file as the spine. Each
  aired restaurant is placed from its tagged DiningCode venue (name+area, with an
  area-agreement guard and a branch-suffix containment fallback, `하얀집` ↔
  `나주곰탕 하얀집`) or, failing that, from the geocode cache; a geocoded pin within
  45 m of an existing one merges instead of duplicating. Tagged venues no episode
  confirms are kept as supplementary community pins. No coordinates are guessed.

Episode files were assembled per show from official channels and fan databases
(TV조선 broadcast board, Korean Wikipedia/Namuwiki via the Wayback Machine, the
show's own YouTube playlists parsed for the `[식당명]` description blocks, and
community list blogs), then cross-checked against the DiningCode roster.

### Sources & credits

- Venue pins: the five-map **“Anthony Bourdain” Google My Maps series** by Reddit
  user *deannd* (fan compilation)
- City/country + descriptions: **anthonybourdainworldmap.com** (*deannd* & Peter
  Keating)
- Episode stops: **[bourdain-travel-places](https://github.com/underthecurve/bourdain-travel-places)**
  by Christine Zhang (CC BY 4.0)
- Additional venues, episode numbers & closed statuses: **eatlikebourdain.com**
- Per-episode NR venue addresses: **noreservationslocations.com**
- Official Parts Unknown field guides: **explorepartsunknown.com** (CNN, via the
  Wayback Machine)
- NYC coordinates: **[philazar/bourdain_data](https://github.com/philazar/bourdain_data)**
- Korean venue lists, ratings & coordinates: **diningcode.com** 인증맛집
- Korean episode/visit data: each show's official channel + community fan lists
  (TV조선, tvN, KBS, Netflix, YouTube; Namuwiki / Korean Wikipedia)
- Basemap & geocoding: MapTiler · Nominatim · © OpenStreetMap contributors

Raw source files are committed so builds are reproducible offline; the fan APIs are
never hit at app runtime. Unofficial fan project — not affiliated with CNN, Travel
Channel, the Bourdain estate, or any of the Korean broadcasters.

### Known limits

- A Cook's Tour remains the thinnest era (172 venues for ~35 episodes)
- No Reservations / Cook's Tour visits in multi-episode cities (NYC, Paris…) carry
  no episode number by design
- 😢 marks the 232 places flagged permanently closed (statuses maintained by
  eatlikebourdain.com); 🎉 marks ~1,050 confirmed still open
- ~400 venues named in the source lists could not be verified to coordinates
  (unnamed stalls, private homes, beach barracas, long-gone spots) and are
  deliberately not mapped — no guessed pins
