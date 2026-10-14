import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { CloudPlanetDocumentSchema } from "@colorverse/contracts";
import {
  cloudUniverseLayout,
  orbitPosition,
  orbitPath,
} from "@colorverse/domain";
import { useReducedMotion } from "./CloudMotionPreview";
import { CloudPlanetOrb } from "./CloudPlanetAppearance";
import background from "../../../../../packages/renderer/src/assets/universe-v2.webp";

type CloudPlanet = {
  id: string;
  owner_enrollment_id: string;
  display_name: string;
  document: z.infer<typeof CloudPlanetDocumentSchema>;
  previewImage?: string;
  sample?: boolean;
  works: { withdrawn: boolean }[];
};
const motionNames = { stationary: "静止", slow: "慢速", fast: "快速" };
export function CloudUniverse({
  classId,
  planets,
  actorId,
  selectedId,
  disabled,
  teacher,
  onSelect,
  exhibition = false,
}: {
  classId: string;
  planets: CloudPlanet[];
  actorId: string;
  selectedId: string;
  disabled: boolean;
  teacher: boolean;
  onSelect: (id: string) => void;
  exhibition?: boolean;
}) {
  const [paused, setPaused] = useState(false),
    [guides, setGuides] = useState(true),
    [rate, setRate] = useState(1);
  const reduced = useReducedMotion();
  const [columns, setColumns] = useState<2 | 3 | 5>(() =>
    exhibition ? (matchMedia("(min-width: 800px)").matches ? 5 : 2) : 3,
  );
  useEffect(() => {
    if (!exhibition) return;
    const media = matchMedia("(min-width: 800px)");
    const update = () => setColumns(media.matches ? 5 : 2);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [exhibition]);
  const visible = planets.slice(0, 40);
  const layout = useMemo(
    () =>
      cloudUniverseLayout(
        visible.map((p) => ({ id: p.id, motion: p.document.motion })),
        columns,
      ),
    [planets, columns],
  );
  const scene = useRef<HTMLDivElement>(null),
    nodes = useRef(new Map<string, HTMLButtonElement>());
  const elapsed = useRef(
    new Map<string, { config: string; seconds: number }>(),
  );
  useEffect(() => {
    const box = scene.current;
    if (!box) return;
    let frame = 0,
      previous = 0,
      inView = true;
    const size = { width: box.clientWidth, height: box.clientHeight };
    const observer = new ResizeObserver(([entry]) => {
      size.width = entry.contentRect.width;
      size.height = entry.contentRect.height;
    });
    observer.observe(box);
    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
    });
    visibility.observe(box);
    const update = (now: number) => {
      const dt = previous
        ? Math.min(0.1, Math.max(0, (now - previous) / 1000))
        : 0;
      previous = now;
      if (!inView || document.hidden) {
        frame = requestAnimationFrame(update);
        return;
      }
      const scale = Math.min(
        Math.max(1, size.width - 80) / layout.width,
        Math.max(1, size.height - 80) / layout.height,
      );
      for (const entry of layout.entries) {
        const node = nodes.current.get(entry.id);
        if (!node) continue;
        const config = JSON.stringify(entry.orbit);
        let clock = elapsed.current.get(entry.id);
        if (!clock || clock.config !== config) {
          clock = { config, seconds: 0 };
          elapsed.current.set(entry.id, clock);
        }
        if (!paused && !reduced && !document.hidden)
          clock.seconds += dt * (teacher ? rate : 1);
        const point = orbitPosition(entry.orbit, reduced ? 0 : clock.seconds);
        const x = (size.width - layout.width * scale) / 2 + point.x * scale;
        const y = (size.height - layout.height * scale) / 2 + point.y * scale;
        node.classList.toggle("compact", scale < 0.16);
        node.style.opacity = "1";
        node.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
        node.style.setProperty(
          "--orb-size",
          `${Math.max(exhibition ? 48 : 32, Math.min(exhibition ? 120 : 100, scale * (exhibition ? 400 : 200)))}px`,
        );
        node.dataset.x = x.toFixed(2);
        node.dataset.y = y.toFixed(2);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
    };
  }, [layout, paused, reduced, rate, teacher]);
  return (
    <section
      className="cloud-universe"
      aria-label={exhibition ? "比赛演示宇宙" : "真实班级宇宙"}
    >
      <div className="cloud-universe-heading">
        <div>
          <p className="eyebrow">COLORVERSE · OUR CLASS</p>
          <h2>一颗星球，一个色彩世界</h2>
          <p className="muted">
            {exhibition
              ? "演示星球 · 点击欣赏作品 · 星球运行、光晕与轨迹可直接观看"
              : "班级真实星球 · 点击进入作品空间 · 运行和光晕来自已保存设置"}
          </p>
        </div>
        <div className="row-buttons">
          <button onClick={() => setGuides((v) => !v)} aria-pressed={guides}>
            {guides ? "收起班级轨迹" : "显示班级轨迹"}
          </button>
          <button disabled={reduced} onClick={() => setPaused((v) => !v)}>
            {paused ? "继续班级运行" : "暂停班级运行"}
          </button>
          {teacher && (
            <button
              aria-pressed={rate === 3}
              onClick={() => setRate((v) => (v === 1 ? 3 : 1))}
            >
              {rate === 3 ? "恢复正常演示节奏" : "演示加速 ×3"}
            </button>
          )}
        </div>
      </div>
      <div
        className="cloud-universe-scene"
        ref={scene}
        style={{
          backgroundImage: `linear-gradient(#07132144,#07132188),url(${background})`,
        }}
      >
        {guides && (
          <svg
            className="cloud-universe-paths"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            {layout.entries.map((entry) => (
              <path
                key={entry.id}
                d={orbitPath(entry.orbit)
                  .map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`)
                  .join(" ")}
              />
            ))}
          </svg>
        )}
        <div className="cloud-universe-sun" aria-hidden="true" />
        <div className="cloud-universe-hole" aria-hidden="true" />
        {visible.map((p) => (
          <button
            key={p.id}
            ref={(node) => {
              if (node) nodes.current.set(p.id, node);
              else nodes.current.delete(p.id);
            }}
            className={`cloud-universe-node ${p.owner_enrollment_id === actorId ? "own" : ""}`}
            data-planet-id={p.id}
            data-mode={p.document.motion.mode}
            aria-label={`进入班级星球：${p.display_name}`}
            aria-pressed={selectedId === p.id}
            disabled={disabled}
            onClick={() => onSelect(p.id)}
          >
            <CloudPlanetOrb
              classId={classId}
              id={p.id}
              document={p.document}
              previewImage={p.previewImage}
            />
            <strong>{p.document.metadata.name}</strong>
            <small>
              {p.display_name} ·{" "}
              {p.sample
                ? "默认风格样本"
                : `${p.works.filter((w) => !w.withdrawn).length} 件作品`}
            </small>
            <span>
              {motionNames[p.document.motion.mode]}
              {p.owner_enrollment_id === actorId ? " · 我的星球" : ""}
            </span>
          </button>
        ))}
        <span className="cloud-universe-status">
          {reduced
            ? "系统已减少动画 · 轨迹保留静态展示"
            : paused
              ? "运行已暂停"
              : teacher && rate === 3
                ? "演示加速 ×3 · 不改变任何保存设置"
                : exhibition
                  ? "按演示星球预置的速度运行"
                  : "按各星球已保存的速度运行"}
        </span>
      </div>
      {planets.length > 40 && (
        <p className="muted">
          画面展示前 40 颗星球，所有同学可从下方列表进入。
        </p>
      )}
    </section>
  );
}
