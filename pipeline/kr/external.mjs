// External YouTube/broadcast restaurant-map sources with precise Kakao/Naver
// coordinates + source video + food thumbnail. These are curated maps that
// overlap heavily with our episode data; we use them to (a) enrich existing pins
// with a source video link and image, (b) add the few venues we're missing, and
// (c) place aired venues our own geocoding couldn't.
//
//   tubemap.kr        /api/offline-places  → pipeline/raw/kr/external/tubemap.json
//   youtubeplace.co.kr /youtubeData.json   → pipeline/raw/kr/external/youtubeplace.json
//
// dogumaster.com (백반기행/수요미식회) is intentionally NOT used: its data sits
// behind a Supabase backend reachable only with a key scraped from its bundle,
// which our safety layer (correctly) blocks as credential exploration.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.join(HERE, "../raw/kr/external");
const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(EXT, f), "utf8")); } catch { return null; } };

// which external channel(s) feed each profile
const CHANNEL_MAP = {
  baekban: [["tube", "식객 허영만"]],
  mokeultende: [["yp", "먹을텐데"], ["tube", "성시경"]],
  choizaroad: [["tube", "최자로드"]],
  culinarywars: [["tube", "흑백요리사1"], ["tube", "흑백요리사2"]],
  koreantable: [["tube", "한국인의 밥상"]],
  // misikhoe: not covered by these two sources
};

const fold = (s) => (s ?? "").normalize("NFKC").replace(/\(.*?\)/g, "").replace(/[^\p{Letter}\p{Number}]+/gu, "").toLowerCase();
const nameKey = (s) => fold(String(s ?? "").replace(/\s*(본점|본관|직영점|[가-힣A-Za-z0-9]{1,8}점)\s*$/u, ""));
const R = 6371000, rad = (x) => (x * Math.PI) / 180;
const distM = (a, b) => {
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const ytThumb = (id) => (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined);
const ytId = (url) => {
  const m = /(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/.exec(url ?? "");
  return m ? m[1] : null;
};

function buildIndex() {
  const tube = load("tubemap.json") ?? [];
  const yp = load("youtubeplace.json") ?? { restaurantList: [], channelList: [] };

  // tubemap by channel
  const tubeByCh = {};
  for (const p of tube) {
    const ch = p.filter_channel || p.channel_title;
    if (!ch || !isFinite(p.lat) || !isFinite(p.lng)) continue;
    (tubeByCh[ch] ??= []).push({
      name: p.name, lat: +p.lat, lng: +p.lng, addr: p.address || p.road_address || "",
      category: (p.category || "").trim() || undefined,
      video: p.video_url || undefined, image: p.image_url || ytThumb(ytId(p.video_url)),
    });
  }
  // youtubeplace by channel (x=lng, y=lat)
  const ypName = Object.fromEntries((yp.channelList || []).map((c) => [String(c.keyName), c.label]));
  const ypByCh = {};
  for (const r of yp.restaurantList || []) {
    const vid = String(r.ytbList ?? "").split(",")[0] || null;
    for (const cid of String(r.channelIdList).split(",")) {
      const ch = ypName[cid]; if (!ch) continue;
      const lat = +r.y, lng = +r.x; if (!isFinite(lat) || !isFinite(lng)) continue;
      (ypByCh[ch] ??= []).push({
        name: r.name, lat, lng, addr: r.roadAddress || r.address || "",
        category: (r.category || "").trim() || undefined,
        video: vid ? `https://www.youtube.com/watch?v=${vid}` : undefined, image: ytThumb(vid),
      });
    }
  }
  return { tubeByCh, ypByCh };
}

/** Merge + dedupe venues for a set of [src, channel] pairs. */
function mergeChannels(chans, tubeByCh, ypByCh) {
  const merged = [];
  for (const [src, ch] of chans) merged.push(...((src === "tube" ? tubeByCh : ypByCh)[ch] || []));
  const uniq = [];
  for (const e of merged) {
    const k = nameKey(e.name);
    const dup = uniq.find((x) => nameKey(x.name) === k && distM([x.lng, x.lat], [e.lng, e.lat]) < 150);
    if (dup) { if (!dup.video && e.video) { dup.video = e.video; dup.image = e.image; } continue; }
    uniq.push({ ...e });
  }
  return uniq;
}

/** Returns { profileId: [{name,lat,lng,addr,category,video,image}] }, deduped —
 *  the external venues that ENRICH our existing show profiles. */
export function externalVenues() {
  const { tubeByCh, ypByCh } = buildIndex();
  const out = {};
  for (const [profile, chans] of Object.entries(CHANNEL_MAP)) out[profile] = mergeChannels(chans, tubeByCh, ypByCh);
  return out;
}

/** Deduped venues for an arbitrary channel set — used to build standalone
 *  YouTuber profiles (e.g. 정육왕) that have no DiningCode/episode base. */
export function channelVenues(chans) {
  const { tubeByCh, ypByCh } = buildIndex();
  return mergeChannels(chans, tubeByCh, ypByCh);
}
