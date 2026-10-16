import { useId } from "react";
export const KnowledgeLabels: Record<string, string> = {
  K01: "色相",
  K02: "明度",
  K03: "纯度／彩度",
  K04: "冷暖",
  K05: "相近配色",
  K06: "对比配色",
  K07: "色彩面积",
};
export function KnowledgeVisual({
  id,
  large = false,
}: {
  id: string;
  large?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  if (id === "K01")
    return (
      <div
        className="knowledge-color-wheel"
        role="img"
        aria-label="连续色相环，比较不同颜色类别"
      >
        <i />
      </div>
    );
  if (id === "K02" || id === "K03")
    return (
      <div
        className="knowledge-steps"
        role="img"
        aria-label={
          id === "K02"
            ? "同一紫色相由暗到亮的色阶"
            : "接近同一明度，由中性灰到鲜艳紫色的彩度变化"
        }
      >
        {Array.from({ length: 7 }, (_, i) => (
          <i
            key={i}
            style={{
              background:
                id === "K02"
                  ? `oklch(${0.28 + i * 0.09} .12 300)`
                  : `oklch(.66 ${i * 0.035} 300)`,
            }}
          />
        ))}
      </div>
    );
  if (id === "K05" || id === "K06")
    return (
      <svg
        viewBox="0 0 360 170"
        role="img"
        aria-label={
          id === "K05"
            ? "蓝、青、绿三个相邻色相，互不混色"
            : "紫与黄色并列，观察双色差异"
        }
      >
        <rect width="360" height="170" fill="#0c1929" />
        {(id === "K05"
          ? ["#497de2", "#58bfc2", "#69b98c"]
          : ["#9a7bd1", "#f2d15c"]
        ).map((c, i, a) => (
          <circle
            key={c}
            cx={a.length === 3 ? 76 + i * 104 : 110 + i * 140}
            cy="84"
            r={a.length === 3 ? 45 : 58}
            fill={c}
          />
        ))}
        <path d="M30 152H330" stroke="#95a5bd" opacity=".2" />
      </svg>
    );
  if (id === "K07")
    return (
      <svg
        viewBox="0 0 660 170"
        role="img"
        aria-label="使用相同蓝色和珊瑚色，交换主色与点缀色的面积"
      >
        <rect x="8" y="8" width="306" height="154" rx="6" fill="#416fbc" />
        <circle cx="165" cy="85" r="38" fill="#ed8d88" />
        <rect x="346" y="8" width="306" height="154" rx="6" fill="#ed8d88" />
        <circle cx="498" cy="85" r="38" fill="#416fbc" />
      </svg>
    );
  return (
    <svg
      viewBox={large ? "0 0 660 350" : "0 0 360 170"}
      role="img"
      aria-label="相同山水构图的冷色版和暖色版并排比较"
    >
      <defs>
        <symbol id={uid} viewBox="0 0 330 350">
          <rect width="330" height="350" fill="var(--sky)" />
          <circle cx="240" cy="95" r="40" fill="var(--sun)" />
          <path
            d="M0 225L95 125 172 215 255 155 330 225V350H0Z"
            fill="var(--far)"
          />
          <path
            d="M0 240L65 190 150 245 250 205 330 250V350H0Z"
            fill="var(--near)"
          />
          <path d="M0 275Q165 255 330 275V350H0Z" fill="var(--water)" />
          <path
            d="M90 305H245M115 321H210M145 338H190"
            stroke="var(--sun)"
            opacity=".6"
          />
        </symbol>
      </defs>
      <svg
        x="0"
        width={large ? 330 : 180}
        height={large ? 350 : 170}
        style={
          {
            "--sky": "#1d3b6e",
            "--sun": "#adcceb",
            "--far": "#477aa2",
            "--near": "#294766",
            "--water": "#315d81",
          } as React.CSSProperties
        }
      >
        <use href={"#" + uid} />
      </svg>
      <svg
        x={large ? 330 : 180}
        width={large ? 330 : 180}
        height={large ? 350 : 170}
        style={
          {
            "--sky": "#b46e80",
            "--sun": "#f6d599",
            "--far": "#bb815f",
            "--near": "#7b526a",
            "--water": "#956979",
          } as React.CSSProperties
        }
      >
        <use href={"#" + uid} />
      </svg>
    </svg>
  );
}
