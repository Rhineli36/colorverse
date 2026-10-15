import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  SceneRenderer,
  type RendererOptions,
  type Camera,
} from "@colorverse/renderer";
import type {
  PlanetDocument,
  SceneDocument,
  UniverseDocument,
  Transform,
} from "@colorverse/contracts";
import type { AssetStore } from "@colorverse/application";
export function SceneCanvas({
  assets,
  planet,
  scene,
  planets,
  universe,
  camera,
  motionPaused = false,
  showOrbitGuides = false,
  focusId = null,
  movablePlanetIds = [],
  areaSelection = false,
  options,
  layerPreview = null,
  positionReader,
  birthLayerId = null,
}: {
  assets: AssetStore;
  planet?: PlanetDocument;
  scene?: SceneDocument;
  planets?: PlanetDocument[];
  universe?: UniverseDocument;
  camera?: Camera;
  motionPaused?: boolean;
  showOrbitGuides?: boolean;
  focusId?: string | null;
  movablePlanetIds?: string[];
  areaSelection?: boolean;
  options: RendererOptions;
  birthLayerId?: string | null;
  layerPreview?: { id: string; transform: Transform } | null;
  positionReader?: MutableRefObject<
    ((id: string) => { x: number; y: number } | null) | null
  >;
}) {
  const host = useRef<HTMLDivElement>(null),
    renderer = useRef<SceneRenderer | null>(null),
    ready = useRef<Promise<void> | null>(null),
    callbacks = useRef(options);
  const currentCamera = useRef(camera);
  currentCamera.current = camera;
  callbacks.current = options;
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const r = new SceneRenderer(assets, {
      onSelect: (id) => callbacks.current.onSelect?.(id),
      onHover: (id) => callbacks.current.onHover?.(id),
      onHotspot: (h) => callbacks.current.onHotspot?.(h),
      onCamera: (c) => callbacks.current.onCamera?.(c),
      onGrowth: (id) => callbacks.current.onGrowth?.(id),
      onLayerSelect: (id) => callbacks.current.onLayerSelect?.(id),
      onPlanetMove: (move) =>
        callbacks.current.onPlanetMove?.(move) ??
        Promise.reject(new Error("布局保存不可用")),
      onMoveDenied: () => callbacks.current.onMoveDenied?.(),
      onAreaFocus: (c) => callbacks.current.onAreaFocus?.(c),
      onAreaCancel: () => callbacks.current.onAreaCancel?.(),
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    renderer.current = r;
    if (positionReader) positionReader.current = (id) => r.planetPosition(id);
    ready.current = r.mount(host.current!).catch((e) => {
      if (active && renderer.current === r) {
        // A failed mount is not a ready renderer. Deferred view updates must
        // never reach Pixi's canvas getter before its renderer exists.
        renderer.current = null;
        if (positionReader) positionReader.current = null;
        setError(e instanceof Error ? e.message : "WebGL 不可用");
      }
      r.dispose();
    });
    return () => {
      active = false;
      renderer.current = null;
      if (positionReader) positionReader.current = null;
      r.dispose();
    };
  }, [assets, positionReader]);
  useEffect(() => {
    let cancelled = false;
    void ready.current?.then(async () => {
      if (cancelled || !renderer.current) return;
      const activeRenderer = renderer.current;
      try {
        if (scene && planet) {
          await activeRenderer.load(
            scene,
            planet.assetRefs,
            scene.id === planet.exterior.scene.id
              ? scene.layers.find((l) => l.kind === "image")?.id
              : undefined,
          );
          if (!cancelled && renderer.current === activeRenderer && birthLayerId)
            activeRenderer.setBirthLayer(birthLayerId);
        } else if (universe && planets)
          await renderer.current.loadUniverse(
            planets,
            universe,
            currentCamera.current ?? { x: 0, y: 0, zoom: 1 },
          );
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "场景加载失败");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [scene, planet, planets, universe, birthLayerId]);
  useEffect(() => {
    let cancelled = false;
    void ready.current?.then(() => {
      if (!cancelled && camera) renderer.current?.setCamera(camera);
    });
    return () => {
      cancelled = true;
    };
  }, [camera]);
  useEffect(() => {
    let cancelled = false;
    void ready.current?.then(() => {
      if (!cancelled) renderer.current?.setMotionPaused(motionPaused);
    });
    return () => {
      cancelled = true;
    };
  }, [motionPaused]);
  useEffect(() => {
    renderer.current?.setLayerPreview(layerPreview);
  }, [layerPreview]);
  useEffect(() => {
    let cancelled = false;
    void ready.current?.then(() => {
      if (!cancelled) renderer.current?.setOrbitGuides(showOrbitGuides);
    });
    return () => {
      cancelled = true;
    };
  }, [showOrbitGuides]);
  useEffect(() => {
    let cancelled = false;
    void ready.current?.then(() => {
      if (!cancelled) renderer.current?.setFocus(focusId);
    });
    return () => {
      cancelled = true;
    };
  }, [focusId]);
  const movableKey = movablePlanetIds.join("|");
  useEffect(() => {
    let cancelled = false;
    void ready.current?.then(() => {
      if (!cancelled)
        renderer.current?.setMovablePlanets(
          movableKey ? movableKey.split("|") : [],
        );
    });
    return () => {
      cancelled = true;
    };
  }, [movableKey]);
  useEffect(() => {
    let cancelled = false;
    void ready.current?.then(() => {
      if (!cancelled) renderer.current?.setAreaSelection(areaSelection);
    });
    return () => {
      cancelled = true;
    };
  }, [areaSelection]);
  return (
    <div className="canvas-host" ref={host} data-testid="scene-canvas">
      {error && (
        <div className="render-error" role="alert">
          场景暂时无法渲染：{error}
          <br />
          仍可通过作品列表与档案查看内容。
        </div>
      )}
    </div>
  );
}
