import { useEffect, useState } from "react";
import type { PlanetMotion } from "@colorverse/contracts";
import { orbitPath, planetOrbit } from "@colorverse/domain";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReduced(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  return reduced;
}
const motionNames = { stationary: "静止", slow: "慢速", fast: "快速" };
const pathNames = {
  circle: "圆形绕行",
  ellipse: "椭圆绕行",
  "figure-eight": "八字漫游",
  drift: "轻柔往返",
};
export function CloudMotionPreview({ motion }: { motion: PlanetMotion }) {
  const reduced = useReducedMotion();
  const orbit = planetOrbit(
    { planetId: "cloud-preview", position: { x: 0, y: 0 }, scale: 1, motion },
    42,
  );
  // Translate the real path to the origin for a compact accelerated preview.
  const points = orbitPath(orbit).map((p) => ({
    x: p.x - orbit.center.x,
    y: p.y - orbit.center.y,
  }));
  const d = points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  return (
    <div className="cloud-motion-preview" aria-label="云端运动即时预览">
      <svg
        viewBox="-220 -220 440 440"
        role="img"
        aria-label={`${motionNames[motion.mode]} · ${pathNames[motion.trajectory]}`}
      >
        <path
          d={d}
          fill="none"
          stroke="#90c6dd"
          strokeWidth="2"
          strokeDasharray="6 8"
        />
        <circle
          r="12"
          fill="#e6f5c4"
          cx={reduced || motion.mode === "stationary" ? points[0].x : 0}
          cy={reduced || motion.mode === "stationary" ? points[0].y : 0}
        >
          {!reduced && motion.mode !== "stationary" && (
            <animateMotion
              key={JSON.stringify(motion)}
              path={d}
              dur={`${orbit.periodSec / 3}s`}
              repeatCount="indefinite"
            />
          )}
        </circle>
      </svg>
      <p>
        {motionNames[motion.mode]} · {pathNames[motion.trajectory]}
      </p>
      <small>轨迹预览加速 3 倍；保存后应用到真实班级宇宙。</small>
    </div>
  );
}
