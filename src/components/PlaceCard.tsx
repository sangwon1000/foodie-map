import { useMemo } from "react";
import type { Place } from "../types";
import { visitLabel } from "../types";
import type { Profile } from "../profiles";
import { showsById } from "../profiles";
import { placeMapUrl } from "../lib/data";

interface PlaceCardProps {
  place: Place;
  profile: Profile;
  onClose: () => void;
}

export default function PlaceCard({ place, profile, onClose }: PlaceCardProps) {
  const byId = useMemo(() => showsById(profile), [profile]);
  const fallback = profile.shows[0];

  return (
    <article className="card" key={place.id}>
      <button className="card-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <p className="card-kicker">
        📍 {[place.city, place.country].filter(Boolean).join(" · ")}
        {place.status === "closed" && <span className="card-closed">😢 closed</span>}
        {place.status === "open" && <span className="card-open">🎉 open</span>}
        {place.rating != null && (
          <span className="card-rating">
            ⭐ {place.rating}
            {place.reviews != null && place.reviews > 0 ? ` (${place.reviews})` : ""}
          </span>
        )}
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
          const meta = byId[v.show] ?? fallback;
          const se = visitLabel(v);
          return (
            <li key={i}>
              <i aria-hidden>{meta.emoji}</i>
              <span className="visit-show" style={{ color: meta.color }}>
                {meta.short}
              </span>
              {se && <span className="visit-se">{se}</span>}
              {v.title &&
                (v.video ? (
                  <a
                    className="visit-title visit-link"
                    href={v.video}
                    target="_blank"
                    rel="noreferrer"
                  >
                    “{v.title}” ▶
                  </a>
                ) : (
                  <span className="visit-title">“{v.title}”</span>
                ))}
              {v.year != null && <span className="visit-year">{v.year}</span>}
            </li>
          );
        })}
        {place.visits.length === 0 && (
          <li>
            <i aria-hidden>{(byId[place.primaryShow] ?? fallback).emoji}</i>
            <span
              className="visit-show"
              style={{ color: (byId[place.primaryShow] ?? fallback).color }}
            >
              {(byId[place.primaryShow] ?? fallback).short}
            </span>
          </li>
        )}
      </ul>

      <a
        className="card-link"
        href={placeMapUrl(place, profile.mapService)}
        target="_blank"
        rel="noreferrer"
      >
        {profile.labels.mapLink}
      </a>
    </article>
  );
}
