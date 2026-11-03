import { useId, type CSSProperties } from "react";
import { materials, type FrameId } from "./presets";

export const charmNames: Record<FrameId, string> = {
  silver: "月牙风铃",
  gold: "日轮金铃",
  sapphire: "蓝晶吊坠",
  emerald: "翡翠叶蝶",
  glass: "琉璃流苏",
  floral: "彩绘花蝶",
  winter: "霜柿小灯",
};
function Prism({
  x,
  y,
  size = 22,
  color = "#b5cdf6",
}: {
  x: number;
  y: number;
  size?: number;
  color?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`} strokeLinejoin="round">
      <path
        d={`M0 ${-size}L${size * 0.6} 0L0 ${size}L${-size * 0.6} 0Z`}
        fill={color}
        stroke="#24354a"
        strokeWidth="2.5"
      />
      <path
        d={`M0 ${-size}L0 ${size}L${-size * 0.6} 0Z`}
        fill="#fff"
        opacity=".3"
      />
      <path
        d={`M0 ${size}L${size * 0.6} 0L0 0Z`}
        fill="#132b59"
        opacity=".35"
      />
      <path d={`M0 ${-size}L${size * 0.6} 0L0 0Z`} fill="#fff" opacity=".32" />
    </g>
  );
}
function TinyStar({ x, y, size = 5 }: { x: number; y: number; size?: number }) {
  return (
    <path
      d={`M${x} ${y - size}Q${x + 1} ${y - 1} ${x + size} ${y}Q${x + 1} ${y + 1} ${x} ${y + size}Q${x - 1} ${y + 1} ${x - size} ${y}Q${x - 1} ${y - 1} ${x} ${y - size}Z`}
      fill="var(--g-light)"
      stroke="#223449"
      strokeWidth=".6"
    />
  );
}
export function FloatingCharm({ id }: { id: FrameId }) {
  const uid = useId().replaceAll(":", "");
  const [metal, light, accent] = materials[id];
  return (
    <svg
      viewBox="0 0 150 240"
      className={`gp-charm-art gp-charm-${id}`}
      data-charm={id}
      aria-hidden="true"
      style={
        {
          "--g-metal": metal,
          "--g-light": light,
          "--g-accent": accent,
        } as CSSProperties
      }
    >
      <defs>
        <linearGradient id={uid + "orange"} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#ffdc88" />
          <stop offset=".45" stopColor="#f59a48" />
          <stop offset="1" stopColor="#d85b3a" />
        </linearGradient>
        <linearGradient id={uid + "metal"}>
          <stop stopColor={metal} />
          <stop offset=".45" stopColor={light} />
          <stop offset="1" stopColor={accent} />
        </linearGradient>
      </defs>
      <circle
        cx="75"
        cy="31"
        r="8"
        fill="#14263b77"
        stroke="#203047"
        strokeWidth="4"
      />
      <circle
        cx="75"
        cy="31"
        r="8"
        fill="none"
        stroke={metal}
        strokeWidth="1.5"
      />
      <path d="M75 39V59" fill="none" stroke="#16253a" strokeWidth="4" />
      <path d="M75 39V59" fill="none" stroke={metal} strokeWidth="1.4" />
      {id === "silver" && (
        <>
          <path
            d="M94 65C40 49 20 105 44 139C62 165 103 155 116 125C74 147 50 99 94 65Z"
            fill={`url(#${uid}metal)`}
            stroke="#1b2d44"
            strokeWidth="2.5"
          />
          <path
            d="M87 69C49 63 28 108 49 136"
            fill="none"
            stroke="#f6fcff"
            strokeWidth="1.8"
          />
          <path
            d="M48 143V174M76 155V192M103 146V170"
            stroke={metal}
            strokeWidth="1.6"
          />
          <Prism x={48} y={182} size={8} />
          <Prism x={76} y={202} size={10} />
          <TinyStar x={103} y={179} size={8} />
          <TinyStar x={92} y={103} size={14} />
          <TinyStar x={120} y={80} size={4} />
        </>
      )}
      {id === "gold" && (
        <>
          <g transform="translate(75 110)">
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d="M0 -25Q-7 -43 0 -49Q7 -43 0 -25Z"
                transform={`rotate(${i * 30})`}
                fill={`url(#${uid}metal)`}
                stroke="#3a2d2e"
                strokeWidth="1.3"
              />
            ))}
            <circle r="26" fill="#b67f3e" stroke="#302c37" strokeWidth="3" />
            <circle r="22" fill={`url(#${uid}metal)`} />
            <TinyStar x={0} y={0} size={15} />
          </g>
          <path d="M75 140V164" stroke={metal} strokeWidth="1.5" />
          <path
            d="M58 179Q58 158 75 158Q92 158 92 179L97 185H53Z"
            fill={`url(#${uid}metal)`}
            stroke="#25344b"
            strokeWidth="2"
          />
          <path d="M62 179H88M75 185V195" stroke={light} strokeWidth="1.5" />
          <circle cx="75" cy="199" r="4" fill={metal} />
        </>
      )}
      {id === "sapphire" && (
        <>
          <path
            d="M75 63Q39 72 38 101L75 94L112 101Q111 72 75 63Z"
            fill="#849dbf"
            fillOpacity=".8"
            stroke={metal}
            strokeWidth="1.4"
          />
          <Prism x={75} y={123} size={53} color="#77a8ec" />
          <path
            d="M75 73L49 120L75 174L101 120Z"
            fill="none"
            stroke="#ecf9ff"
            strokeWidth="1.2"
          />
          <path
            d="M44 95V138M106 95V138M75 177V192"
            stroke={metal}
            strokeWidth="1.2"
          />
          <Prism x={44} y={148} size={9} />
          <Prism x={106} y={148} size={9} />
          <TinyStar x={75} y={200} size={8} />
        </>
      )}
      {(id === "emerald" || id === "floral") && (
        <>
          <g className="gp-charm-wings" stroke="#27313c" strokeWidth="2">
            <path
              d="M73 116Q33 64 23 87Q12 118 65 122Q19 131 41 153Q57 166 75 125Z"
              fill={id === "emerald" ? "#67cba2" : "#e9a7c9"}
            />
            <path
              d="M77 116Q117 64 127 87Q138 118 85 122Q131 131 109 153Q93 166 75 125Z"
              fill={id === "emerald" ? "#93dec1" : "#b9a3df"}
            />
            <path
              d="M73 117Q44 97 33 89M77 117Q106 97 117 89M66 126L44 146M84 126L106 146"
              stroke={light}
              strokeWidth="1.3"
              fill="none"
            />
            {[
              [-1, 0],
              [1, 0],
            ].map(([s], i) => (
              <g key={i} transform={`translate(75 120) scale(${s} 1)`}>
                <ellipse
                  cx="27"
                  cy="-16"
                  rx="9"
                  ry="5"
                  fill={id === "emerald" ? "#d1f3c8" : "#f5d6a6"}
                  stroke={metal}
                  strokeWidth="1"
                />
              </g>
            ))}
          </g>
          <Prism
            x={75}
            y={119}
            size={20}
            color={id === "emerald" ? "#4ab68d" : "#f2c791"}
          />
          <path
            d="M72 100Q63 76 59 82M78 100Q87 76 91 82M75 141V180"
            fill="none"
            stroke={metal}
            strokeWidth="1.6"
          />
          {id === "emerald" ? (
            <Prism x={75} y={191} size={13} color="#8fdbbb" />
          ) : (
            <>
              <g
                transform="translate(75 188)"
                fill="#e9b4d4"
                stroke="#514257"
                strokeWidth=".8"
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <ellipse
                    key={i}
                    cy="-8"
                    rx="5"
                    ry="9"
                    transform={`rotate(${i * 72})`}
                  />
                ))}
                <circle r="4" fill="#f9e6a8" />
              </g>
              <TinyStar x={29} y={69} size={5} />
              <TinyStar x={125} y={155} size={4} />
            </>
          )}
        </>
      )}
      {id === "glass" && (
        <>
          <path
            d="M23 93Q75 38 127 93M23 93Q75 109 127 93"
            fill="#142b4555"
            stroke="#223247"
            strokeWidth="5"
          />
          <path
            d="M23 93Q75 38 127 93M23 93Q75 109 127 93"
            fill="none"
            stroke={metal}
            strokeWidth="1.7"
          />
          {[
            [-36, 145, "#90d8d8"],
            [0, 173, "#bda2e8"],
            [36, 145, "#e7aec9"],
          ].map(([x, y, c], i) => (
            <g key={i}>
              <path
                d={`M${75 + Number(x)} 94V${Number(y) - 26}`}
                stroke={metal}
                strokeWidth="1.6"
              />
              <Prism
                x={75 + Number(x)}
                y={Number(y)}
                size={23}
                color={String(c)}
              />
              <circle
                cx={75 + Number(x)}
                cy={Number(y) + 32}
                r="3"
                fill={light}
              />
            </g>
          ))}
          <Prism x={75} y={77} size={14} color="#a3c9e4" />
        </>
      )}
      {id === "winter" && (
        <>
          <path
            d="M75 58Q66 81 75 99M75 69Q99 54 110 79M74 77Q48 62 35 78"
            fill="none"
            stroke="#644b41"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M75 58Q66 81 75 99M75 69Q99 54 110 79"
            fill="none"
            stroke="#e4ccb1"
            strokeWidth="1"
          />
          <path
            d="M74 98C43 78 24 105 43 137C58 162 82 164 103 139C125 108 105 83 74 98Z"
            fill={`url(#${uid}orange)`}
            stroke="#243447"
            strokeWidth="2.7"
          />
          <path
            d="M75 103Q66 127 76 149M76 103Q100 109 99 132"
            fill="none"
            stroke="#bd643d"
            strokeWidth="1.1"
            opacity=".6"
          />
          <path
            d="M75 101L56 88L73 92L84 80L85 95L102 92L87 104L75 101Z"
            fill="#8caeb0"
            stroke="#3f605d"
            strokeWidth="1.2"
          />
          <path
            d="M47 109Q41 123 51 130"
            stroke="#fff2cf"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
            opacity=".65"
          />
          <path
            d="M104 79C88 70 83 88 94 100C104 115 121 102 123 91Q121 76 104 79Z"
            fill={`url(#${uid}orange)`}
            stroke="#344357"
            strokeWidth="1.6"
          />
          <path d="M103 81L96 73L106 76L114 70L114 80L121 83Z" fill="#9ab7b7" />
          <path
            d="M39 78Q24 64 27 58Q46 58 50 78M99 65Q102 45 115 48Q118 65 99 65"
            fill="#b1ced0"
            stroke="#edfaff"
            strokeWidth="1.2"
          />
          <path
            d="M27 59L48 76M102 63L113 49"
            stroke="#6b949c"
            strokeWidth="1"
          />
          <TinyStar x={37} y={156} size={5} />
          <TinyStar x={117} y={121} size={4} />
          <path d="M75 158V181" stroke="#d3eaf5" strokeWidth="1.3" />
          <Prism x={75} y={191} size={10} color="#c5edfa" />
          {[
            [-7, 2],
            [0, 0],
            [7, 2],
          ].map(([x, y], i) => (
            <circle key={i} cx={68 + x} cy={94 + y} r="1.4" fill="#f2ffff" />
          ))}
        </>
      )}
    </svg>
  );
}
