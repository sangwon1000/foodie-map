import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "./components/MapView";
import Panel from "./components/Panel";
import PlaceCard from "./components/PlaceCard";
import Intro from "./components/Intro";
import type { ShowId } from "./types";
import { SHOW_ORDER } from "./types";
import type { Atlas } from "./lib/data";
import { filterPlaces, loadAtlas, matchesQuery, toFeatureCollection } from "./lib/data";

type Phase = "intro" | "leaving" | "live";

const isMobile = () => window.matchMedia("(max-width: 760px)").matches;

export default function App() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [query, setQuery] = useState("");
  const [shows, setShows] = useState<Set<ShowId>>(new Set(SHOW_ORDER));
  const [country, setCountry] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(() => !isMobile());
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    loadAtlas()
      .then(setAtlas)
      .catch((e) => setError(String(e)));
  }, []);

  // keep the panel in sync when the viewport crosses the mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const sync = (e: MediaQueryListEvent) => setPanelOpen(!e.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!atlas || phase !== "intro") return;
    timersRef.current.push(
      window.setTimeout(() => setPhase("leaving"), 1100),
      window.setTimeout(() => setPhase("live"), 1900),
    );
    return () => timersRef.current.forEach(clearTimeout);
  }, [atlas, phase]);

  const skipIntro = () => {
    timersRef.current.forEach(clearTimeout);
    setPhase((p) => (p === "intro" ? "leaving" : p));
    window.setTimeout(() => setPhase("live"), 500);
  };

  const places = atlas?.places ?? [];

  const visible = useMemo(
    () => filterPlaces(places, { query, shows, country }),
    [places, query, shows, country],
  );

  const showCounts = useMemo(() => {
    const counts = { ACT: 0, NR: 0, TL: 0, PU: 0 } as Record<ShowId, number>;
    for (const p of places) {
      if (country !== "all" && p.country !== country) continue;
      if (!matchesQuery(p, query)) continue;
      for (const s of p.shows) counts[s]++;
    }
    return counts;
  }, [places, query, country]);

  const fc = useMemo(() => toFeatureCollection(visible), [visible]);

  const selected = useMemo(
    () => places.find((p) => p.id === selectedId) ?? null,
    [places, selectedId],
  );

  const handleSelect = (id: string | null) => {
    setSelectedId(id);
    if (id && isMobile()) setPanelOpen(false);
  };

  if (error) {
    return (
      <div className="boot-error">
        <h1>oops, the atlas didn't load 🫠</h1>
        <p>{error}</p>
        <p>
          run <code>npm run pipeline</code> to build{" "}
          <code>public/data/restaurants.geojson</code>, then reload.
        </p>
      </div>
    );
  }

  return (
    <div className="app">
      <MapView data={fc} selected={selected} fitToken={country} onSelect={handleSelect} />

      {atlas && (
        <Panel
          open={panelOpen}
          query={query}
          shows={shows}
          country={country}
          countries={atlas.countries}
          showCounts={showCounts}
          visible={visible}
          stats={atlas.stats}
          selectedId={selectedId}
          onQuery={setQuery}
          onToggleShow={(s) =>
            setShows((prev) => {
              const next = new Set(prev);
              if (next.has(s)) next.delete(s);
              else next.add(s);
              return next;
            })
          }
          onCountry={setCountry}
          onSelect={handleSelect}
        />
      )}

      <button
        className={`panel-toggle ${panelOpen ? "is-open" : ""}`}
        onClick={() => setPanelOpen((o) => !o)}
        aria-expanded={panelOpen}
      >
        {panelOpen ? "✕ close" : "🗂️ index"}
      </button>

      {selected && <PlaceCard place={selected} onClose={() => setSelectedId(null)} />}

      {phase !== "live" && <Intro leaving={phase === "leaving"} onSkip={skipIntro} />}
    </div>
  );
}
