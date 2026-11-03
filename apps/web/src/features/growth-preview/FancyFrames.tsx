import { useId } from "react";
import type { FrameId } from "./presets";
const corners = [
  "",
  "translate(1000 0) scale(-1 1)",
  "translate(0 600) scale(1 -1)",
  "translate(1000 600) scale(-1 -1)",
];
function Jewel({
  x,
  y,
  size = 12,
  color = "#64d6ac",
}: {
  x: number;
  y: number;
  size?: number;
  color?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`} strokeLinejoin="round">
      <path
        d={`M0 ${-size - 3}L${size * 0.8 + 3} 0L0 ${size + 3}L${-size * 0.8 - 3} 0Z`}
        fill="#122632"
        stroke="var(--g-metal)"
        strokeWidth="2"
      />
      <path
        d={`M0 ${-size}L${size * 0.8} 0L0 ${size}L${-size * 0.8} 0Z`}
        fill={color}
      />
      <path
        d={`M0 ${-size}L0 ${size}L${-size * 0.8} 0Z`}
        fill="#e8ffef"
        opacity=".45"
      />
      <path d={`M0 ${size}L${size * 0.8} 0L0 0Z`} fill="#09364b" opacity=".5" />
      <circle
        cx={-size * 0.2}
        cy={-size * 0.4}
        r={size * 0.12}
        fill="#fffde5"
      />
    </g>
  );
}
function Flower({
  x,
  y,
  size = 1,
  color = "#eab1d3",
}: {
  x: number;
  y: number;
  size?: number;
  color?: string;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${size})`}
      stroke="#3d3542"
      strokeWidth="1.3"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <path
          key={i}
          d="M0 0Q-17 -12 -7 -29Q6 -39 10 -23Q12 -9 0 0Z"
          transform={`rotate(${i * 45})`}
          fill={color}
        />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <ellipse
          key={i}
          cy="-9"
          rx="5"
          ry="12"
          transform={`rotate(${i * 60})`}
          fill="#ffe5cf"
          fillOpacity=".7"
          strokeWidth=".6"
        />
      ))}
      <circle r="7" fill="#e9c773" />
      <circle r="3" fill="#fff6d6" />
    </g>
  );
}
function Snow({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${size})`}
      fill="none"
      stroke="#eaffff"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <path
          key={i}
          d="M0 0V-20M0 -13L-6 -18M0 -13L6 -18M0 -6L-4 -10M0 -6L4 -10"
          transform={`rotate(${i * 60})`}
        />
      ))}
      <circle r="3" fill="#d1f8ff" />
    </g>
  );
}
export function FancyFrameDetails({ id }: { id: FrameId }) {
  const uid = useId().replaceAll(":", "");
  if (!["emerald", "glass", "floral", "winter"].includes(id)) return null;
  return (
    <svg
      className={`gp-frame-detail gp-fancy-${id}`}
      viewBox="0 0 1000 600"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={uid + "frost"}>
          <stop stopColor="#b4e7f5" stopOpacity=".1" />
          <stop offset=".5" stopColor="#effdff" stopOpacity=".65" />
          <stop offset="1" stopColor="#85b8d5" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id={uid + "gold"}>
          <stop stopColor="#ab773c" />
          <stop offset=".45" stopColor="#ffebaa" />
          <stop offset=".6" stopColor="#d7b46b" />
          <stop offset="1" stopColor="#fff2bf" />
        </linearGradient>
      </defs>
      {id === "emerald" && (
        <>
          {corners.map((t, i) => (
            <g key={i} transform={t}>
              <path
                d="M17 166Q27 94 91 78Q107 26 166 17L151 34Q112 44 104 96Q44 108 34 151Z"
                fill="#103f36d9"
                stroke="#e8ce86"
                strokeWidth="1.7"
              />
              <path
                d="M27 156Q47 100 101 99Q100 48 157 27M35 147Q63 100 112 112Q100 64 147 35"
                fill="none"
                stroke={`url(#${uid}gold)`}
                strokeWidth="2"
              />
              {Array.from({ length: 8 }, (_, j) => (
                <g
                  key={j}
                  transform={`translate(${43 + j * 13} ${147 - j * 15}) rotate(${j * 7 + 20})`}
                >
                  <path
                    d="M0 0Q-22 -22 -25 -5Q-18 7 0 0M0 0Q16 -29 25 -14Q25 0 0 0"
                    fill={j % 2 ? "#469b71" : "#7ec5a0"}
                    stroke="#e8d08e"
                    strokeWidth="1.2"
                  />
                </g>
              ))}
              <path
                d="M75 83Q140 60 147 106Q121 144 91 129M83 75Q60 140 106 147Q144 121 129 91"
                fill="none"
                stroke="#efd796"
                strokeWidth="1.8"
              />
              <Jewel x={63} y={63} size={29} />
              <Jewel x={104} y={39} size={10} color="#9be1c1" />
              <Jewel x={39} y={104} size={10} color="#9be1c1" />
              <path
                d="M117 113V155M135 96V137M95 135V170"
                stroke="#f0d49c"
                strokeWidth="1.5"
              />
              <Jewel x={117} y={163} size={10} />
              <Jewel x={135} y={144} size={7} />
              <Jewel x={95} y={177} size={7} />
            </g>
          ))}
          {[0, 600].map((y, i) => (
            <g
              key={y}
              transform={`translate(500 ${i ? 572 : 28}) scale(1 ${i ? -1 : 1})`}
            >
              <path
                d="M-94 0Q-65 45 -29 20L0 51L29 20Q65 45 94 0M-67 0Q-45 29 -19 17M67 0Q45 29 19 17"
                fill="#163f31ce"
                stroke="#e9d08d"
                strokeWidth="2"
              />
              <Jewel x={0} y={12} size={27} />
              <Jewel x={-40} y={13} size={11} />
              <Jewel x={40} y={13} size={11} />
              <path d="M0 42V64" stroke="#ecd395" />
              <Jewel x={0} y={72} size={9} />
            </g>
          ))}
          {Array.from({ length: 20 }, (_, i) => (
            <g key={i} fill="#e9d59d">
              <circle cx={190 + i * 32} cy="25" r="2" />
              <circle cx={190 + i * 32} cy="575" r="2" />
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
              stroke="#f2ce95"
              strokeWidth="1.8"
              strokeLinejoin="round"
            >
              <path
                d="M18 157V51Q18 18 51 18H157L127 48H57L48 57V127Z"
                fill="#302947eb"
              />
              {Array.from({ length: 7 }, (_, j) => {
                const a = (j * Math.PI) / 14,
                  b = ((j + 1) * Math.PI) / 14;
                return (
                  <path
                    key={j}
                    d={`M39 39L${39 + 116 * Math.cos(a)} ${39 + 116 * Math.sin(a)}L${39 + 116 * Math.cos(b)} ${39 + 116 * Math.sin(b)}Z`}
                    fill={
                      [
                        "#83d5d9",
                        "#aaa0de",
                        "#ecabc0",
                        "#f2c582",
                        "#9ccea9",
                        "#79b9d4",
                        "#d1ade2",
                      ][j]
                    }
                    fillOpacity=".86"
                  />
                );
              })}
              <path
                d="M39 39Q76 38 96 63Q104 88 96 96Q63 103 39 68Z"
                fill="#716fad"
                fillOpacity=".8"
              />
              <Flower x={53} y={53} size={0.52} color="#edd0eb" />
            </g>
          ))}
          {Array.from({ length: 22 }, (_, i) => {
            const x = 174 + i * 30,
              c = ["#b6e0df", "#e1b7dc", "#f4ca91", "#a6c5e2", "#b9d8a6"][
                i % 5
              ];
            return (
              <g key={i} stroke="#f0d3a1" strokeWidth="1.1">
                <path d={`M${x} 15h26v16h-26Z`} fill="#13263f" />
                <path d={`M${x + 2} 23l11 -7l11 7l-11 7Z`} fill={c} />
                <path d={`M${x} 569h26v16h-26Z`} fill="#13263f" />
                <path d={`M${x + 2} 577l11 -7l11 7l-11 7Z`} fill={c} />
              </g>
            );
          })}
          {Array.from({ length: 10 }, (_, i) => (
            <g key={i} stroke="#eacb96" strokeWidth="1.1">
              <path
                d={`M15 ${174 + i * 25}h16v21H15Z M969 ${174 + i * 25}h16v21h-16Z`}
                fill={["#80c6d4", "#e7b8cb", "#b7a6db", "#e7c48c"][i % 4]}
                fillOpacity=".8"
              />
            </g>
          ))}
          <g transform="translate(500 31)">
            <path
              d="M-55 0L0 43L55 0"
              fill="#24385edb"
              stroke="#f4dba5"
              strokeWidth="2"
            />
            <Flower x={0} y={0} size={0.7} color="#9cb9e8" />
            <Jewel x={0} y={39} size={10} color="#cfb9e9" />
          </g>
        </>
      )}
      {id === "floral" && (
        <>
          {corners.map((t, i) => (
            <g key={i} transform={t}>
              <path
                d="M17 188Q33 100 94 85Q101 31 188 17"
                fill="none"
                stroke="#162637"
                strokeWidth="8"
              />
              <path
                d="M17 188Q33 100 94 85Q101 31 188 17"
                fill="none"
                stroke="#d8d59f"
                strokeWidth="3"
              />
              {Array.from({ length: 10 }, (_, j) => (
                <g
                  key={j}
                  transform={`translate(${28 + j * 15} ${172 - j * 16}) rotate(${j * 9})`}
                >
                  <path
                    d="M0 0Q-31 -31 -30 -8Q-23 10 0 0M0 0Q19 -35 30 -20Q30 1 0 0"
                    fill={j % 2 ? "#9bcdc3" : "#82aaa8"}
                    stroke="#e7d5ac"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M-22 -11L0 0L21 -17"
                    fill="none"
                    stroke="#b8e5cf"
                    strokeWidth=".8"
                  />
                </g>
              ))}
              {[
                [45, 127, 0.65],
                [76, 81, 1],
                [119, 45, 0.76],
                [154, 31, 0.48],
                [31, 162, 0.45],
                [112, 98, 0.48],
              ].map(([x, y, s], j) => (
                <Flower
                  key={j}
                  x={x}
                  y={y}
                  size={s}
                  color={
                    [
                      "#dfa3c4",
                      "#efb8bb",
                      "#bfa9e1",
                      "#f1ce99",
                      "#a4cddd",
                      "#eab2d5",
                    ][j]
                  }
                />
              ))}
              <path
                d="M92 120Q126 148 150 133M120 92Q148 126 133 150"
                fill="none"
                stroke="#eadab2"
                strokeWidth="1.5"
              />
            </g>
          ))}
          <path
            d="M177 24Q315 48 426 24M574 24Q685 48 823 24M177 576Q315 552 426 576M574 576Q685 552 823 576"
            fill="none"
            stroke="#dac391"
            strokeWidth="2.3"
          />
          {Array.from({ length: 14 }, (_, i) => (
            <g key={i}>
              <ellipse
                cx={194 + i * 44}
                cy="30"
                rx="11"
                ry="4"
                transform={`rotate(${i % 2 ? 22 : -22} ${194 + i * 44} 30)`}
                fill={i % 2 ? "#ecbfd8" : "#aacfc9"}
                stroke="#f6dfb9"
                strokeWidth=".7"
              />
              <ellipse
                cx={194 + i * 44}
                cy="570"
                rx="11"
                ry="4"
                transform={`rotate(${i % 2 ? -22 : 22} ${194 + i * 44} 570)`}
                fill={i % 2 ? "#c9b4e4" : "#e4bd9b"}
                stroke="#f6dfb9"
                strokeWidth=".7"
              />
            </g>
          ))}
          <Flower x={500} y={28} size={0.9} color="#eebdcf" />
          <Flower x={500} y={572} size={0.7} color="#bea9e3" />
        </>
      )}
      {id === "winter" && (
        <>
          <path
            d="M18 117V49Q18 18 49 18H142M858 18H951Q982 18 982 49V117M18 483V551Q18 582 49 582H142M858 582H951Q982 582 982 551V483"
            fill="none"
            stroke={`url(#${uid}frost)`}
            strokeWidth="18"
          />
          {corners.map((t, i) => (
            <g key={i} transform={t}>
              <path
                d="M24 148Q44 91 89 89Q91 44 148 24M37 143Q41 110 68 104M104 68Q110 41 143 37"
                fill="none"
                stroke="#effdff"
                strokeWidth="1.7"
              />
              {Array.from({ length: 7 }, (_, j) => (
                <g
                  key={j}
                  transform={`translate(${39 + j * 14} ${139 - j * 15}) rotate(${j * 6 - 20})`}
                >
                  <path
                    d="M0 0L-19 -21M0 0L-21 -6M0 0L-7 -22M0 0L17 -20M0 0L21 -5"
                    fill="none"
                    stroke="#c4e7ee"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M-18 -20L-14 -17M16 -19L11 -15"
                    stroke="#fff"
                    strokeWidth="2"
                  />
                </g>
              ))}
              <Snow x={54} y={54} size={1.45} />
              <Snow x={105} y={33} size={0.6} />
              <Snow x={33} y={110} size={0.55} />
              <path
                d="M81 92Q98 73 107 91Q104 110 81 92M92 81Q73 98 91 107Q110 104 92 81"
                fill="#e2c28d"
                stroke="#f9e4b6"
                strokeWidth="1"
              />
              <path d="M80 116V152" stroke="#d8edf7" />
              <Jewel x={80} y={163} size={12} color="#b6e7f5" />
            </g>
          ))}
          {Array.from({ length: 18 }, (_, i) => (
            <g key={i} fill="#d7f3ff" stroke="#4c6c84" strokeWidth=".6">
              <path d={`M${168 + i * 38} 20l4 13l-4 17l-4 -17Z`} />
              <path d={`M${168 + i * 38} 580l3 -10l-3 -13l-3 13Z`} />
            </g>
          ))}
          <g transform="translate(500 27)">
            <path
              d="M-57 -9H57L65 5L48 24H-48L-65 5Z"
              fill="#142b43ed"
              stroke="#e4eff4"
              strokeWidth="1.7"
            />
            <text
              y="11"
              textAnchor="middle"
              fontSize="19"
              fontFamily="'Microsoft YaHei',sans-serif"
              letterSpacing="6"
              fill="#effaff"
            >
              立冬
            </text>
            <Snow x={-83} y={3} size={0.65} />
            <Snow x={83} y={3} size={0.65} />
          </g>
          <path
            d="M430 579Q465 550 500 567Q535 550 570 579"
            fill="none"
            stroke="#ecfaff"
            strokeWidth="1.6"
          />
          <Snow x={500} y={569} size={0.9} />
        </>
      )}
    </svg>
  );
}
