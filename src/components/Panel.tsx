import { useMemo, useState } from "react";
import type { Place, ShowId } from "../types";
import { SHOWS, SHOW_ORDER } from "../types";
import type { AtlasStats, CountryCount } from "../lib/data";

const PAGE = 160;

interface PanelProps {
  open: boolean;
  query: string;
  shows: Set<ShowId>;
  country: string;
  countries: CountryCount[];
  showCounts: Record<ShowId, number>;
  visible: Place[];
  stats: AtlasStats;
  selectedId: string | null;
  onQuery: (q: string) => void;
  onToggleShow: (s: ShowId) => void;
  onCountry: (c: string) => void;
  onSelect: (id: string | null) => void;
}

export default function Panel(props: PanelProps) {
  const {
    open,
    query,
    shows,
    country,
    countries,
    showCounts,
    visible,
    stats,
    selectedId,
    onQuery,
    onToggleShow,
    onCountry,
    onSelect,
  } = props;
  const [limit, setLimit] = useState(PAGE);

  const sorted = useMemo(() => {
    return [...visible].sort(
      (a, b) =>
        a.country.localeCompare(b.country) ||
        a.city.localeCompare(b.city) ||
        a.name.localeCompare(b.name),
    );
  }, [visible]);

  const rows = sorted.slice(0, limit);

  return (
    <aside className={`panel ${open ? "is-open" : ""}`}>
      <header className="brand">
        <p className="brand-kicker">everywhere tony ate 🌍</p>
        <h1 className="brand-title">
          bourdain <em>atlas</em>
        </h1>
        <p className="brand-sub">
          <span>🍜 {stats.places.toLocaleString()} spots</span>
          <span>🗺️ {stats.countries} countries</span>
          <span>📺 {stats.episodes} episodes</span>
        </p>
      </header>

      <div className="controls">
        <div className="search">
          <span className="search-icon" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            value={query}
            placeholder="find a spot, city, episode…"
            onChange={(e) => {
              setLimit(PAGE);
              onQuery(e.target.value);
            }}
          />
        </div>

        <div className="show-filter" role="group" aria-label="Filter by show">
          {SHOW_ORDER.map((id) => {
            const meta = SHOWS[id];
            const on = shows.has(id);
            return (
              <button
                key={id}
                className={`show-chip ${on ? "is-on" : ""}`}
                style={{ ["--chip" as string]: meta.color }}
                onClick={() => {
                  setLimit(PAGE);
                  onToggleShow(id);
                }}
                aria-pressed={on}
                title={`${meta.name} (${meta.years})`}
              >
                <span className="chip-emoji" aria-hidden>
                  {meta.emoji}
                </span>
                <span className="chip-name">{meta.short}</span>
                <span className="chip-count">{showCounts[id]}</span>
              </button>
            );
          })}
        </div>

        <label className="country-select">
          <span aria-hidden>🌍</span>
          <select
            value={country}
            aria-label="Country"
            onChange={(e) => {
              setLimit(PAGE);
              onCountry(e.target.value);
            }}
          >
            <option value="all">everywhere</option>
            {countries.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="list" role="listbox" aria-label="Places">
        {rows.length === 0 && (
          <p className="list-empty">nothing here 😅 — try loosening the filters</p>
        )}
        {rows.map((p) => (
          <button
            key={p.id}
            className={`row ${p.id === selectedId ? "is-selected" : ""}`}
            onClick={() => onSelect(p.id === selectedId ? null : p.id)}
          >
            <span className="row-emoji" aria-hidden>
              {p.emoji ?? "🍽️"}
            </span>
            <span className="row-body">
              <span className="row-name">
                {p.name}
                {p.status === "closed" && (
                  <span className="row-closed" title="closed for good">
                    {" "}
                    😢
                  </span>
                )}
              </span>
              <span className="row-meta">
                {[p.city, p.country].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="row-shows" aria-hidden>
              {SHOW_ORDER.filter((s) => p.shows.includes(s)).map((s) => (
                <i key={s}>{SHOWS[s].emoji}</i>
              ))}
            </span>
          </button>
        ))}
        {sorted.length > limit && (
          <button className="list-more" onClick={() => setLimit((n) => n + PAGE)}>
            show more 👇 ({(sorted.length - limit).toLocaleString()} left)
          </button>
        )}
      </div>

      <footer className="panel-footer">
        <p className="footer-quote">
          “If I'm an advocate for anything, it's to move.” <span>— tony ✈️</span>
        </p>
        <p className="footer-note">
          unofficial fan project, made with ❤️ and too many episode rewatches.
          😢 = closed for good.
        </p>
      </footer>
    </aside>
  );
}
