import type { PlanetDocument, UniverseDocument } from "@colorverse/contracts";
import type { AssetStore } from "@colorverse/application";
import { SceneCanvas } from "../../app/SceneCanvas";
import { useEffect, useRef, useState } from "react";
import {
  cameraAt,
  PLANET_FOCUS_ZOOM,
  overviewCamera,
  canMovePlanet,
  zoomAt,
  type LayoutActor,
} from "@colorverse/domain";
import type { PlanetMove } from "@colorverse/application";
import type { PlanetMotion } from "@colorverse/contracts";
import { MotionControls } from "./MotionControls";
export type UniverseViewMode = "overview" | "local" | "focus" | "free";
interface Props {
  workspace: AssetStore;
  view: { planets: PlanetDocument[]; universe: UniverseDocument | null };
  camera: { x: number; y: number; zoom: number };
  viewMode: UniverseViewMode;
  setViewMode: (mode: UniverseViewMode) => void;
  activeId: string | null;
  motionPaused: boolean;
  setMotionPaused: (paused: boolean) => void;
  actor: LayoutActor;
  ownership: Record<string, string>;
  setLayoutRole: (role: LayoutActor["role"]) => void;
  onPlanetMove: (move: Omit<PlanetMove, "universeId">) => Promise<void>;
  onMoveDenied: () => void;
  onSaveMotion: (
    planetId: string,
    motion: PlanetMotion,
    revision: number,
    position: { x: number; y: number },
  ) => Promise<void>;
  inspection: PlanetDocument | undefined;
  visible: PlanetDocument[];
  filtered: PlanetDocument[];
  query: string;
  family: string;
  emotion: string;
  setQuery: (v: string) => void;
  setFamily: (v: string) => void;
  setEmotion: (v: string) => void;
  setCamera: (v: { x: number; y: number; zoom: number }) => void;
  setHover: (v: string | null) => void;
  setActiveId: (v: string) => void;
  open: (id: string, to: "studio" | "room") => Promise<void>;
  action: (fn: () => Promise<void>) => Promise<void>;
}

export function UniverseView({
  workspace,
  view,
  camera,
  viewMode,
  setViewMode,
  activeId,
  motionPaused,
  setMotionPaused,
  actor,
  ownership,
  setLayoutRole,
  onPlanetMove,
  onMoveDenied,
  onSaveMotion,
  inspection,
  visible,
  filtered,
  query,
  family,
  emotion,
  setQuery,
  setFamily,
  setEmotion,
  setCamera,
  setHover,
  setActiveId,
  open,
  action,
}: Props) {
  const main = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState({ width: 1600, height: 900 });
  const [areaSelection, setAreaSelection] = useState(false);
  const [showOrbitGuides, setShowOrbitGuides] = useState(false);
  const [motionOpen, setMotionOpen] = useState(false);
  const positionReader = useRef<
    ((id: string) => { x: number; y: number } | null) | null
  >(null);
  useEffect(() => {
    const element = main.current!;
    const observer = new ResizeObserver(() =>
      setViewport({ width: element.clientWidth, height: element.clientHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const entries = view.universe?.entries;
  const seed = view.universe?.layout.seed ?? 42;
  useEffect(() => {
    if (viewMode === "overview" && entries)
      setCamera(overviewCamera(entries, seed, viewport));
  }, [viewMode, entries, seed, viewport, setCamera]);
  useEffect(() => {
    if (
      viewMode === "focus" &&
      entries &&
      !entries.some((e) => e.planetId === activeId)
    )
      setViewMode("overview");
  }, [viewMode, entries, activeId, setViewMode]);
  const fallback =
    filtered.find((p) => p.planetId === inspection?.planetId) ?? filtered[0];
  const spotlight =
    (viewMode === "focus"
      ? filtered.find((p) => p.planetId === activeId)
      : fallback) ?? fallback;
  const focus = (id: string) => {
    const entry = entries?.find((e) => e.planetId === id);
    if (!entry) return;
    setActiveId(id);
    setHover(null);
    setViewMode("focus");
    setCamera(cameraAt(entry.position, PLANET_FOCUS_ZOOM));
  };
  const overview = () => {
    setViewMode("overview");
    if (entries) setCamera(overviewCamera(entries, seed, viewport));
  };
  const local = () => {
    const entry = entries?.find((e) => e.planetId === spotlight?.planetId);
    setViewMode("local");
    setCamera(cameraAt(entry?.position ?? { x: 800, y: 450 }, 0.85));
  };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <main
      className="universe-main"
      ref={main}
      data-view-mode={viewMode}
      data-motion={motionPaused || reducedMotion ? "paused" : "running"}
    >
      <div className="cosmic-backdrop" aria-hidden="true">
        <div className="cosmic-vignette" />
      </div>
      <SceneCanvas
        assets={workspace}
        planets={view.planets}
        universe={view.universe!}
        camera={camera}
        motionPaused={motionPaused}
        showOrbitGuides={showOrbitGuides}
        positionReader={positionReader}
        movablePlanetIds={filtered
          .filter((p) => canMovePlanet(actor, ownership[p.planetId] ?? null))
          .map((p) => p.planetId)}
        areaSelection={areaSelection}
        focusId={
          viewMode === "focus" && filtered.some((p) => p.planetId === activeId)
            ? activeId
            : null
        }
        options={{
          onSelect: (id) => {
            if (viewMode === "focus" && activeId === id)
              void action(async () => open(id, "room"));
            else focus(id);
          },
          onHover: setHover,
          onPlanetMove,
          onMoveDenied,
          onAreaCancel: () => setAreaSelection(false),
          onAreaFocus: (next) => {
            setAreaSelection(false);
            setViewMode("free");
            setCamera(next);
          },
          onCamera: (next) => {
            setViewMode("free");
            setCamera(next);
          },
        }}
      />
      <div className="universe-intro">
        <p className="eyebrow">COLORVERSE · OBSERVATORY</p>
        <h1>
          设计色彩 · <span>班级宇宙</span>
        </h1>
        <p className="intro-copy">聚集，散落，相遇。每颗星球都有自己的旅程。</p>
        <div className="universe-stats">
          <div>
            <strong>{visible.length.toString().padStart(2, "0")}</strong>
            <span>颗创作星球 · 开放探索</span>
          </div>
        </div>
      </div>
      <div className="universe-identity">
        <select
          aria-label="宇宙操作身份"
          value={actor.role}
          onChange={(e) => setLayoutRole(e.target.value as LayoutActor["role"])}
        >
          <option value="student">学生 · 本地演示</option>
          <option value="teacher">教师 · 本地演示</option>
        </select>
        <span>
          {actor.role === "teacher" ? "可以拖拽全部星球" : "只可拖拽我的星球"}
        </span>
        {actor.role === "student" && (
          <button
            className="my-planet"
            onClick={() => {
              const own = visible.find(
                (p) => ownership[p.planetId] === actor.userId,
              );
              if (own) {
                setQuery("");
                setFamily("all");
                setEmotion("");
                setActiveId(own.planetId);
                setViewMode("focus");
              }
            }}
          >
            定位我的星球 ↗
          </button>
        )}
      </div>
      <div className="universe-view-controls" aria-label="宇宙视角">
        <button
          className="motion-toggle"
          aria-pressed={showOrbitGuides}
          onClick={() => setShowOrbitGuides(!showOrbitGuides)}
        >
          {showOrbitGuides ? "隐藏运行轨迹" : "显示运行轨迹"}
        </button>
        <div className="view-switch">
          <button aria-pressed={viewMode === "overview"} onClick={overview}>
            宇宙全景
          </button>
          <button aria-pressed={viewMode === "local"} onClick={local}>
            局部探索
          </button>
          <button
            aria-pressed={viewMode === "focus"}
            disabled={!spotlight}
            onClick={() => spotlight && focus(spotlight.planetId)}
          >
            聚焦星球
          </button>
        </div>
        <button
          className="motion-toggle"
          aria-pressed={motionPaused || reducedMotion}
          disabled={reducedMotion}
          title={reducedMotion ? "系统已设置减少动态效果" : undefined}
          onClick={() => setMotionPaused(!motionPaused)}
        >
          {motionPaused || reducedMotion ? "继续运行" : "暂停运行"}
        </button>
      </div>
      {(viewMode === "focus" || viewMode === "local") && (
        <aside className={`planet-peek ${motionOpen ? "motion-expanded" : ""}`}>
          {spotlight && (
            <>
              <p className="eyebrow">
                PLANET SPOTLIGHT <span>✦</span>
              </p>
              <h2>{spotlight.metadata.name}</h2>
              <p className="muted">{spotlight.metadata.authorDisplayName}</p>
              <p>{spotlight.metadata.theme}</p>
              <div className="palette">
                {Object.values(spotlight.metadata.palette).map((c) => (
                  <span key={c} style={{ background: c }} title={c} />
                ))}
              </div>
              <div className="tags">
                {spotlight.metadata.emotionTags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <button
                className="outline"
                aria-expanded={motionOpen}
                onClick={() => setMotionOpen(!motionOpen)}
              >
                {" "}
                {motionOpen ? "收起运动设置" : "星球运动设置"}{" "}
              </button>
              {motionOpen &&
                entries
                  ?.filter((e) => e.planetId === spotlight.planetId)
                  .map((entry) => (
                    <MotionControls
                      key={`${entry.planetId}-${entry.layoutRevision ?? 0}`}
                      entry={entry}
                      canEdit={canMovePlanet(
                        actor,
                        ownership[entry.planetId] ?? null,
                      )}
                      onSave={(motion, revision) =>
                        onSaveMotion(
                          entry.planetId,
                          motion,
                          revision,
                          positionReader.current?.(entry.planetId) ??
                            entry.position,
                        )
                      }
                    />
                  ))}
              <button
                className="outline"
                onClick={() =>
                  void action(async () => open(spotlight.planetId, "room"))
                }
              >
                进入星球内部 <span>↗</span>
              </button>
            </>
          )}
        </aside>
      )}
      <div className="universe-toolbar">
        <div className="search">
          <span>⌕</span>
          <input
            aria-label="搜索星球"
            placeholder="搜索星球、作者或情绪…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-chips">
          {[
            ["all", "所有色彩"],
            ["warm", "暖色"],
            ["green", "绿色"],
            ["cool", "冷色"],
            ["neutral", "中性色"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={family === value ? "selected" : ""}
              onClick={() => setFamily(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="筛选情绪"
          value={emotion}
          onChange={(e) => setEmotion(e.target.value)}
        >
          <option value="">所有情绪</option>
          {[...new Set(visible.flatMap((p) => p.metadata.emotionTags))].map(
            (t) => (
              <option key={t}>{t}</option>
            ),
          )}
        </select>
        <button
          className="icon-btn"
          aria-label="重置宇宙视角"
          onClick={overview}
        >
          ⊙
        </button>
      </div>
      <div className="universe-navigation" aria-label="空间导航">
        <button
          aria-label="放大宇宙"
          onClick={() => {
            setViewMode("free");
            setCamera(
              zoomAt(
                camera,
                {
                  x: 800 - camera.x / camera.zoom,
                  y: 450 - camera.y / camera.zoom,
                },
                camera.zoom * 1.4,
              ),
            );
          }}
        >
          ＋
        </button>
        <span>{Math.round(camera.zoom * 100)}%</span>
        <button
          aria-label="缩小宇宙"
          onClick={() => {
            setViewMode("free");
            setCamera(
              zoomAt(
                camera,
                {
                  x: 800 - camera.x / camera.zoom,
                  y: 450 - camera.y / camera.zoom,
                },
                camera.zoom / 1.4,
              ),
            );
          }}
        >
          −
        </button>
        <button
          aria-pressed={areaSelection}
          onClick={() => setAreaSelection(!areaSelection)}
        >
          框选区域
        </button>
      </div>
      <div className="universe-bottom">
        <span>
          {areaSelection
            ? "拖出一个矩形聚焦区域 · Esc 取消"
            : viewMode === "focus"
              ? "再次点击聚焦的星球进入内部 · 拖动空白移动视野 · 滚轮缩放"
              : "点击星球聚焦，再次点击进入 · 滚轮缩放 · 双击空白聚焦 · Shift拖动框选"}
        </span>
        <span>
          {filtered.length} / {visible.length} PLANETS
        </span>
      </div>
      <div className="planet-directory" aria-label="星球作品列表">
        {filtered.map((p) => (
          <button
            key={p.planetId}
            aria-label={p.metadata.name}
            aria-description={
              ownership[p.planetId] === actor.userId
                ? "我的星球，可以拖拽"
                : "其他同学的星球"
            }
            onFocus={() => setActiveId(p.planetId)}
            onMouseEnter={() => setHover(p.planetId)}
            onMouseLeave={() => setHover(null)}
            aria-pressed={viewMode === "focus" && activeId === p.planetId}
            onClick={() => focus(p.planetId)}
          >
            <span style={{ background: p.metadata.palette.primary }} />
            {p.metadata.name}
            {ownership[p.planetId] === actor.userId && <small>我的</small>}
          </button>
        ))}
        {!filtered.length && (
          <button
            onClick={() => {
              setQuery("");
              setEmotion("");
              setFamily("all");
            }}
          >
            没有符合筛选的星球 · 清空筛选
          </button>
        )}
      </div>
    </main>
  );
}
