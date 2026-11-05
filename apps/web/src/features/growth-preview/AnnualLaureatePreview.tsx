import { useId, useState, type CSSProperties } from "react";
import { previewAsset } from "./assets";
import "./annual-laureate.css";

const palettes = [
  {
    name: "鎏金星冠",
    gold: "#e7be72",
    light: "#fff1c5",
    gem: "#90e0d2",
    shadow: "#78552d",
  },
  {
    name: "月白钻冕",
    gold: "#c9d9f1",
    light: "#f8fcff",
    gem: "#baa4ef",
    shadow: "#596586",
  },
  {
    name: "虹彩珐琅",
    gold: "#ecc49b",
    light: "#fff4da",
    gem: "#ed9fc5",
    shadow: "#87526c",
  },
];
function Jewel({
  x = 0,
  y = 0,
  size = 12,
}: {
  x?: number;
  y?: number;
  size?: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d={`M0 ${-size - 3}L${size + 3} 0L0 ${size + 3}L${-size - 3} 0Z`}
        fill="#111b2c"
        stroke="var(--al-gold)"
        strokeWidth="2"
      />
      <path
        d={`M0 ${-size}L${size} 0L0 ${size}L${-size} 0Z`}
        fill="var(--al-gem)"
      />
      <path d={`M0 ${-size}V${size}L${-size} 0Z`} fill="white" opacity=".3" />
      <path
        d={`M0 ${-size}L${size} 0H${-size}`}
        fill="none"
        stroke="white"
        opacity=".7"
        strokeWidth="1"
      />
    </g>
  );
}
function Laurels() {
  return (
    <g stroke="var(--al-gold)" strokeWidth="1.6" fill="none">
      <path d="M4 151Q27 53 165 8M10 135Q51 39 175 21M29 128Q60 83 127 66M32 41Q63 13 100 30T130 45Q153 47 174 27" />
      {Array.from({ length: 8 }, (_, i) => (
        <g
          key={i}
          transform={`translate(${20 + i * 17} ${111 - i * 11}) rotate(${18 + i * 4})`}
        >
          <path
            d="M0 0C-28-22-27-40-7-28C1-21 2-8 0 0"
            fill="var(--al-gold)"
            fillOpacity=".33"
          />
          <path
            d="M0 0C7-31 29-38 27-18C22-9 10-3 0 0"
            fill="var(--al-light)"
            fillOpacity=".43"
          />
          <path d="M-5-24L0 0L22-18" strokeWidth=".8" />
        </g>
      ))}
      <path
        d="M20 135C69 145 84 107 54 106C29 106 41 137 69 123S100 68 124 84S94 121 81 96"
        strokeWidth="2"
      />
      <path d="M50 15Q50 60 12 74M12 17Q23 44 48 48M11 16H88M11 16V94" />
      <Jewel x={47} y={48} size={15} />
      <Jewel x={92} y={87} size={9} />
      <circle cx="12" cy="16" r="5" fill="var(--al-light)" />
    </g>
  );
}
export function LaureateFrame() {
  const id = useId().replaceAll(":", "");
  return (
    <svg
      className="al-frame"
      viewBox="0 0 1200 760"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x2=".7" y2="1">
          <stop stopColor="var(--al-light)" />
          <stop offset=".3" stopColor="var(--al-gold)" />
          <stop offset=".53" stopColor="var(--al-shadow)" />
          <stop offset=".74" stopColor="var(--al-light)" />
          <stop offset="1" stopColor="var(--al-gold)" />
        </linearGradient>
      </defs>
      <path
        d="M62 19H512L540 37H660L688 19H1138Q1181 19 1181 62V698Q1181 741 1138 741H688L660 723H540L512 741H62Q19 741 19 698V62Q19 19 62 19Z"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="5"
      />
      <rect
        x="30"
        y="30"
        width="1140"
        height="700"
        rx="22"
        fill="none"
        stroke="var(--al-light)"
        strokeWidth="1"
      />
      <rect
        x="39"
        y="39"
        width="1122"
        height="682"
        rx="17"
        fill="none"
        stroke="var(--al-gold)"
        strokeWidth="1"
        strokeDasharray="2 7"
      />
      {[
        "translate(42 39)",
        "translate(1158 39) scale(-1 1)",
        "translate(42 721) scale(1 -1)",
        "translate(1158 721) scale(-1 -1)",
      ].map((t) => (
        <g key={t} transform={t}>
          <Laurels />
        </g>
      ))}
      {Array.from({ length: 23 }, (_, i) => (
        <g key={i}>
          <circle cx={210 + i * 35.5} cy="25" r="2.2" fill="var(--al-light)" />
          <circle cx={210 + i * 35.5} cy="735" r="2.2" fill="var(--al-light)" />
        </g>
      ))}
      <g transform="translate(600 28)">
        <path
          d="M-76 20L-66-12L-37 5L-20-27L0-7L20-27L37 5L66-12L76 20Z"
          fill="#142333"
          stroke={`url(#${id})`}
          strokeWidth="2"
        />
        <path d="M-59 13H59M-45 23H45" stroke="var(--al-light)" />
        <Jewel y={-6} size={16} />
      </g>
      <g transform="translate(600 726)">
        <path
          d="M-104 0Q-78-19-50-9L0-24L50-9Q78-19 104 0Q78 19 50 9L0 24L-50 9Q-78 19-104 0"
          fill="#121c2b"
          stroke="var(--al-gold)"
          strokeWidth="2"
        />
        <Jewel size={15} />
      </g>
      {[90, 1110].map((x) => (
        <g key={x} stroke="var(--al-gold)" fill="none">
          <path d={`M${x} 128V194`} />
          <Jewel x={x} y={205} size={11} />
          <path d={`M${x} 548V594`} />
          <Jewel x={x} y={607} size={10} />
        </g>
      ))}
      {[230, 970].map((x) => (
        <g key={x}>
          <path
            d={`M${x} 41Q${x + 28} 100 ${x + 66} 94`}
            fill="none"
            stroke="var(--al-gold)"
          />
          <Jewel x={x + 66} y={97} size={8} />
        </g>
      ))}
    </svg>
  );
}
export function LaureateRing({ front = false }: { front?: boolean }) {
  const id = useId().replaceAll(":", "");
  return (
    <svg
      className={`al-orbit ${front ? "al-orbit-front" : "al-orbit-back"}`}
      viewBox="0 0 500 440"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={id}>
          <rect x="0" y={front ? 220 : 0} width="500" height="220" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <g transform="rotate(-24 250 220)" fill="none" stroke="var(--al-gold)">
          <ellipse
            cx="250"
            cy="220"
            rx="228"
            ry="90"
            strokeWidth=".8"
            opacity=".6"
          />
          <ellipse
            cx="250"
            cy="220"
            rx="217"
            ry="80"
            strokeWidth="5"
            strokeOpacity=".22"
          />
          <ellipse
            cx="250"
            cy="220"
            rx="217"
            ry="80"
            strokeWidth="1.6"
            stroke="var(--al-light)"
          />
          <ellipse cx="250" cy="220" rx="207" ry="71" strokeWidth="1.2" />
          <ellipse
            cx="250"
            cy="220"
            rx="200"
            ry="65"
            strokeWidth=".7"
            strokeDasharray="1 5"
          />
          {Array.from({ length: 56 }, (_, i) => {
            const a = (i * Math.PI * 2) / 56;
            return (
              <circle
                key={i}
                cx={250 + 217 * Math.cos(a)}
                cy={220 + 80 * Math.sin(a)}
                r={i % 7 === 0 ? 2.5 : 1.2}
                fill="var(--al-light)"
                stroke="none"
              />
            );
          })}
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI * 2) / 12;
            return (
              <g
                key={i}
                transform={`translate(${250 + 217 * Math.cos(a)} ${220 + 80 * Math.sin(a)}) rotate(${i * 30})`}
              >
                <Jewel size={i % 3 === 0 ? 8 : 4} />
              </g>
            );
          })}
          <path
            d="M214 302L224 280L239 292L250 268L261 292L276 280L286 302Z"
            fill="#132432"
            strokeWidth="1.5"
          />
          <Jewel x={250} y={296} size={9} />
        </g>
      </g>
    </svg>
  );
}
function StarCrest() {
  return (
    <svg viewBox="0 0 120 180" aria-hidden="true">
      <g fill="none" stroke="var(--al-gold)" strokeWidth="1.5">
        <circle cx="60" cy="9" r="6" />
        <path
          d="M60 15V37M60 37C5 52 12 130 60 159C108 130 115 52 60 37Z"
          fill="#101d30"
          fillOpacity=".85"
        />
        <path d="M60 37C28 66 31 130 60 159C89 130 92 66 60 37Z" />
        <path
          d="M60 57L69 92L94 103L69 114L60 147L51 114L26 103L51 92Z"
          fill="var(--al-light)"
          stroke="none"
        />
        <Jewel x={60} y={103} size={13} />
        <path d="M60 159V173" />
      </g>
    </svg>
  );
}

export function AnnualLaureatePreview() {
  const [palette, setPalette] = useState(0),
    [moving, setMoving] = useState(true),
    [warm, setWarm] = useState(false),
    [large, setLarge] = useState(false);
  const p = palettes[palette];
  return (
    <section
      id="annual2026"
      aria-label="2026年度最佳限定套装预览"
      className={`al-collection ${moving ? "" : "al-paused"} ${large ? "al-expanded" : ""}`}
      style={
        {
          "--al-gold": p.gold,
          "--al-light": p.light,
          "--al-gem": p.gem,
          "--al-shadow": p.shadow,
        } as CSSProperties
      }
    >
      <header className="al-heading">
        <div>
          <p className="al-overline">THE COLORVERSE LAUREATE · 2026</p>
          <h3>2026 设计色彩年度最佳</h3>
          <p>限定皮肤 · 创作桂冠</p>
        </div>
        <span className="al-exclusive">✧ 年度专属 · 定制预留</span>
      </header>
      <div className="al-showcase">
        <div className="al-room" aria-label="年度限定内部边框预览">
          <img
            src={previewAsset(
              warm
                ? "emotion-cases/red-vermilion-c1c04cddd601.webp"
                : "competition/case-3-interior.webp",
            )}
            alt="用于检验限定装饰辨识度的背景"
          />
          <LaureateFrame />
          <div className="al-star-charm">
            <StarCrest />
          </div>
          <span className="al-room-label">鎏金花丝 · 宝石镶嵌 · 创作星徽</span>
        </div>
        <div className="al-planet" aria-label="年度限定配套星环预览">
          <div className="al-halo" />
          <LaureateRing />
          <img
            className="al-planet-body"
            src={previewAsset("competition/case-3-exterior.webp")}
            alt="佩戴年度桂冠星环的星球"
          />
          <LaureateRing front />
          {Array.from({ length: 12 }, (_, i) => (
            <i
              className="al-spark"
              key={i}
              style={{
                left: 14 + ((i * 37) % 74) + "%",
                top: 9 + ((i * 23) % 71) + "%",
                animationDelay: i * 0.3 + "s",
              }}
            />
          ))}
          <div className="al-mystery">
            <span>
              <b>?</b>
            </span>
            <small>你的定制徽章</small>
          </div>
          <p className="al-planet-label">
            多重桂冠星环<small>珠链 · 彩色宝石 · 微光</small>
          </p>
        </div>
      </div>
      <div className="al-bottom">
        <div className="al-description">
          <span className="al-medallion">2026</span>
          <div>
            <h4>最高荣誉，留给独一无二的创作。</h4>
            <p>
              年度作业总分最高者专属。获奖同学可参与设计图案、配色与标记，打造自己的皮肤与星环。
            </p>
            <small>
              当前为豪华概念样例 · 定制图案待揭晓 · 尚未接入排名与发放
            </small>
          </div>
        </div>
        <div className="al-controls">
          <div role="group" aria-label="限定套装配色">
            {palettes.map((v, i) => (
              <button
                key={v.name}
                aria-pressed={palette === i}
                onClick={() => setPalette(i)}
              >
                <i
                  style={{ background: v.gold, boxShadow: `6px 0 ${v.gem}` }}
                />
                {v.name}
              </button>
            ))}
          </div>
          <div className="al-tools">
            <button aria-pressed={warm} onClick={() => setWarm(!warm)}>
              切换背景
            </button>
            <button aria-pressed={moving} onClick={() => setMoving(!moving)}>
              {moving ? "暂停微光" : "开启微光"}
            </button>
            <button aria-expanded={large} onClick={() => setLarge(!large)}>
              {large ? "收起细节" : "放大欣赏 ↗"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
