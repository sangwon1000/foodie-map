import type { Place } from "../types";
import { SHOWS, visitLabel } from "../types";
import { googleMapsUrl } from "../lib/data";

interface PlaceCardProps {
  place: Place;
  onClose: () => void;
}

export default function PlaceCard({ place, onClose }: PlaceCardProps) {
  return (
    <article className="card" key={place.id}>
      <button className="card-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <p className="card-kicker">
        📍 {[place.city, place.country].filter(Boolean).join(" · ")}
        {place.status === "closed" && <span className="card-closed">😢 closed</span>}
        {place.status === "open" && <span className="card-open">🎉 open</span>}
      </p>
      <h2 className="card-title">
        <span className="card-emoji" aria-hidden>
          {place.emoji ?? "🍽️"}
        </span>
        {place.name}
      </h2>
      {place.note && <p className="card-note">{place.note}</p>}

      <ul className="card-visits">
        {place.visits.map((v, i) => {
          const meta = SHOWS[v.show];
          const se = visitLabel(v);
          return (
            <li key={i}>
              <i aria-hidden>{meta.emoji}</i>
              <span className="visit-show" style={{ color: meta.color }}>
                {meta.short}
              </span>
              {se && <span className="visit-se">{se}</span>}
              {v.title && <span className="visit-title">“{v.title}”</span>}
              {v.year != null && <span className="visit-year">{v.year}</span>}
            </li>
          );
        })}
        {place.visits.length === 0 && (
          <li>
            <i aria-hidden>{SHOWS[place.primaryShow].emoji}</i>
            <span className="visit-show" style={{ color: SHOWS[place.primaryShow].color }}>
              {SHOWS[place.primaryShow].short}
            </span>
          </li>
        )}
      </ul>

      <a className="card-link" href={googleMapsUrl(place)} target="_blank" rel="noreferrer">
        open in google maps 🗺️
      </a>
    </article>
  );
}
