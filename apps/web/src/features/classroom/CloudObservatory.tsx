import { useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import type { AssetStore } from "@colorverse/application";
import { fixturePlanet, fixtureUniverse } from "@colorverse/fixtures";
import { CloudPlanetDocumentSchema } from "@colorverse/contracts";
import {
  cameraAt,
  overviewCamera,
  zoomAt,
  createDecoration,
  orbitPosition,
  planetOrbit,
  PLANET_FOCUS_ZOOM,
} from "@colorverse/domain";
import { SceneCanvas } from "../../app/SceneCanvas";
import { classroomRequest } from "./cloud-request";
import { presentationName } from "./presentation-name";

export type ObservatoryPlanet = {
  id: string;
  display_name: string;
  document: z.infer<typeof CloudPlanetDocumentSchema>;
  previewImage?: string;
  sample?: boolean;
  works: { withdrawn?: boolean }[];
};

/** A presentation adapter only: it never imports cloud documents into local IndexedDB. */
export function CloudObservatory({
  classId,
  planets: suppliedPlanets,
  onEnter,
  selectedId,
  ownId,
  focusRequest,
  movablePlanetIds = [],
  onPlanetMove,
}: {
  classId: string;
  planets: ObservatoryPlanet[];
  selectedId?: string;
  ownId?: string;
  focusRequest?: { id: string; sequence: number };
  movablePlanetIds?: string[];
  onPlanetMove?: (
    id: string,
    position: { x: number; y: number },
    revision: number,
  ) => Promise<void>;
  onEnter: (id: string) => void;
}) {
  // Callers may rebuild the array for a toast or other unrelated UI update.
  // Keep the asset adapter (and active pointer capture) until scene data changes.
  const sourceSignature = JSON.stringify(suppliedPlanets);
  const planets = useMemo(() => suppliedPlanets, [sourceSignature]);
  const host = useRef<HTMLElement>(null);
  const labels = useRef(new Map<string, HTMLDivElement>());
  const positions = useRef<
    ((id: string) => { x: number; y: number } | null) | null
  >(null);
  const consumedFocusRequest = useRef<typeof focusRequest>(undefined);
  const [viewport, setViewport] = useState({ width: 1600, height: 900 });
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 0.18 });
  const [mode, setMode] = useState("overview"),
    [selected, setSelected] = useState(selectedId ?? "");
  const [paused, setPaused] = useState(false),
    [guides, setGuides] = useState(false);
  const [moveNotice, setMoveNotice] = useState("");
  useEffect(() => {
    if (!moveNotice) return;
    const timer = setTimeout(() => setMoveNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [moveNotice]);
  const [query, setQuery] = useState(""),
    [imageErrors, setImageErrors] = useState(0),
    [retry, setRetry] = useState(0);
  const [showIdentities, setShowIdentities] = useState(() => {
    try {
      return localStorage.getItem("colorverse-show-identities") === "true";
    } catch {
      return false;
    }
  });
  const [previews, setPreviews] = useState<
    { planetId: string; mediaId: string; image: string }[] | null
  >(null);
  useEffect(() => {
    let active = true;
    fetch(
      `${import.meta.env.BASE_URL}competition/cloud-exterior-previews.json`,
      { signal: AbortSignal.timeout(5000) },
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((v) => {
        if (active && Array.isArray(v))
          setPreviews(
            v.filter(
              (p) =>
                typeof p.planetId === "string" &&
                typeof p.mediaId === "string" &&
                /^case-[1-5]-exterior\.webp$/.test(p.image),
            ),
          );
      })
      .catch(() => {
        if (active) setPreviews([]);
      });
    return () => {
      active = false;
    };
  }, []);
  const visible = useMemo(
    () =>
      planets
        .filter((p) =>
          `${p.display_name} ${p.document.metadata.name}`.includes(
            query.trim(),
          ),
        )
        .map((p) => ({ ...p, display_name: presentationName(p.display_name) })),
    [planets, query],
  );
  const projection = useMemo(() => {
    const sources = new Map<
      string,
      { url: string; fallback: string; private: boolean }
    >();
    const documents = visible.map((p) => {
      const i = planets.findIndex((source) => source.id === p.id);
      const doc = fixturePlanet(i);
      doc.planetId = p.id;
      doc.revision = p.document.revision + retry;
      doc.metadata = {
        ...doc.metadata,
        name: p.document.metadata.name,
        authorDisplayName: p.display_name,
        description: p.document.metadata.summary,
        theme: p.sample ? "默认风格样本" : "课堂作品空间",
        emotionTags: p.document.learningIntent?.intendedMoods ?? [],
        palette: {
          primary: p.document.color,
          secondary: p.document.color,
          accent: "#E4EBCB",
        },
      };
      const body = doc.exterior.scene.layers[0];
      body.animation = [];
      body.adjustments.brightness = p.document.brightness;
      body.adjustments.saturation = p.document.saturation;
      doc.exterior.scene.layers = [body];
      if (p.document.halo !== "none") {
        const halo = createDecoration(
          p.document.halo === "ring" ? "ring" : "outer-glow",
          doc.exterior.scene,
          p.document.color,
          `${body.id}-halo`,
          i + 1,
        );
        halo.opacity = p.document.haloIntensity;
        doc.exterior.scene.layers.push(halo);
      }
      if (p.document.atmosphere !== "none")
        doc.exterior.scene.layers.push(
          createDecoration(
            p.document.atmosphere,
            doc.exterior.scene,
            p.document.color,
            `${body.id}-particles`,
            i + 1,
          ),
        );
      // Only previously authorized exhibition art with the exact current media version uses a public preview.
      const approved =
        !p.document.useDefaultExterior &&
        previews?.find(
          (v) =>
            v.planetId === p.id && v.mediaId === p.document.media.exterior?.id,
        );
      const preview =
        p.previewImage ??
        (approved
          ? `${import.meta.env.BASE_URL}competition/${approved.image}`
          : undefined);
      const record = doc.assetRefs[0],
        path = `cloud-orb:${p.id}:${p.document.media.exterior?.id ?? p.document.skin}:${retry}`;
      record.original.path = path;
      sources.set(path, {
        url:
          preview ??
          (p.document.media.exterior && !p.document.useDefaultExterior
            ? `classes/${classId}/planets/${p.id}/exterior`
            : `${import.meta.env.BASE_URL}demo/v2/body-${p.document.skin}.webp`),
        fallback: `${import.meta.env.BASE_URL}demo/v2/body-${p.document.skin}.webp`,
        private:
          !preview &&
          Boolean(p.document.media.exterior) &&
          !p.document.useDefaultExterior,
      });
      doc.assetRefs = [record];
      doc.archiveEntries = [];
      doc.growthEvents = [];
      return doc;
    });
    const universe = fixtureUniverse(documents);
    universe.universeId = classId;
    universe.entries = documents.map((p, visibleIndex) => {
      const i = planets.findIndex((source) => source.id === p.planetId);
      return {
        planetId: p.planetId,
        visible: true,
        scale: 1,
        order: i,
        layoutRevision: visible[visibleIndex].document.revision,
        position: visible[visibleIndex].document.position ?? {
          x:
            800 +
            [-2300, 900, 2700, -900, 1500, -2800, 0, 3200, -3500, 3500][i % 10],
          y:
            450 +
            [-1100, -1400, -700, 200, 500, 1100, 1600, 1400, -200, -1600][
              i % 10
            ] +
            Math.floor(i / 10) * 2600,
        },
        motion: visible[visibleIndex].document.motion,
      };
    });
    const cache = new Map<string, Promise<Blob>>();
    const read = (path: string) => {
      if (!cache.has(path))
        cache.set(
          path,
          (async () => {
            const source = sources.get(path);
            if (!source) throw new Error("未知星球图片");
            try {
              const response = source.private
                ? await classroomRequest(source.url, {
                    signal: AbortSignal.timeout(25000),
                  })
                : await fetch(source.url, {
                    signal: AbortSignal.timeout(15000),
                  });
              if (!response.ok) throw new Error("图片暂不可用");
              const blob = await response.blob();
              const decoded = await createImageBitmap(blob);
              decoded.close();
              return blob;
            } catch {
              setImageErrors((n) => n + 1);
              try {
                const fallback = await fetch(source.fallback, {
                  signal: AbortSignal.timeout(8000),
                });
                if (!fallback.ok) throw new Error("默认图片暂不可用");
                const blob = await fallback.blob();
                const decoded = await createImageBitmap(blob);
                decoded.close();
                return blob;
              } catch {
                return new Blob(
                  [
                    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><radialGradient id="g" cx="35%" cy="30%"><stop stop-color="#b3d9df"/><stop offset=".5" stop-color="#416a89"/><stop offset="1" stop-color="#102030"/></radialGradient></defs><circle cx="256" cy="256" r="250" fill="url(#g)"/></svg>',
                  ],
                  { type: "image/svg+xml" },
                );
              }
            }
          })(),
        );
      return cache.get(path)!;
    };
    const assets: AssetStore = {
      read,
      resolve: (record) => read(record.original.path),
      put: async () => {
        throw new Error("请在编辑我的星球中保存");
      },
    };
    return { documents, universe, assets };
  }, [visible, planets, classId, retry, previews]);
  useEffect(() => {
    if (!previews) return;
    void Promise.allSettled(
      projection.documents.map((p) =>
        projection.assets.resolve(p.assetRefs[0], "thumbnail"),
      ),
    );
  }, [projection, previews]);
  useEffect(() => {
    const observer = new ResizeObserver(([e]) =>
      setViewport({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (mode === "overview") {
      const view = overviewCamera(projection.universe.entries, 42, viewport),
        zoom = Math.min(view.zoom, 0.11);
      setCamera({
        ...view,
        x: (view.x * zoom) / view.zoom,
        y: (view.y * zoom) / view.zoom,
        zoom,
      });
    }
  }, [projection, viewport, mode]);
  useEffect(() => {
    let frame = 0,
      last = 0;
    const update = (now: number) => {
      frame = requestAnimationFrame(update);
      if (now - last < 32 || document.hidden) return;
      last = now;
      const canvas = host.current?.querySelector("canvas");
      if (!canvas?.dataset.camera) return;
      const camera = JSON.parse(canvas.dataset.camera),
        w = canvas.clientWidth,
        h = canvas.clientHeight,
        scale = Math.min(w / 1600, h / 900);
      for (const p of visible) {
        const label = labels.current.get(p.id),
          point = positions.current?.(p.id);
        if (!label) continue;
        label.hidden = !point || camera.zoom < 0.1;
        if (!point) continue;
        label.style.transform = `translate(${(w - 1600 * scale * camera.zoom) / 2 + camera.x * scale + point.x * scale * camera.zoom}px,${(h - 900 * scale * camera.zoom) / 2 + camera.y * scale + point.y * scale * camera.zoom + 256 * 0.9 * scale * camera.zoom + 12}px) translateX(-50%)`;
      }
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [projection, visible]);
  const focus = (id: string) => {
    const entry = projection.universe.entries.find((e) => e.planetId === id);
    if (!entry) return;
    setSelected(id);
    setMode("focus");
    setCamera(
      cameraAt(
        positions.current?.(id) ?? orbitPosition(planetOrbit(entry, 42), 0),
        PLANET_FOCUS_ZOOM,
      ),
    );
  };
  useEffect(() => {
    if (!focusRequest) return;
    if (
      consumedFocusRequest.current?.id === focusRequest.id &&
      consumedFocusRequest.current.sequence === focusRequest.sequence
    )
      return;
    const timer = window.setInterval(() => {
      if (positions.current?.(focusRequest.id)) {
        consumedFocusRequest.current = focusRequest;
        focus(focusRequest.id);
        clearInterval(timer);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [focusRequest?.id, focusRequest?.sequence, projection]);
  const doubleSelect = (id: string) => {
    if (mode === "focus" && selected === id) onEnter(id);
    else focus(id);
  };
  const current = visible.find((p) => p.id === selected);
  return (
    <section
      ref={host}
      className="universe-main cloud-observatory"
      aria-label="云端大宇宙"
      data-view-mode={mode}
    >
      {previews && (
        <SceneCanvas
          assets={projection.assets}
          planets={projection.documents}
          universe={projection.universe}
          camera={camera}
          positionReader={positions}
          motionPaused={paused}
          showOrbitGuides={guides}
          focusId={mode === "focus" ? selected : null}
          movablePlanetIds={onPlanetMove ? movablePlanetIds : []}
          options={{
            onSelect: setSelected,
            onDoubleSelect: doubleSelect,
            onMoveDenied: () => setMoveNotice("只能拖动自己有权编辑的星球。"),
            onPlanetMove: async (move) => {
              setMoveNotice("");
              try {
                if (!onPlanetMove) throw Error("请先登录后移动自己的星球。");
                await onPlanetMove(
                  move.planetId,
                  move.position,
                  move.expectedLayoutRevision,
                );
              } catch (e) {
                setMoveNotice(
                  e instanceof Error
                    ? e.message
                    : "位置未能保存，已恢复原位置。",
                );
                throw e;
              }
            },
            onCamera: (c) => {
              setMode("free");
              setCamera(c);
            },
          }}
        />
      )}
      <div className="observatory-labels" aria-hidden="true">
        {visible.map((p) => (
          <div
            key={p.id}
            hidden
            ref={(node) => {
              if (node) labels.current.set(p.id, node);
              else labels.current.delete(p.id);
            }}
          >
            <strong>{p.document.metadata.name}</strong>
            {showIdentities && <small>{p.display_name}</small>}
          </div>
        ))}
      </div>
      {mode === "overview" && (
        <div className="distant-planets" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <img
              key={i}
              src={`${import.meta.env.BASE_URL}demo/v2/body-${i % 6}.webp`}
              alt=""
              style={{
                left: `${4 + ((i * 29) % 91)}%`,
                top: `${10 + ((i * 23) % 74)}%`,
                width: 18 + (i % 4) * 7,
                height: 18 + (i % 4) * 7,
              }}
            />
          ))}
        </div>
      )}
      <div className="universe-intro">
        <p className="eyebrow">COLORVERSE · OBSERVATORY</p>
        <h1>
          设计色彩 · <span>云端宇宙</span>
        </h1>
        <p className="intro-copy">在不同的色彩世界中，发现彼此的作品。</p>
        <p className="muted">
          {planets.length} 颗星球 · 双击聚焦，再次双击进入内部
        </p>
      </div>
      <div className="view-switcher">
        <label className="identity-switch">
          <input
            type="checkbox"
            checked={showIdentities}
            onChange={(e) => {
              setShowIdentities(e.target.checked);
              try {
                localStorage.setItem(
                  "colorverse-show-identities",
                  String(e.target.checked),
                );
              } catch {
                /* Optional presentation preference. */
              }
            }}
          />
          显示姓名与学号
        </label>
        <button onClick={() => setMode("overview")}>宇宙全景</button>
        <button disabled={!current} onClick={() => focus(selected)}>
          聚焦星球
        </button>
        <button onClick={() => setGuides((v) => !v)}>
          {guides ? "隐藏运行轨迹" : "显示运行轨迹"}
        </button>
        <button onClick={() => setPaused((v) => !v)}>
          {paused ? "继续运行" : "暂停运行"}
        </button>
      </div>
      {current && mode === "focus" && (
        <aside className="planet-peek">
          <p className="eyebrow">
            {current.id === ownId ? "MY PLANET" : "PLANET SPOTLIGHT"}
          </p>
          <h2>{current.document.metadata.name}</h2>
          {showIdentities && <p>{current.display_name}</p>}
          <p className="muted">
            {current.sample
              ? "默认风格样本"
              : `${current.works.filter((w) => !w.withdrawn).length} 件作品`}
          </p>
          <button
            onClick={() =>
              mode === "focus" ? onEnter(selected) : focus(selected)
            }
          >
            {mode === "focus" ? "进入星球内部 ↗" : "聚焦这颗星球"}
          </button>
        </aside>
      )}
      <div className="universe-navigation">
        <button
          aria-label="放大宇宙"
          onClick={() => {
            setMode("free");
            setCamera(zoomAt(camera, { x: 800, y: 450 }, camera.zoom * 1.3));
          }}
        >
          ＋
        </button>
        <output>{Math.round(camera.zoom * 100)}%</output>
        <button
          aria-label="缩小宇宙"
          onClick={() => {
            setMode("free");
            setCamera(zoomAt(camera, { x: 800, y: 450 }, camera.zoom / 1.3));
          }}
        >
          −
        </button>
      </div>
      <div className="universe-toolbar">
        <input
          aria-label="搜索云端星球"
          placeholder="搜索星球或作者…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <details>
          <summary>星球导航 · {visible.length}</summary>
          <div className="observatory-directory">
            {visible.map((p) => (
              <button
                key={p.id}
                data-planet-id={p.id}
                data-world-x={
                  orbitPosition(
                    planetOrbit(
                      projection.universe.entries.find(
                        (e) => e.planetId === p.id,
                      )!,
                      42,
                    ),
                    0,
                  ).x
                }
                data-world-y={
                  orbitPosition(
                    planetOrbit(
                      projection.universe.entries.find(
                        (e) => e.planetId === p.id,
                      )!,
                      42,
                    ),
                    0,
                  ).y
                }
                onClick={() => focus(p.id)}
                onDoubleClick={() => doubleSelect(p.id)}
              >
                {p.document.metadata.name}
                {showIdentities ? ` · ${p.display_name}` : ""}
              </button>
            ))}
          </div>
        </details>
      </div>
      {imageErrors > 0 && (
        <p className="observatory-image-notice" role="status">
          部分外貌暂用默认图，作品仍可查看。
          <button
            onClick={() => {
              setImageErrors(0);
              setRetry((n) => n + 1);
            }}
          >
            重试图片
          </button>
        </p>
      )}
      {moveNotice && (
        <p className="observatory-image-notice" role="status">
          {moveNotice}
        </p>
      )}
    </section>
  );
}
