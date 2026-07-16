import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { Place } from "../types";
import { resolveMapStyle } from "../lib/mapStyle";

const SRC = "places";
const L_CLUSTERS = "clusters";
const L_CLUSTER_COUNT = "cluster-count";
const L_EMOJI = "emoji-points";

const INK = "#2d2a26";
const PAPER = "#ffffff";
const EMOJI_FONT = `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

// all markers share this canvas size so one icon-size curve fits both the plain
// food sticker and the ALL-view combo, and their collision boxes line up
const ICON = 128;

const WORLD = { center: [16, 21] as [number, number], zoom: 1.6 };

export interface HomeCamera {
  center: [number, number];
  zoom: number;
  spin?: boolean;
}

/** Paint a "food sticker" — a white pad + ink hairline + the food emoji — centered
 *  at (cx,cy). The pad is baked into the icon (rather than a separate circle layer)
 *  so the marker always moves/fades as one unit, never leaving orphan pads. */
function drawFoodDisc(ctx: CanvasRenderingContext2D, emoji: string, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = r * 0.06;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${r * 1.28}px ${EMOJI_FONT}`;
  ctx.fillText(emoji, cx, cy + r * 0.06);
}

/** Single-profile marker: just the food sticker, rendered to ImageData. */
function drawEmoji(emoji: string): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = ICON;
  canvas.height = ICON;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, ICON, ICON);
  drawFoodDisc(ctx, emoji, ICON / 2, ICON / 2, ICON * 0.33);
  return ctx.getImageData(0, 0, ICON, ICON);
}

const EMOJI_RE = /\p{Extended_Pictographic}/u;

export interface PersonStyle {
  avatar?: string;
  color: string;
  emoji: string;
}

/** Draw an ALL-view marker: the place's food-type emoji on a white sticker pad,
 *  with a small source badge (the person's face, or the award's emoji) tucked
 *  into the lower-right so you can tell whose pick each pin is at a glance. */
function makeComboSticker(
  foodEmoji: string,
  badgeImg: HTMLImageElement | null,
  badgeEmoji: string | null,
  color: string,
  size = ICON,
): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);

  // main sticker — white pad + food emoji, centered on the geographic point
  drawFoodDisc(ctx, foodEmoji, size / 2, size / 2, size * 0.33);

  // source badge — a face (or emoji) inside a colored ring, tucked lower-right
  const bx = size * 0.74, by = size * 0.74;
  const badgeR = size * 0.2;
  const ringW = badgeR * 0.26;
  ctx.beginPath();
  ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(bx, by, badgeR - ringW, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = PAPER;
  ctx.fillRect(bx - badgeR, by - badgeR, badgeR * 2, badgeR * 2);
  if (badgeImg) {
    const iw = badgeImg.width, ih = badgeImg.height, side = Math.min(iw, ih);
    const sx = (iw - side) / 2;
    const sy = Math.min((ih - side) * 0.2, ih - side); // faces sit high — bias to top
    const d = (badgeR - ringW) * 2;
    ctx.drawImage(badgeImg, sx, sy, side, side, bx - (badgeR - ringW), by - (badgeR - ringW), d, d);
  } else if (badgeEmoji) {
    ctx.font = `${badgeR * 0.92}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText(badgeEmoji, bx, by + badgeR * 0.04);
  }
  ctx.restore();
  ctx.lineWidth = size * 0.014;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

// decoded person avatars, keyed by profile id — so combo stickers can be drawn
// synchronously (no per-icon image load racing the collision pass). value is the
// loaded <img>, or null once we know there's no usable avatar.
const avatarCache = new Map<string, HTMLImageElement | null>();

/** Decode a profile's avatar into `avatarCache` (once), then run `done`. */
function loadAvatar(pid: string, url: string | undefined, done: () => void) {
  if (avatarCache.has(pid)) return done();
  if (!url) {
    avatarCache.set(pid, null);
    return done();
  }
  const im = new Image();
  im.onload = () => (avatarCache.set(pid, im), done());
  im.onerror = () => (avatarCache.set(pid, null), done());
  im.src = import.meta.env.BASE_URL + url;
}

/** Rasterize + register the icon for a given image id if it isn't loaded yet.
 *  Fully synchronous: plain food emojis draw directly; a "combo:" id draws once its
 *  avatar is decoded in `avatarCache` (a person's face, or the emoji for avatar-less
 *  awards) and is skipped until then — the data-sync effect repaints after decoding. */
function generateIcon(map: maplibregl.Map, id: string, avatars: Record<string, PersonStyle>) {
  if (map.hasImage(id)) return;
  if (id.startsWith("combo:")) {
    const rest = id.slice(6);
    const sep = rest.indexOf(":");
    const pid = rest.slice(0, sep);
    const foodEmoji = rest.slice(sep + 1);
    const style = avatars[pid];
    if (!style || !avatarCache.has(pid)) return;
    const im = avatarCache.get(pid) ?? null;
    const data = makeComboSticker(foodEmoji, im, im ? null : style.emoji, style.color);
    if (data) map.addImage(id, data, { pixelRatio: 2 });
    return;
  }
  if (!EMOJI_RE.test(id)) return;
  const img = drawEmoji(id);
  if (img) map.addImage(id, img, { pixelRatio: 2 });
}

interface HoverInfo {
  x: number;
  y: number;
  emoji: string;
  name: string;
  city: string;
}

interface MapViewProps {
  data: FeatureCollection;
  selected: Place | null;
  /** `${profileId}|${country}` — when it changes, refit the view */
  fitToken: string;
  /** the active profile's resting camera */
  home: HomeCamera;
  /** per-person marker style (photo + ring color), keyed by profile id — ALL view */
  avatars: Record<string, PersonStyle>;
  onSelect: (id: string | null) => void;
}

const prefersStill = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function MapView({ data, selected, fitToken, home, avatars, onSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selMarkerRef = useRef<maplibregl.Marker | null>(null);
  const dataRef = useRef(data);
  const onSelectRef = useRef(onSelect);
  const homeRef = useRef(home);
  const avatarsRef = useRef(avatars);
  const spinningRef = useRef(!prefersStill());
  homeRef.current = home;
  avatarsRef.current = avatars;
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [ready, setReady] = useState(false);

  dataRef.current = data;
  onSelectRef.current = onSelect;

  // ---- init (once) ----
  useEffect(() => {
    let cancelled = false;
    let map: maplibregl.Map | null = null;

    (async () => {
      const style = await resolveMapStyle();
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: WORLD.center,
        zoom: WORLD.zoom,
        minZoom: 0.8,
        maxZoom: 18.5, // half a step past the cluster unfold (z18) for breathing room
        attributionControl: { compact: true },
        canvasContextAttributes: { antialias: true },
      });
      mapRef.current = map;
      if (import.meta.env.DEV) (window as { __map?: maplibregl.Map }).__map = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.touchPitch.disable();

      // the app can boot inside a pane that settles its size late — follow the container
      const ro = new ResizeObserver(() => map?.resize());
      ro.observe(containerRef.current);
      map.once("remove", () => ro.disconnect());

      // rasterize any emoji / avatar an on-screen symbol asks for that the
      // pre-pass (data-sync effect) didn't already cover
      map.on("styleimagemissing", (e) => {
        if (!map) return;
        generateIcon(map, e.id, avatarsRef.current);
      });

      const stopSpin = () => {
        spinningRef.current = false;
      };
      map.on("dragstart", stopSpin);
      map.getCanvas().addEventListener("pointerdown", stopSpin);
      map.getCanvas().addEventListener("wheel", stopSpin, { passive: true });

      const spin = () => {
        if (!spinningRef.current || !map || document.hidden) return;
        const c = map.getCenter();
        map.easeTo({
          center: [c.lng + 4.5, c.lat],
          duration: 3000,
          easing: (n) => n,
          essential: false,
        });
      };
      map.on("moveend", spin);

      map.on("style.load", () => {
        if (!map) return;
        try {
          map.setProjection({ type: "globe" });
        } catch {
          /* mercator fallback */
        }
        try {
          map.setSky({
            "sky-color": "#cde9ff",
            "horizon-color": "#fff7ec",
            "fog-color": "#fff7ec",
            "sky-horizon-blend": 0.7,
            "horizon-fog-blend": 0.7,
            "atmosphere-blend": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              0.7,
              6,
              0,
            ] as never,
          });
        } catch {
          /* style without sky support */
        }
        ensureLayers(map);
        setReady(true);
        spin();
      });

      map.on("click", (e) => {
        if (!map) return;
        const feats = map.queryRenderedFeatures(e.point, {
          layers: [L_CLUSTERS, L_EMOJI].filter((l) => map!.getLayer(l)),
        });
        const f = feats[0];
        if (!f) {
          onSelectRef.current(null);
          return;
        }
        spinningRef.current = false;
        if (f.layer.id === L_CLUSTERS) {
          const clusterId = f.properties?.cluster_id;
          const src = map.getSource<maplibregl.GeoJSONSource>(SRC);
          if (src && clusterId != null) {
            src.getClusterExpansionZoom(clusterId).then((z) => {
              map?.easeTo({
                center: (f.geometry as GeoJSON.Point).coordinates as [number, number],
                zoom: Math.min(z + 0.4, 18.5),
                duration: 700,
              });
            });
          }
        } else {
          onSelectRef.current(String(f.properties?.id));
        }
      });

      map.on("mousemove", (e) => {
        if (!map) return;
        const layers = [L_EMOJI, L_CLUSTERS].filter((l) => map!.getLayer(l));
        if (layers.length === 0) return;
        const feats = map.queryRenderedFeatures(e.point, { layers });
        const f = feats[0];
        map.getCanvas().style.cursor = f ? "pointer" : "";
        if (f && f.layer.id !== L_CLUSTERS) {
          setHover({
            x: e.point.x,
            y: e.point.y,
            emoji: String(f.properties?.emoji ?? "🍽️"),
            name: String(f.properties?.name ?? ""),
            city: String(f.properties?.city ?? ""),
          });
        } else {
          setHover(null);
        }
      });
      map.on("mouseout", () => setHover(null));
    })();

    return () => {
      cancelled = true;
      selMarkerRef.current?.remove();
      selMarkerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ensureLayers(map: maplibregl.Map) {
    if (map.getSource(SRC)) return;
    // clusters absorb anything that would collide (they keep subdividing all the
    // way to z17), and the data itself is decluttered at z18 (toFeatureCollection)
    // — so pins never overlap AND are never hidden: what has no room is a counted
    // cluster, what is shown is always a full pin
    map.addSource(SRC, {
      type: "geojson",
      data: dataRef.current,
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 17,
    });

    map.addLayer({
      id: L_CLUSTERS,
      type: "circle",
      source: SRC,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": PAPER,
        "circle-opacity": 0.96,
        "circle-stroke-color": INK,
        "circle-stroke-width": 2,
        "circle-radius": ["step", ["get", "point_count"], 14, 25, 18, 90, 23],
      },
    });

    map.addLayer({
      id: L_CLUSTER_COUNT,
      type: "symbol",
      source: SRC,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 12,
        "text-allow-overlap": true,
      },
      paint: { "text-color": INK },
    });

    map.addLayer({
      id: L_EMOJI,
      type: "symbol",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      layout: {
        // ALL view: features carry a profileId → food emoji + source badge; else the food emoji alone
        "icon-image": [
          "case",
          ["has", "profileId"],
          ["concat", "combo:", ["get", "profileId"], ":", ["coalesce", ["get", "emoji"], "🍽️"]],
          ["coalesce", ["get", "emoji"], "🍽️"],
        ],
        // both stickers are 128px, so one zoom curve fits all
        "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.44, 8, 0.54, 13, 0.68],
        // never hide a pin — spacing is guaranteed upstream (clusters + declutter),
        // collision would only re-introduce "appears when you zoom" gaps
        "icon-allow-overlap": true,
        "icon-ignore-placement": false,
      },
    });
  }

  // ---- sync data ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    // rasterize every distinct icon this dataset needs, then hand the source its data,
    // so the no-overlap placement pass finds each icon and never drops the symbol
    // (panning to a new area later can't re-run this, so styleimagemissing backs it up)
    const paint = () => {
      if (cancelled || !mapRef.current) return;
      const seen = new Set<string>();
      for (const f of data.features) {
        const p = (f.properties ?? {}) as { emoji?: string; profileId?: string };
        const emoji = p.emoji || "🍽️";
        const id = p.profileId ? `combo:${p.profileId}:${emoji}` : emoji;
        if (seen.has(id)) continue;
        seen.add(id);
        generateIcon(map, id, avatarsRef.current);
      }
      map.getSource<maplibregl.GeoJSONSource>(SRC)?.setData(data);
    };

    // decode any not-yet-cached avatars first; combos drawn before they land use the
    // emoji fallback, so repaint once (the images are replaced) when decoding finishes
    const missing: string[] = [];
    for (const f of data.features) {
      const pid = (f.properties as { profileId?: string } | null)?.profileId;
      if (pid && !avatarCache.has(pid)) missing.push(pid);
    }
    const unique = [...new Set(missing)];
    paint(); // plain emojis + any combos whose avatars are already decoded
    if (unique.length) {
      let left = unique.length;
      const after = () => {
        if (--left <= 0 && !cancelled) paint(); // avatars ready → draw their combos
      };
      for (const pid of unique) loadAvatar(pid, avatarsRef.current[pid]?.avatar, after);
    }

    return () => {
      cancelled = true;
    };
  }, [data, ready]);

  // ---- selection: bouncing DOM marker with a name pill ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    selMarkerRef.current?.remove();
    selMarkerRef.current = null;

    if (selected) {
      spinningRef.current = false;

      // stacked pins are nudged apart by the declutter pass — anchor the bounce
      // marker to the rendered pin, not the raw place coordinate
      const feat = dataRef.current.features.find(
        (ft) => (ft.properties as { id?: string } | null)?.id === selected.id,
      );
      const at =
        feat && feat.geometry.type === "Point"
          ? ((feat.geometry as GeoJSON.Point).coordinates as [number, number])
          : ([selected.lng, selected.lat] as [number, number]);

      const el = document.createElement("div");
      el.className = "sel-marker";
      const emoji = document.createElement("span");
      emoji.className = "sel-emoji";
      emoji.textContent = selected.emoji ?? "🍽️";
      const pill = document.createElement("span");
      pill.className = "sel-name";
      pill.textContent = selected.name;
      el.append(emoji, pill);

      selMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat(at)
        .addTo(map);

      const desktop = window.matchMedia("(min-width: 761px)").matches;
      map.flyTo({
        center: at,
        zoom: Math.max(map.getZoom(), 11.5),
        padding: desktop
          ? { left: 380, top: 40, right: 40, bottom: 40 }
          : { top: 40, left: 20, right: 20, bottom: 300 },
        speed: 1.5,
        curve: 1.4,
        essential: true,
      });
    }
  }, [selected, ready]);

  // ---- fit when the profile or country focus changes ----
  const prevFitRef = useRef(fitToken);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (prevFitRef.current === fitToken) return;
    prevFitRef.current = fitToken;
    spinningRef.current = false;

    if (fitToken.endsWith("|all")) {
      const h = homeRef.current;
      map.flyTo({ center: h.center, zoom: h.zoom, duration: 1800, essential: true });
      if (h.spin && !prefersStill()) {
        // resume the idle spin once we're back on the globe
        spinningRef.current = true;
      }
      return;
    }
    const coords = dataRef.current.features
      .filter((f) => f.geometry.type === "Point")
      .map((f) => (f.geometry as GeoJSON.Point).coordinates as [number, number]);
    if (coords.length === 0) return;

    const desktop = window.matchMedia("(min-width: 761px)").matches;
    const padding = desktop
      ? { top: 90, bottom: 90, left: 420, right: 90 }
      : { top: 70, bottom: 70, left: 40, right: 40 };
    if (coords.length === 1) {
      map.flyTo({ center: coords[0], zoom: 9.5, padding, duration: 1500 });
      return;
    }
    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coords[0], coords[0]),
    );
    map.fitBounds(bounds, { padding, maxZoom: 9.5, duration: 1500 });
  }, [fitToken, ready]);

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map-canvas" />
      {hover && (
        <div className="map-tooltip" style={{ left: hover.x, top: hover.y }}>
          <span className="map-tooltip-name">
            {hover.emoji} {hover.name}
          </span>
          {hover.city && <span className="map-tooltip-city">{hover.city}</span>}
        </div>
      )}
    </div>
  );
}
