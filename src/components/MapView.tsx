import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { Place } from "../types";
import { resolveMapStyle } from "../lib/mapStyle";

const SRC = "places";
const L_CLUSTERS = "clusters";
const L_CLUSTER_COUNT = "cluster-count";
const L_BASE = "sticker-base";
const L_EMOJI = "emoji-points";

const INK = "#2d2a26";
const PAPER = "#ffffff";

const WORLD = { center: [16, 21] as [number, number], zoom: 1.6 };

export interface HomeCamera {
  center: [number, number];
  zoom: number;
  spin?: boolean;
}

/** Render a color emoji to ImageData so MapLibre can use it as a symbol icon. */
function drawEmoji(emoji: string): ImageData | null {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `48px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.fillText(emoji, size / 2, size / 2 + 3);
  return ctx.getImageData(0, 0, size, size);
}

const EMOJI_RE = /\p{Extended_Pictographic}/u;

export interface PersonStyle {
  avatar?: string;
  color: string;
  emoji: string;
}

/** Draw a circular sticker — a person photo (or emoji) inside a colored ring —
 *  so ALL-view markers show whose spot each pin is at a glance. */
function makeCircleSticker(
  img: HTMLImageElement | null,
  emoji: string | null,
  color: string,
  size = 96,
): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const r = size / 2;
  const ringW = 7;
  ctx.clearRect(0, 0, size, size);
  // colored ring (full disc, becomes the band around the photo)
  ctx.beginPath();
  ctx.arc(r, r, r - 1.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  // inner disc — clip and paint the photo/emoji
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 1.5 - ringW, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, size, size);
  if (img) {
    const iw = img.width, ih = img.height, side = Math.min(iw, ih);
    const sx = (iw - side) / 2;
    const sy = Math.min((ih - side) * 0.2, ih - side); // faces sit high — bias to top
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  } else if (emoji) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${size * 0.46}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText(emoji, r, r + size * 0.03);
  }
  ctx.restore();
  // ink hairline border
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(r, r, r - 1.5, 0, Math.PI * 2);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
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
  const pendingImg = useRef<Set<string>>(new Set());
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
        maxZoom: 18,
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

      // lazily rasterize any emoji — or person avatar — the data asks for
      map.on("styleimagemissing", (e) => {
        if (!map || map.hasImage(e.id) || pendingImg.current.has(e.id)) return;
        if (e.id.startsWith("avatar:")) {
          const style = avatarsRef.current[e.id.slice(7)];
          if (!style) return;
          pendingImg.current.add(e.id);
          const addSticker = (im: HTMLImageElement | null) => {
            if (!map || map.hasImage(e.id)) return;
            const data = makeCircleSticker(im, im ? null : style.emoji, style.color);
            if (data) map.addImage(e.id, data, { pixelRatio: 2 });
          };
          if (style.avatar) {
            const im = new Image();
            im.onload = () => addSticker(im);
            im.onerror = () => addSticker(null);
            im.src = import.meta.env.BASE_URL + style.avatar;
          } else {
            addSticker(null);
          }
          return;
        }
        if (!EMOJI_RE.test(e.id)) return;
        const img = drawEmoji(e.id);
        if (img) map.addImage(e.id, img, { pixelRatio: 2 });
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
          layers: [L_CLUSTERS, L_EMOJI, L_BASE].filter((l) => map!.getLayer(l)),
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
                zoom: Math.min(z + 0.4, 15),
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
        const layers = [L_EMOJI, L_BASE, L_CLUSTERS].filter((l) => map!.getLayer(l));
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
    map.addSource(SRC, {
      type: "geojson",
      data: dataRef.current,
      cluster: true,
      clusterRadius: 46,
      clusterMaxZoom: 11,
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

    // white sticker pad under each emoji (avatars carry their own ring, so skip them)
    map.addLayer({
      id: L_BASE,
      type: "circle",
      source: SRC,
      filter: ["all", ["!", ["has", "point_count"]], ["!", ["has", "profileId"]]],
      paint: {
        "circle-color": PAPER,
        "circle-opacity": 0.95,
        "circle-stroke-color": INK,
        "circle-stroke-width": 1.5,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 9, 8, 11.5, 13, 14.5],
      },
    });

    map.addLayer({
      id: L_EMOJI,
      type: "symbol",
      source: SRC,
      filter: ["!", ["has", "point_count"]],
      layout: {
        // ALL view: features carry a profileId → show the person's face; else the food emoji
        "icon-image": [
          "case",
          ["has", "profileId"],
          ["concat", "avatar:", ["get", "profileId"]],
          ["coalesce", ["get", "emoji"], "🍽️"],
        ],
        // one top-level zoom curve; each stop is smaller for avatar photos
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1,
          ["case", ["has", "profileId"], 0.39, 0.5],
          8,
          ["case", ["has", "profileId"], 0.48, 0.62],
          13,
          ["case", ["has", "profileId"], 0.62, 0.8],
        ],
        "icon-allow-overlap": true,
        "icon-padding": 0,
      },
    });
  }

  // ---- sync data ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource<maplibregl.GeoJSONSource>(SRC);
    src?.setData(data);
  }, [data, ready]);

  // ---- selection: bouncing DOM marker with a name pill ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    selMarkerRef.current?.remove();
    selMarkerRef.current = null;

    if (selected) {
      spinningRef.current = false;

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
        .setLngLat([selected.lng, selected.lat])
        .addTo(map);

      const desktop = window.matchMedia("(min-width: 761px)").matches;
      map.flyTo({
        center: [selected.lng, selected.lat],
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
