import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "./components/MapView";
import Panel from "./components/Panel";
import PlaceCard from "./components/PlaceCard";
import Intro from "./components/Intro";
import type { ShowId } from "./types";
import { PROFILE_BY_ID, PROFILES } from "./profiles";
import type { Atlas } from "./lib/data";
import { filterPlaces, loadAtlas, matchesQuery, toFeatureCollection } from "./lib/data";

type Phase = "intro" | "leaving" | "live";

const isMobile = () => window.matchMedia("(max-width: 760px)").matches;

export default function App() {
  const [profileId, setProfileId] = useState("bourdain");
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [query, setQuery] = useState("");
  const [shows, setShows] = useState<Set<ShowId>>(
    () => new Set(PROFILE_BY_ID.bourdain.shows.map((s) => s.id)),
  );
  const [country, setCountry] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(() => !isMobile());
  const timersRef = useRef<number[]>([]);

  const profile = PROFILE_BY_ID[profileId];

  useEffect(() => {
    let stale = false;
    loadAtlas(profile)
      .then((a) => {
        if (!stale) setAtlas(a);
      })
      .catch((e) => setError(String(e)));
    return () => {
      stale = true;
    };
  }, [profile]);

  useEffect(() => {
    document.title = profile.docTitle;
  }, [profile]);

  const switchProfile = (id: string) => {
    if (id === profileId) return;
    const next = PROFILE_BY_ID[id];
    setProfileId(id);
    setQuery("");
    setCountry("all");
    setShows(new Set(next.shows.map((s) => s.id)));
    setSelectedId(null);
  };

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

  // only places from the active profile's atlas (avoids a mismatched flash mid-switch)
  const places = useMemo(
    () => (atlas && atlas.profileId === profileId ? atlas.places : []),
    [atlas, profileId],
  );

  const visible = useMemo(
    () => filterPlaces(places, { query, shows, country }),
    [places, query, shows, country],
  );

  const showCounts = useMemo(() => {
    const counts: Record<ShowId, number> = {};
    for (const s of profile.shows) counts[s.id] = 0;
    for (const p of places) {
      if (country !== "all" && p.country !== country) continue;
      if (!matchesQuery(p, query)) continue;
      for (const s of p.shows) if (s in counts) counts[s]++;
    }
    return counts;
  }, [profile, places, query, country]);

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
      <MapView
        data={fc}
        selected={selected}
        fitToken={`${profileId}|${country}`}
        home={profile.camera}
        onSelect={handleSelect}
      />

      {atlas && (
        <Panel
          open={panelOpen}
          profile={profile}
          profiles={PROFILES}
          query={query}
          shows={shows}
          country={country}
          countries={atlas.profileId === profileId ? atlas.countries : []}
          showCounts={showCounts}
          visible={visible}
          stats={
            atlas.profileId === profileId
              ? atlas.stats
              : { places: 0, countries: 0, episodes: 0 }
          }
          selectedId={selectedId}
          onProfile={switchProfile}
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

      {selected && (
        <PlaceCard place={selected} profile={profile} onClose={() => setSelectedId(null)} />
      )}

      {phase !== "live" && <Intro leaving={phase === "leaving"} onSkip={skipIntro} />}
    </div>
  );
}
