interface IntroProps {
  leaving: boolean;
  onSkip: () => void;
}

const EMOJIS = ["🧑‍🍳", "🍜", "✈️", "🧭"];

export default function Intro({ leaving, onSkip }: IntroProps) {
  return (
    <div
      className={`intro ${leaving ? "is-leaving" : ""}`}
      onClick={onSkip}
      role="presentation"
    >
      <div className="intro-emojis" aria-hidden>
        {EMOJIS.map((e, i) => (
          <span key={e} style={{ animationDelay: `${0.08 * i}s` }}>
            {e}
          </span>
        ))}
      </div>
      <h1 className="intro-title">
        bourdain <em>atlas</em>
      </h1>
      <p className="intro-sub">every restaurant from every episode, on one tiny planet 🌍</p>
      <p className="intro-hint">cooking the map… 🍳</p>
    </div>
  );
}
