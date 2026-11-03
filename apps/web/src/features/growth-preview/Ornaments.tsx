import { useId } from "react";

export type GrowthStage = 0 | 5 | 10;
export type GrowthPalette = "gold" | "moon" | "rose";

function Star({ x, y, size = 6 }: { x: number; y: number; size?: number }) {
  return (
    <path
      d={`M${x} ${y - size} Q${x + 1} ${y - 1} ${x + size} ${y} Q${x + 1} ${y + 1} ${x} ${y + size} Q${x - 1} ${y + 1} ${x - size} ${y} Q${x - 1} ${y - 1} ${x} ${y - size}Z`}
      fill="var(--g-light)"
    />
  );
}

export function PlanetRing({ front = false }: { front?: boolean }) {
  const id = useId().replaceAll(":", "");
  const path = front
    ? "M432 260A182 52 0 0 1 68 260"
    : "M68 260A182 52 0 0 1 432 260";
  return (
    <svg
      className={`gp-orbit-art ${front ? "gp-ring-front" : "gp-ring-back"}`}
      viewBox="0 0 500 520"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id}>
          <stop stopColor="var(--g-metal)" />
          <stop offset=".4" stopColor="var(--g-light)" />
          <stop offset=".7" stopColor="var(--g-metal)" />
          <stop offset="1" stopColor="var(--g-accent)" />
        </linearGradient>
      </defs>
      <g transform="rotate(-22 250 260)" fill="none">
        <path d={path} stroke="#091222" strokeWidth="8" opacity=".65" />
        <path d={path} stroke={`url(#${id})`} strokeWidth={front ? 3.2 : 2.2} />
        <path
          d={path}
          transform="translate(0 -5)"
          stroke="var(--g-metal)"
          strokeWidth=".7"
          opacity=".7"
        />
        {front && (
          <>
            <circle
              cx="98"
              cy="288"
              r="4"
              fill="var(--g-light)"
              stroke="#162132"
              strokeWidth="1.5"
            />
            <circle cx="386" cy="294" r="2.4" fill="var(--g-light)" />
          </>
        )}
      </g>
    </svg>
  );
}

export function MoonOrbit() {
  const id = useId().replaceAll(":", "");
  return (
    <svg
      className="gp-orbit-art gp-moon-orbit"
      viewBox="0 0 500 520"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={id + "clip"}>
          <circle r="21" />
        </clipPath>
        <radialGradient id={id}>
          <stop stopColor="var(--g-light)" />
          <stop offset="1" stopColor="var(--g-accent)" />
        </radialGradient>
      </defs>
      <ellipse
        cx="250"
        cy="260"
        rx="221"
        ry="151"
        transform="rotate(-30 250 260)"
        fill="none"
        stroke="var(--g-metal)"
        strokeWidth=".65"
        strokeDasharray="2 7"
        opacity=".55"
      />
      <g className="gp-moon-drift">
        <circle r="34" fill="var(--g-accent)" opacity=".08" />
        <g>
          <circle
            r="22"
            fill="#07101e"
            stroke="var(--g-metal)"
            strokeWidth="1"
          />
          <g clipPath={`url(#${id}clip)`}>
            <circle r="21" fill={`url(#${id})`} />
            <path
              d="M-27 -4Q-4 -25 8 -7T33 2L30 27H-30Z"
              fill="var(--g-accent)"
            />
            <path
              d="M-28 1Q-6 -9 5 4T28 13"
              fill="none"
              stroke="var(--g-light)"
              strokeWidth="8"
              opacity=".65"
            />
            <path
              d="M-26 12Q-10 7 0 14T28 22"
              fill="none"
              stroke="var(--g-metal)"
              strokeWidth="4"
            />
          </g>
          <Star x={-32} y={-15} size={4} />
        </g>
      </g>
    </svg>
  );
}

export function StarDust({ interior = false }: { interior?: boolean }) {
  return (
    <div
      className={`gp-stardust ${interior ? "gp-interior-dust" : ""}`}
      aria-hidden="true"
    >
      {Array.from({ length: interior ? 14 : 23 }, (_, i) => {
        const angle = i * 2.39996,
          rx = interior ? 44 : 40,
          ry = interior ? 44 : 32;
        return (
          <i
            key={i}
            style={{
              left: `${50 + Math.cos(angle) * rx}%`,
              top: `${50 + Math.sin(angle) * ry}%`,
              width: i % 5 === 0 ? 4 : 2,
              height: i % 5 === 0 ? 4 : 2,
              animationDelay: `${i * 0.31}s`,
              animationDuration: `${3 + (i % 4)}s`,
            }}
          />
        );
      })}
    </div>
  );
}

export function StellarFrame({ advanced }: { advanced: boolean }) {
  const id = useId().replaceAll(":", "");
  return (
    <svg
      className={`gp-stellar-frame ${advanced ? "advanced" : ""}`}
      viewBox="0 0 1000 600"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--g-light)" />
          <stop offset=".5" stopColor="var(--g-metal)" />
          <stop offset="1" stopColor="var(--g-light)" />
        </linearGradient>
        <path
          id={id + "corner"}
          d="M20 96V52Q20 20 52 20H116M30 82V52Q30 30 52 30H95M20 59Q54 59 54 20M20 78Q73 78 73 20M37 43Q48 43 48 32M49 49L56 56L63 49L56 42Z"
        />
      </defs>
      <path
        d="M116 20H447M553 20H884M20 96V249M20 351V504M116 580H447M553 580H884M980 96V249M980 351V504"
        fill="none"
        stroke="#081020"
        strokeWidth="6"
        opacity=".8"
      />
      <path
        d="M116 20H447M553 20H884M20 96V249M20 351V504M116 580H447M553 580H884M980 96V249M980 351V504"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="1.7"
      />
      {[
        "",
        "translate(1000 0) scale(-1 1)",
        "translate(0 600) scale(1 -1)",
        "translate(1000 600) scale(-1 -1)",
      ].map((t, i) => (
        <g key={i} transform={t} fill="none" strokeLinejoin="round">
          <use
            href={`#${id}corner`}
            stroke="#081020"
            strokeWidth="6"
            opacity=".85"
          />
          <use href={`#${id}corner`} stroke={`url(#${id})`} strokeWidth="1.7" />
          <Star x={20} y={20} size={9} />
          {advanced && (
            <>
              <Star x={93} y={24} size={4} />
              <circle cx="24" cy="108" r="2.5" fill="var(--g-light)" />
            </>
          )}
        </g>
      ))}
      <g fill="none" stroke="#091322" strokeWidth="5">
        <path d="M458 20H477L500 8L523 20H542M458 580H477L500 592L523 580H542M20 260L9 300L20 340M980 260L991 300L980 340" />
      </g>
      <g fill="none" stroke="var(--g-light)" strokeWidth="1.4">
        <path d="M458 20H477L500 8L523 20H542M458 580H477L500 592L523 580H542M20 260L9 300L20 340M980 260L991 300L980 340" />
      </g>
      <Star x={500} y={20} size={6} />
      <Star x={500} y={580} size={6} />
      <Star x={20} y={300} size={6} />
      <Star x={980} y={300} size={6} />
    </svg>
  );
}

export function StarLantern() {
  const id = useId().replaceAll(":", "");
  return (
    <svg viewBox="0 0 150 240" className="gp-lantern-art" aria-hidden="true">
      <defs>
        <radialGradient id={id}>
          <stop stopColor="var(--g-light)" stopOpacity=".8" />
          <stop offset="1" stopColor="var(--g-accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse
        cx="75"
        cy="120"
        rx="45"
        ry="74"
        fill="#081322"
        fillOpacity=".48"
      />
      <ellipse cx="75" cy="120" rx="40" ry="66" fill={`url(#${id})`} />
      <g fill="none" stroke="#101827" strokeWidth="6" strokeLinejoin="round">
        <ellipse cx="75" cy="120" rx="45" ry="74" />
        <path d="M75 46Q16 120 75 194Q133 120 75 46M75 46V194" />
        <circle cx="75" cy="28" r="9" />
      </g>
      <g fill="none" stroke="var(--g-metal)" strokeWidth="1.6">
        <ellipse cx="75" cy="120" rx="45" ry="74" />
        <path d="M75 46Q16 120 75 194Q133 120 75 46M75 46V194" />
        <circle cx="75" cy="28" r="9" />
      </g>
      <path
        d="M75 38L83 46L75 54L67 46Z M75 186L83 195L75 209L67 195Z"
        fill="var(--g-metal)"
        stroke="#243040"
        strokeWidth=".8"
      />
      <Star x={75} y={120} size={32} />
      <g className="gp-lantern-glints">
        <Star x={19} y={85} size={6} />
        <Star x={135} y={156} size={5} />
        <Star x={111} y={43} size={4} />
      </g>
    </svg>
  );
}
