import type { CSSProperties } from "react";
import { useId } from "react";
import { StellarFrame } from "./Ornaments";
import { materials, type FrameId, type RingId } from "./presets";
import { FancyFrameDetails } from "./FancyFrames";
import { JellyfishOrbit } from "./JellyfishOrbit";

export function materialStyle(id: keyof typeof materials): CSSProperties {
  const [metal, light, accent] = materials[id];
  return {
    "--g-metal": metal,
    "--g-light": light,
    "--g-accent": accent,
  } as CSSProperties;
}
function Gem({
  x,
  y,
  size = 12,
  color = "#729de5",
  round = false,
}: {
  x: number;
  y: number;
  size?: number;
  color?: string;
  round?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {round ? (
        <ellipse
          rx={size * 0.78}
          ry={size}
          fill="#071827"
          stroke="var(--g-metal)"
          strokeWidth="2.8"
        />
      ) : (
        <path
          d={`M0 ${-size - 2}L${size + 2} 0L0 ${size + 2}L${-size - 2} 0Z`}
          fill="#071827"
          stroke="var(--g-metal)"
          strokeWidth="2"
        />
      )}
      <path
        d={`M0 ${-size}L${size * 0.68} 0L0 ${size}L${-size * 0.68} 0Z`}
        fill={color}
      />
      <path
        d={`M0 ${-size}L0 ${size}L${-size * 0.68} 0Z`}
        fill="#fff"
        opacity=".23"
      />
      <path
        d={`M0 ${-size}L${size * 0.68} 0L0 ${size * 0.25}Z`}
        fill="#fff"
        opacity=".48"
      />
      <path
        d={`M0 ${size}L${size * 0.68} 0L0 ${size * 0.25}Z`}
        fill="#071731"
        opacity=".42"
      />
      <circle
        cx={-size * 0.19}
        cy={-size * 0.37}
        r={Math.max(1, size * 0.1)}
        fill="#fff8e1"
      />
    </g>
  );
}
function Spark({ x, y, size = 5 }: { x: number; y: number; size?: number }) {
  return (
    <path
      d={`M${x} ${y - size}Q${x + 1} ${y - 1} ${x + size} ${y}Q${x + 1} ${y + 1} ${x} ${y + size}Q${x - 1} ${y + 1} ${x - size} ${y}Q${x - 1} ${y - 1} ${x} ${y - size}Z`}
      fill="var(--g-light)"
      stroke="#112034"
      strokeWidth=".7"
    />
  );
}
const corners = [
  "",
  "translate(1000 0) scale(-1 1)",
  "translate(0 600) scale(1 -1)",
  "translate(1000 600) scale(-1 -1)",
];
const enamelColors = [
  "#e8a5b8",
  "#9bcbd6",
  "#c4b1e6",
  "#eacb89",
  "#a9d1ad",
  "#dca1a4",
];

export function FramePresetArt({ id }: { id: FrameId }) {
  const unique = useId().replaceAll(":", "");
  return (
    <div
      className={`gp-frame-preset gp-preset-${id}`}
      style={materialStyle(id)}
      data-frame={id}
    >
      <StellarFrame advanced />
      <svg
        className="gp-frame-detail"
        viewBox="0 0 1000 600"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <path id={unique + "leaf"} d="M0 0Q-12 -16 -2 -24Q9 -11 0 0Z" />
        </defs>
        {id === "silver" && (
          <>
            {corners.map((t, i) => (
              <g
                key={i}
                transform={t}
                fill="none"
                stroke="var(--g-metal)"
                strokeWidth="1.2"
              >
                <path d="M26 116Q40 83 67 67T116 26M34 113Q51 94 65 94Q50 82 54 64Q75 60 91 70Q90 49 113 34" />
                <path d="M35 107Q51 106 44 92M106 35Q106 51 92 44" />
                <Spark x={88} y={88} size={9} />
                <Spark x={109} y={65} size={4} />
                <Spark x={65} y={109} size={4} />
              </g>
            ))}
            {[195, 260, 325, 675, 740, 805].map((x) => (
              <g key={x}>
                <Spark x={x} y={20} size={3} />
                <Spark x={x} y={580} size={3} />
              </g>
            ))}
            <path
              d="M469 23Q500 66 531 23M479 23Q500 49 521 23M469 577Q500 534 531 577"
              fill="none"
              stroke="var(--g-metal)"
              strokeWidth="1.2"
            />
            <Gem x={500} y={40} size={7} color="#cae8ff" />
          </>
        )}
        {id === "gold" && (
          <>
            {corners.map((t, i) => (
              <g
                key={i}
                transform={t}
                fill="var(--g-metal)"
                stroke="#3c2a20"
                strokeWidth=".7"
              >
                <path
                  d="M26 123Q70 100 123 26"
                  fill="none"
                  stroke="var(--g-light)"
                  strokeWidth="1.6"
                />
                {Array.from({ length: 6 }, (_, j) => (
                  <g
                    key={j}
                    transform={`translate(${40 + j * 12} ${109 - j * 12}) rotate(${30 + j * 6})`}
                  >
                    <use href={`#${unique}leaf`} />
                    <use
                      href={`#${unique}leaf`}
                      transform="scale(-1 .8) rotate(75)"
                    />
                  </g>
                ))}
                <circle cx="40" cy="40" r="7" fill="var(--g-light)" />
              </g>
            ))}
            <g
              transform="translate(500 25)"
              stroke="var(--g-metal)"
              fill="none"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <path
                  key={i}
                  d="M0 15V24"
                  transform={`rotate(${i * 30})`}
                  strokeWidth="1.8"
                />
              ))}
              <circle
                r="10"
                fill="var(--g-metal)"
                stroke="#463025"
                strokeWidth="2"
              />
              <circle r="5" stroke="var(--g-light)" />
            </g>
            <path
              d="M124 28H440M560 28H876M124 572H440M560 572H876"
              fill="none"
              stroke="var(--g-metal)"
              strokeWidth=".7"
              strokeDasharray="2 5"
            />
          </>
        )}
        {(id === "sapphire" || id === "emerald") && (
          <>
            {corners.map((t, i) => (
              <g key={i} transform={t}>
                <path
                  d="M24 123Q30 74 73 73Q73 30 123 24M40 112Q54 93 66 94M112 40Q93 54 94 66"
                  fill="none"
                  stroke="var(--g-metal)"
                  strokeWidth="2"
                />
                <Gem
                  x={57}
                  y={57}
                  size={id === "sapphire" ? 19 : 23}
                  color={id === "sapphire" ? "#5c8de6" : "#39b98c"}
                  round={id === "emerald"}
                />
                <Gem
                  x={102}
                  y={30}
                  size={6}
                  color={id === "sapphire" ? "#b3ceff" : "#94e4b1"}
                />
                <Gem
                  x={30}
                  y={102}
                  size={6}
                  color={id === "sapphire" ? "#b3ceff" : "#94e4b1"}
                />
                {id === "emerald" && (
                  <>
                    <path
                      d="M72 71Q101 65 112 95Q84 100 72 71M71 72Q65 101 95 112Q100 84 71 72"
                      fill="#7fae7755"
                      stroke="var(--g-metal)"
                      strokeWidth="1.2"
                    />
                    <path d="M57 80V107" stroke="var(--g-metal)" />
                    <Gem x={57} y={115} size={8} color="#7bd7b0" />
                  </>
                )}
              </g>
            ))}
            <path
              d="M444 20Q470 48 500 36Q530 48 556 20M444 580Q470 552 500 564Q530 552 556 580"
              fill="none"
              stroke="var(--g-metal)"
              strokeWidth="1.7"
            />
            <Gem
              x={500}
              y={27}
              size={20}
              color={id === "sapphire" ? "#658eef" : "#5dd0a5"}
              round={id === "sapphire"}
            />
            <Gem
              x={500}
              y={573}
              size={13}
              color={id === "sapphire" ? "#7ca8f2" : "#60d5a6"}
            />
            {[180, 350, 650, 820].map((x) => (
              <g key={x}>
                <Gem
                  x={x}
                  y={20}
                  size={4}
                  color={id === "sapphire" ? "#c6d9ff" : "#aae5bd"}
                />
                <Gem
                  x={x}
                  y={580}
                  size={4}
                  color={id === "sapphire" ? "#c6d9ff" : "#aae5bd"}
                />
              </g>
            ))}
          </>
        )}
        {id === "glass" && (
          <>
            {corners.map((t, i) => (
              <g
                key={i}
                transform={t}
                stroke="#e3c58d"
                strokeWidth="1.6"
                strokeLinejoin="round"
              >
                <path
                  d="M23 115V49Q23 23 49 23H115L89 49H49V89Z"
                  fill="#bca7dcaa"
                />
                <path d="M29 76V49Q29 29 49 29H76L49 49Z" fill="#a5d8d5" />
                <path d="M49 49H89L70 70H49Z" fill="#e9b3b9" />
                <path d="M49 49V89L70 70V49Z" fill="#9aaed5" />
                <path d="M23 115L49 89V70L23 91Z" fill="#ecc184" />
                <path d="M91 23L70 49H89L115 23Z" fill="#91c2a6" />
              </g>
            ))}
            {enamelColors.map((c, i) => (
              <g key={c} fill={c} stroke="#e6cd9b" strokeWidth="1">
                <path d={`M${152 + i * 42} 16h32l-5 8h-32Z`} />
                <path d={`M${848 - i * 42} 576h-32l5 8h32Z`} />
              </g>
            ))}
            <path
              d="M465 20L480 39L500 49L520 39L535 20"
              fill="#718fb755"
              stroke="var(--g-metal)"
              strokeWidth="1.5"
            />
            <Gem x={500} y={29} size={15} color="#c9a0cf" />
          </>
        )}
        {id === "floral" && (
          <>
            {corners.map((t, i) => (
              <g key={i} transform={t}>
                <path
                  d="M24 132Q26 82 69 69Q82 26 132 24"
                  fill="none"
                  stroke="#162c38"
                  strokeWidth="6"
                />
                <path
                  d="M24 132Q26 82 69 69Q82 26 132 24"
                  fill="none"
                  stroke="#bfded0"
                  strokeWidth="2"
                />
                {[
                  [43, 100, -30],
                  [100, 43, 100],
                  [71, 71, 15],
                ].map(([x, y, r], j) => (
                  <g key={j} transform={`translate(${x} ${y}) rotate(${r})`}>
                    <path
                      d="M0 0Q-24 -29 -25 -6Q-24 12 0 0M0 0Q8 -28 25 -21Q27 -5 0 0"
                      fill="#82bcb1"
                      stroke="#182b39"
                      strokeWidth="1.8"
                    />
                    {Array.from({ length: 5 }, (_, k) => (
                      <ellipse
                        key={k}
                        cy="-9"
                        rx="5.5"
                        ry="12"
                        transform={`rotate(${k * 72})`}
                        fill={["#ebb7c1", "#bca8e1", "#e8bd98"][j]}
                        stroke="#382e43"
                        strokeWidth="1"
                      />
                    ))}
                    <circle
                      r="4"
                      fill="#f5dca2"
                      stroke="#6b6551"
                      strokeWidth="1"
                    />
                  </g>
                ))}
              </g>
            ))}
            <path
              d="M145 25Q290 33 435 24M565 24Q710 33 855 25M145 575Q290 567 435 576M565 576Q710 567 855 575"
              fill="none"
              stroke="#bcd5bf"
              strokeWidth="2.3"
            />
            {[190, 280, 370, 630, 720, 810].map((x, i) => (
              <ellipse
                key={x}
                cx={x}
                cy={i < 3 ? 27 : 573}
                rx="10"
                ry="3"
                transform={`rotate(${i < 3 ? -18 : 18} ${x} ${i < 3 ? 27 : 573})`}
                fill={enamelColors[i]}
                stroke="#243545"
                strokeWidth="1"
              />
            ))}
          </>
        )}
      </svg>
      <FancyFrameDetails id={id} />
    </div>
  );
}

export function RingPresetArt({
  id,
  front = false,
  particles = true,
  staticPreview = false,
}: {
  id: RingId;
  front?: boolean;
  particles?: boolean;
  staticPreview?: boolean;
}) {
  const unique = useId().replaceAll(":", "");
  if (id === "jellyfish")
    return (
      <JellyfishOrbit
        front={front}
        particles={particles}
        staticPreview={staticPreview}
      />
    );
  const path = front
    ? "M432 260A182 52 0 0 1 68 260"
    : "M68 260A182 52 0 0 1 432 260";
  const angles = front
    ? [0.16, 0.48, 0.82, 1.15, 1.57, 1.98, 2.3, 2.64, 2.96]
    : [3.3, 3.7, 4.1, 4.7, 5.3, 5.7, 6.1];
  return (
    <svg
      className={`gp-orbit-art ${front ? "gp-ring-front" : "gp-ring-back"}`}
      viewBox="0 0 500 520"
      style={materialStyle(id)}
      aria-hidden="true"
      data-ring={id}
    >
      <defs>
        <linearGradient id={unique}>
          <stop stopColor="var(--g-metal)" />
          <stop offset=".45" stopColor="var(--g-light)" />
          <stop offset="1" stopColor="var(--g-accent)" />
        </linearGradient>
      </defs>
      <g transform="rotate(-22 250 260)" fill="none">
        <path
          d={path}
          stroke="#0b1728"
          strokeWidth={id === "enamel" ? 10 : 8}
          opacity=".8"
        />
        <path
          d={path}
          stroke={`url(#${unique})`}
          strokeWidth={id === "enamel" ? 7 : 2.8}
        />
        <path
          d={path}
          transform="translate(0 -5)"
          stroke="var(--g-light)"
          strokeWidth=".7"
        />
        {id === "gold" && (
          <path
            d={path}
            transform="translate(0 5)"
            stroke="var(--g-metal)"
            strokeWidth="1"
          />
        )}
        {id === "silver" && (
          <path
            d={path}
            stroke="var(--g-light)"
            strokeWidth="5"
            strokeDasharray=".5 13"
          />
        )}
        {id === "enamel" &&
          enamelColors.map((c, i) => {
            const start = (front ? 0 : Math.PI) + (i * Math.PI) / 6 + 0.025,
              end = start + Math.PI / 6 - 0.05;
            return (
              <path
                key={c}
                d={`M${250 + 182 * Math.cos(start)} ${260 + 52 * Math.sin(start)}A182 52 0 0 1 ${250 + 182 * Math.cos(end)} ${260 + 52 * Math.sin(end)}`}
                stroke={c}
                strokeWidth="4.4"
              />
            );
          })}
        {angles.map((a, i) => {
          const x = 250 + 182 * Math.cos(a),
            y = 260 + 52 * Math.sin(a);
          return (
            <g key={a}>
              {id === "gem" ? (
                <Gem
                  x={x}
                  y={y}
                  size={i % 2 === 0 ? 6 : 3.5}
                  color={i % 2 === 0 ? "#bca3ed" : "#8bbde6"}
                />
              ) : id === "gold" ? (
                <g
                  transform={`translate(${x} ${y}) rotate(${(a * 180) / Math.PI - 90})`}
                >
                  <path
                    d="M0 0Q-7 -10 -9 -4Q-8 3 0 0M0 0Q7 -10 9 -4Q8 3 0 0"
                    fill="var(--g-metal)"
                    stroke="#4f3b2c"
                    strokeWidth=".6"
                  />
                  <circle r="2" fill="var(--g-light)" />
                </g>
              ) : (
                <Spark
                  x={x}
                  y={y}
                  size={id === "silver" && i % 3 === 0 ? 5 : 2.4}
                />
              )}
            </g>
          );
        })}
        {front && id === "silver" && (
          <>
            <path d="M250 312V330" stroke="var(--g-metal)" />
            <Gem x={250} y={334} size={5} color="#c6e5ff" />
          </>
        )}
        {front && id === "gem" && (
          <>
            <path
              d="M185 309Q200 333 220 312M280 312Q300 333 315 309"
              stroke="var(--g-metal)"
              strokeWidth="1"
            />
            <Gem x={250} y={312} size={8} color="#a3b2ef" />
          </>
        )}
      </g>
    </svg>
  );
}
