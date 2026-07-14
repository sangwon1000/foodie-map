import { useMemo } from "react";
import type { Place } from "../types";
import { visitLabel } from "../types";
import type { Profile } from "../profiles";
import { showsById, PROFILE_BY_ID } from "../profiles";
import { placeMapUrl } from "../lib/data";

interface PlaceCardProps {
  place: Place;
  profile: Profile;
  onClose: () => void;
}

export default function PlaceCard({ place, profile, onClose }: PlaceCardProps) {
  const byId = useMemo(() => showsById(profile), [profile]);
  const fallback = profile.shows[0];
  const heroVideo = place.visits.find((v) => v.video)?.video;
  // ALL view: the pin came from another person's atlas — badge the source + use
  // that profile's map service (google for bourdain, naver for KR)
  const source = place.profileId ? PROFILE_BY_ID[place.profileId] : null;
  const person = source && profile.id === "all" ? byId[source.id] : null;
  const mapService = source ? source.mapService : profile.mapService;
  // award profiles: the primaryShow is the grade (michelin) or year (WBS)
  const grade = byId[place.primaryShow];
  // wiens pins carry a direct google-maps link; award pins link an external page
  const isMapsUrl = !!place.sourceUrl && /goo\.gl|google\.[a-z.]+\/maps/.test(place.sourceUrl);
  const mapHref = isMapsUrl ? place.sourceUrl! : placeMapUrl(place, mapService);
  const detailLink =
    place.sourceUrl && !isMapsUrl
      ? {
          href: place.sourceUrl,
          label:
            profile.id === "michelin"
              ? "michelin guide ↗"
              : profile.id === "worldbeststeaks"
                ? "on the list ↗"
                : "source ↗",
        }
      : null;

  return (
    <article className="card" key={place.id}>
      <button className="card-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      {place.image &&
        (heroVideo ? (
          <a
            className="card-hero"
            href={heroVideo}
            target="_blank"
            rel="noreferrer"
            title="영상 보기"
          >
            <img src={place.image} alt="" loading="lazy" />
            <span className="card-play" aria-hidden>
              ▶
            </span>
          </a>
        ) : (
          <span className="card-hero">
            <img src={place.image} alt="" loading="lazy" />
          </span>
        ))}
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
      {place.award && (
        <p className="card-award">
          <span
            className="card-award-badge"
            style={{ background: grade?.color ?? "#2d2a26" }}
          >
            {place.emoji ?? grade?.emoji ?? "⭐"} {place.award}
          </span>
          {place.cuisine && <span className="card-award-meta">{place.cuisine}</span>}
          {place.price && <span className="card-award-meta card-price">{place.price}</span>}
          {place.greenStar && (
            <span className="card-green" title="Michelin Green Star — sustainable gastronomy">
              🌱 green star
            </span>
          )}
        </p>
      )}
      {place.ranks && Object.keys(place.ranks).length > 0 && (
        <p className="card-ranks">
          {Object.entries(place.ranks)
            .sort((a, b) => Number(b[0]) - Number(a[0]))
            .map(([year, rank]) => (
              <span
                key={year}
                className="card-rank-chip"
                style={{ ["--chip" as string]: byId[`Y${year}`]?.color ?? "#8a97a8" }}
                title={`ranked #${rank} in the ${year} edition`}
              >
                <b>{year}</b> #{rank}
              </span>
            ))}
        </p>
      )}
      {person && source && (
        <p className="card-source" style={{ ["--chip" as string]: person.color }}>
          {source.avatar ? (
            <img className="card-source-avatar" src={`${import.meta.env.BASE_URL}${source.avatar}`} alt="" />
          ) : (
            <span aria-hidden>{person.emoji}</span>
          )}
          <span className="card-source-name">{person.name}</span>
        </p>
      )}
      {place.note && <p className="card-note">{place.note}</p>}

      <ul className="card-visits">
        {place.visits.map((v, i) => {
          const meta = byId[v.show] ?? person ?? fallback;
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
              {!v.title && v.video && (
                <a
                  className="visit-link visit-watch"
                  href={v.video}
                  target="_blank"
                  rel="noreferrer"
                >
                  ▶ 영상
                </a>
              )}
              {v.year != null && <span className="visit-year">{v.year}</span>}
            </li>
          );
        })}
        {place.visits.length === 0 && !place.ranks && (
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

      <div className="card-links">
        <a className="card-link" href={mapHref} target="_blank" rel="noreferrer">
          {mapService === "naver" ? "네이버 지도에서 열기 🗺️" : "open in google maps 🗺️"}
        </a>
        {detailLink && (
          <a
            className="card-link card-link-ghost"
            href={detailLink.href}
            target="_blank"
            rel="noreferrer"
          >
            {detailLink.label}
          </a>
        )}
        {place.websiteUrl && (
          <a
            className="card-link card-link-ghost"
            href={place.websiteUrl}
            target="_blank"
            rel="noreferrer"
          >
            website ↗
          </a>
        )}
      </div>
    </article>
  );
}
