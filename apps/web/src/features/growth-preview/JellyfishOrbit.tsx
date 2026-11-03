import { useId, type CSSProperties } from "react";
import type { GrowthPalette } from "./Ornaments";
import { paletteMaterials } from "./presets";

const colors = [
  ["#a8f0f4", "#5eb9d3", "#e3fbff"],
  ["#e4c8ff", "#ac89dc", "#fff1fc"],
  ["#f8c3e3", "#b18ce0", "#ffeef8"],
];
export function JellyfishOrbit({
  front = false,
  particles = true,
  staticPreview = false,
  palette,
}: {
  front?: boolean;
  particles?: boolean;
  staticPreview?: boolean;
  palette?: GrowthPalette;
}) {
  const uid = useId().replaceAll(":", "");
  const tint = palette ? paletteMaterials[palette] : undefined;
  const bodyColors = tint
    ? [
        [tint[2], tint[0], tint[1]],
        [tint[0], tint[2], tint[1]],
        [tint[2], tint[0], tint[1]],
      ]
    : colors;
  return (
    <svg
      className={`gp-orbit-art ${front ? "gp-ring-front" : "gp-ring-back"} gp-jelly-orbit ${staticPreview ? "is-static" : ""}`}
      viewBox="0 0 500 520"
      aria-hidden="true"
      data-ring="jellyfish"
      data-particles={particles}
    >
      <defs>
        {bodyColors.map(([light, dark], i) => (
          <radialGradient
            key={i}
            id={`${uid}bell${i}`}
            cx="35%"
            cy="20%"
            r="85%"
          >
            <stop stopColor="#fbf7ff" />
            <stop offset=".42" stopColor={light} />
            <stop offset="1" stopColor={dark} />
          </radialGradient>
        ))}
      </defs>
      {!front && (
        <ellipse
          cx="250"
          cy="240"
          rx="185"
          ry="105"
          transform="rotate(-20 250 240)"
          fill="none"
          stroke="#b6d6ed"
          strokeWidth=".7"
          strokeDasharray="2 9"
          opacity=".48"
        />
      )}
      {bodyColors.map(([light, dark, highlight], i) => (
        <g
          key={i}
          className="gp-jelly-traveller"
          style={
            {
              "--jelly-delay": `${-i * 8}s`,
              "--jelly-position": `${(i * 100) / 3}%`,
            } as CSSProperties
          }
        >
          <g
            className={`gp-jelly-half ${front ? "jelly-front" : "jelly-back"}`}
          >
            <g
              className="gp-jelly-swim"
              transform={`scale(${[1.15, 0.95, 0.85][i]})`}
            >
              <g
                className="gp-jelly-tentacles"
                fill="none"
                strokeLinecap="round"
              >
                {[-12, -4, 4, 12].map((x, j) => (
                  <path
                    key={x}
                    d={`M${x} 5C${x - 13} 18 ${x + 12} 22 ${x + 1} 32S${x - 10} 42 ${x + 4} ${j % 2 ? 49 : 43}`}
                    stroke={j % 2 ? light : dark}
                    strokeWidth={j % 2 ? 2 : 2.6}
                  />
                ))}
                <path
                  d="M0 7Q11 17 1 24T2 39"
                  stroke={highlight}
                  strokeWidth="3.4"
                  opacity=".65"
                />
              </g>
              <path
                d="M-24 3Q-25 -23 -8 -28Q8 -35 21 -18Q27 -9 24 3Q18 -2 12 6Q6 1 0 7Q-6 1 -12 6Q-18 -2 -24 3Z"
                fill={`url(#${uid}bell${i})`}
                stroke="#12283f"
                strokeWidth="2.7"
              />
              <path
                d="M-23 2Q-23 -22 -7 -27Q8 -33 21 -17Q26 -9 23 2"
                fill="none"
                stroke={highlight}
                strokeWidth="1.7"
              />
              <path
                d="M-14 -17Q-10 -23 -4 -23"
                fill="none"
                stroke="#fff"
                strokeWidth="3.2"
                strokeLinecap="round"
                opacity=".85"
              />
              <path
                d="M4 -25Q15 -13 12 1M-4 -25Q-13 -12 -12 1"
                fill="none"
                stroke={highlight}
                strokeWidth="1"
                opacity=".42"
              />
              <circle cx="-7" cy="-7" r="2" fill="#21344d" />
              <circle cx="7" cy="-7" r="2" fill="#21344d" />
              <circle cx="-7.5" cy="-7.8" r=".6" fill="#fff" />
              <circle cx="6.5" cy="-7.8" r=".6" fill="#fff" />
              <ellipse
                cx="-13"
                cy="-2"
                rx="3"
                ry="1.7"
                fill="#ef97b8"
                opacity=".6"
              />
              <ellipse
                cx="13"
                cy="-2"
                rx="3"
                ry="1.7"
                fill="#ef97b8"
                opacity=".6"
              />
              <path
                d="M-3 -3Q0 1 3 -3"
                stroke="#4f5273"
                strokeWidth="1.2"
                fill="none"
                strokeLinecap="round"
              />
              {particles && (
                <g className="gp-jelly-sparkles">
                  {[
                    [-34, -9, 1.8],
                    [29, 19, 1.5],
                    [-28, 34, 1.1],
                    [17, 55, 1.5],
                  ].map(([x, y, r], j) => (
                    <g key={j}>
                      <circle
                        cx={x}
                        cy={y}
                        r={r * 2.3}
                        fill={light}
                        opacity=".12"
                      />
                      <circle cx={x} cy={y} r={r} fill={highlight} />
                    </g>
                  ))}
                </g>
              )}
            </g>
          </g>
        </g>
      ))}
    </svg>
  );
}
