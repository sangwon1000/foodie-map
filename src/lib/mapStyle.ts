/**
 * Basemap resolution: MapTiler (key already in the repo's .env) with a
 * keyless CARTO fallback so the app still runs without credentials.
 */
const CARTO_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

export async function resolveMapStyle(): Promise<string> {
  const key = import.meta.env.MAPTILER_API_KEY as string | undefined;
  if (key) {
    const url = `https://api.maptiler.com/maps/dataviz-light/style.json?key=${key}`;
    try {
      const res = await fetch(url);
      if (res.ok) return url;
      console.warn(`MapTiler style unavailable (${res.status}); falling back to CARTO`);
    } catch {
      console.warn("MapTiler unreachable; falling back to CARTO");
    }
  }
  return CARTO_LIGHT;
}
