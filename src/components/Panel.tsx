import { useEffect, useMemo, useState } from "react";
import type { Place, ShowId } from "../types";
import type { Profile } from "../profiles";
import type { AtlasStats, CountryCount } from "../lib/data";

const PAGE = 160;

interface PanelProps {
  open: boolean;
  profile: Profile;
  profiles: Profile[];
  query: string;
  shows: Set<ShowId>;
  country: string;
  countries: CountryCount[];
  showCounts: Record<ShowId, number>;
  visible: Place[];
  stats: AtlasStats;
  selectedId: string | null;
  onProfile: (id: string) => void;
  onQuery: (q: string) => void;
  onToggleShow: (s: ShowId) => void;
  onCountry: (c: string) => void;
  onSelect: (id: string | null) => void;
}

export default function Panel(props: PanelProps) {
  const {
    open,
    profile,
    profiles,
    query,
    shows,
    country,
    countries,
    showCounts,
    visible,
    stats,
    selectedId,
    onProfile,
    onQuery,
    onCountry,
    onToggleShow,
    onSelect,
  } = props;
  const [limit, setLimit] = useState(PAGE);
  const L = profile.labels;

  useEffect(() => setLimit(PAGE), [profile.id]);

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
      <nav className="profile-rail" aria-label="Profiles">
        {profiles.map((pr) => (
          <button
            key={pr.id}
            className={`profile-chip ${pr.id === profile.id ? "is-active" : ""}`}
            onClick={() => onProfile(pr.id)}
            aria-pressed={pr.id === profile.id}
            title={pr.docTitle}
          >
            <span className="profile-chip-emoji" aria-hidden>
              {pr.emoji}
            </span>
            <span className="profile-chip-name">{pr.short}</span>
          </button>
        ))}
      </nav>

      <header className="brand">
        <p className="brand-kicker">{profile.kicker}</p>
        <h1 className="brand-title">
          {profile.titleMain} <em>{profile.titleEm}</em>
        </h1>
        <p className="brand-sub">
          <span>🍜 {stats.places.toLocaleString()} {L.spots}</span>
          <span>🗺️ {stats.countries} {L.regions}</span>
          {stats.episodes > 0 && (
            <span>📺 {stats.episodes.toLocaleString()} {L.episodes}</span>
          )}
        </p>
        <p className="brand-bio">{profile.bio}</p>
      </header>

      <div className="controls">
        <div className="search">
          <span className="search-icon" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            value={query}
            placeholder={L.searchPlaceholder}
            onChange={(e) => {
              setLimit(PAGE);
              onQuery(e.target.value);
            }}
          />
        </div>

        {profile.shows.length > 1 && (
          <div className="show-filter" role="group" aria-label="Filter by show">
            {profile.shows.map((meta) => {
              const on = shows.has(meta.id);
              return (
                <button
                  key={meta.id}
                  className={`show-chip ${on ? "is-on" : ""}`}
                  style={{ ["--chip" as string]: meta.color }}
                  onClick={() => {
                    setLimit(PAGE);
                    onToggleShow(meta.id);
                  }}
                  aria-pressed={on}
                  title={`${meta.name}${meta.years ? ` (${meta.years})` : ""}`}
                >
                  <span className="chip-emoji" aria-hidden>
                    {meta.emoji}
                  </span>
                  <span className="chip-name">{meta.short}</span>
                  <span className="chip-count">{showCounts[meta.id] ?? 0}</span>
                </button>
              );
            })}
          </div>
        )}

        <label className="country-select">
          <span aria-hidden>{L.regionIcon}</span>
          <select
            value={country}
            aria-label="Region"
            onChange={(e) => {
              setLimit(PAGE);
              onCountry(e.target.value);
            }}
          >
            <option value="all">{L.everywhere}</option>
            {countries.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="list" role="listbox" aria-label="Places">
        {rows.length === 0 && <p className="list-empty">{L.listEmpty}</p>}
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
                {p.kind ? ` · ${p.kind}` : ""}
              </span>
            </span>
            <span className="row-shows" aria-hidden>
              {profile.shows
                .filter((s) => p.shows.includes(s.id))
                .map((s) => (
                  <i key={s.id}>{s.emoji}</i>
                ))}
            </span>
          </button>
        ))}
        {sorted.length > limit && (
          <button className="list-more" onClick={() => setLimit((n) => n + PAGE)}>
            {L.showMore} ({(sorted.length - limit).toLocaleString()})
          </button>
        )}
      </div>

      <footer className="panel-footer">
        <p className="footer-quote">
          {profile.footerQuote} {profile.footerQuoteBy && <span>{profile.footerQuoteBy}</span>}
        </p>
        <p className="footer-note">{profile.footerNote}</p>
      </footer>
    </aside>
  );
}
