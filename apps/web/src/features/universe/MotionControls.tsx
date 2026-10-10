import { useEffect, useState } from "react";
import type { PlanetMotion } from "@colorverse/contracts";
import {
  DEFAULT_PLANET_MOTION,
  planetOrbit,
  orbitPath,
  type UniverseEntry,
} from "@colorverse/domain";

const paths = [
  { id: "circle", name: "圆形绕行" },
  { id: "ellipse", name: "椭圆绕行" },
  { id: "figure-eight", name: "八字漫游" },
  { id: "drift", name: "轻柔往返" },
] as const;
export function MotionControls({
  entry,
  canEdit,
  onSave,
  active = true,
}: {
  entry: UniverseEntry;
  canEdit: boolean;
  onSave: (
    motion: PlanetMotion,
    expectedLayoutRevision: number,
  ) => Promise<void>;
  active?: boolean;
}) {
  const initial = entry.motion ?? DEFAULT_PLANET_MOTION;
  const [draft, setDraft] = useState<PlanetMotion>({ ...initial }),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => {
    if (!canEdit) {
      setDraft({ ...initial });
      setError("");
      setSaved(false);
    }
  }, [canEdit, initial]);
  useEffect(() => {
    if (!canEdit || !changed) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [canEdit, changed]);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const patch = (p: Partial<PlanetMotion>) => {
    setDraft((m) => ({ ...m, ...p }));
    setSaved(false);
    setError("");
  };
  return (
    <section className="planet-motion-settings" aria-label="星球运动设置">
      <h3>星球运动</h3>
      <p className="hint">
        {canEdit
          ? "先看轨迹示意，保存后应用到宇宙。"
          : "可以欣赏运行方式；学生只能设置自己的星球。"}
      </p>
      {!entry.motion && <p className="hint">当前沿用默认慢速轨迹。</p>}
      <fieldset disabled={!canEdit || pending}>
        <legend>运动状态</legend>
        <div className="motion-mode-options">
          {(
            [
              { id: "stationary", name: "静止" },
              { id: "slow", name: "慢速" },
              { id: "fast", name: "快速" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={draft.mode === m.id}
              onClick={() => patch({ mode: m.id })}
            >
              {m.name}
            </button>
          ))}
        </div>
        <div className="motion-path-options" aria-label="轨迹选择">
          {paths.map((path) => {
            const orbit = planetOrbit(
              {
                ...entry,
                layoutRevision: entry.layoutRevision ?? 0,
                position: { x: 0, y: 0 },
                motion: {
                  ...draft,
                  mode: "slow" as const,
                  trajectory: path.id,
                },
              },
              42,
            );
            const points = orbitPath(orbit),
              d = points
                .map(
                  (p, i) =>
                    `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`,
                )
                .join(" ");
            return (
              <button
                key={path.id}
                type="button"
                aria-pressed={draft.trajectory === path.id}
                disabled={draft.mode === "stationary"}
                onClick={() => patch({ trajectory: path.id })}
              >
                <svg viewBox="-360 -360 720 720" aria-hidden="true">
                  <path d={d} />
                  <circle r="16" fill="currentColor">
                    {active && !reduced && draft.mode !== "stationary" && (
                      <animateMotion
                        key={`${d}-${draft.direction}-${draft.mode}`}
                        path={d}
                        dur={draft.mode === "fast" ? "4s" : "8s"}
                        repeatCount="indefinite"
                        keyPoints="0;1"
                        keyTimes="0;1"
                        calcMode="linear"
                      />
                    )}
                  </circle>
                </svg>
                <span>{path.name}</span>
              </button>
            );
          })}
        </div>
        <div className="motion-selects">
          <label>
            活动范围
            <select
              aria-label="星球活动范围"
              value={draft.range}
              disabled={draft.mode === "stationary"}
              onChange={(e) =>
                patch({ range: e.target.value as PlanetMotion["range"] })
              }
            >
              <option value="compact">紧凑</option>
              <option value="regular">常规</option>
              <option value="wide">开阔</option>
            </select>
          </label>
          <label>
            运行方向
            <select
              aria-label="星球运行方向"
              value={draft.direction}
              disabled={draft.mode === "stationary"}
              onChange={(e) =>
                patch({
                  direction: e.target.value as PlanetMotion["direction"],
                })
              }
            >
              <option value="forward">正向</option>
              <option value="reverse">反向</option>
            </select>
          </label>
        </div>
      </fieldset>
      <p className="hint">
        {draft.mode === "stationary"
          ? "星球固定在布局位置，装饰保留。"
          : draft.mode === "fast"
            ? "快速约30–60秒一圈，范围受限。"
            : "慢速约90–190秒一圈，适合日常展览。"}
        {reduced && " 系统已减少动态效果，当前观看保持静止。"}
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {canEdit && (
        <div className="row-buttons">
          <button
            type="button"
            className="outline"
            disabled={pending || !changed}
            onClick={() => {
              setDraft({ ...initial });
              setError("");
              setSaved(false);
            }}
          >
            取消调整
          </button>
          <button
            type="button"
            className="primary"
            disabled={pending || (Boolean(entry.motion) && !changed)}
            onClick={async () => {
              if (pending) return;
              setPending(true);
              setError("");
              try {
                await onSave(draft, entry.layoutRevision ?? 0);
                setSaved(true);
              } catch (e) {
                setError(e instanceof Error ? e.message : "保存失败，请重试");
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "正在保存…" : "保存运动设置"}
          </button>
        </div>
      )}
      <p className="hint" role="status">
        {saved
          ? "运动设置已保存"
          : changed
            ? "调整尚未保存"
            : entry.motion
              ? "已保存的运行方式"
              : "尚未自定义运行方式"}
      </p>
    </section>
  );
}
