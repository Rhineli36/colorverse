import { useEffect, useState, type CSSProperties } from "react";
import { classroomRequest } from "./cloud-request";
import {
  WardrobeState,
  type WardrobeData,
} from "../growth-preview/wardrobe-types";
import { FramePresetArt } from "../growth-preview/PresetArt";
import { FloatingCharm } from "../growth-preview/FloatingCharms";
import { StarDust } from "../growth-preview/Ornaments";
import "../growth-preview/preview.css";
import "./equipped-decorations.css";

export default function EquippedPlanetDecorations({
  classId,
  planetId,
}: {
  classId: string;
  planetId: string;
}) {
  const [data, setData] = useState<WardrobeData>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setData(undefined);
    setError(false);
    classroomRequest(`classes/${classId}/decorations?planetId=${planetId}`, {
      signal: c.signal,
    })
      .then((r) => r.json())
      .then((v) => {
        if (!c.signal.aborted) setData(WardrobeState.parse(v));
      })
      .catch(() => {
        if (!c.signal.aborted) setError(true);
      });
    return () => c.abort();
  }, [classId, planetId, attempt]);
  if (error)
    return (
      <button
        className="decoration-retry"
        onClick={() => setAttempt((n) => n + 1)}
      >
        装扮读取失败，重试
      </button>
    );
  const s = data?.settings;
  if (!s?.frameId) return null;
  return (
    <div
      className="gp-app equipped-planet-decorations"
      aria-label="已保存的星球装扮"
    >
      <FramePresetArt id={s.frameId} palette={s.options.palette} />
      {s.options.particles && <StarDust interior />}
      {s.options.lantern && (
        <div
          className="gp-draggable-charm"
          data-amplitude={s.placement.amplitude}
          style={
            {
              left: s.placement.x * 100 + "%",
              top: s.placement.y * 100 + "%",
              "--charm-travel":
                s.placement.amplitude === "expressive" ? "12px" : "4px",
              "--charm-angle":
                s.placement.amplitude === "expressive" ? "4.5deg" : "1.5deg",
            } as CSSProperties
          }
        >
          <div className="gp-float-motion">
            <FloatingCharm id={s.frameId} palette={s.options.palette} />
          </div>
        </div>
      )}
    </div>
  );
}
