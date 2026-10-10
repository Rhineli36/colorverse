import { renderEffect } from "./effects";
import { drawGrowth } from "./growth";
import { UniverseAtmosphere } from "./atmosphere";
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Texture,
  ColorMatrixFilter,
  BlurFilter,
  Circle,
  TilingSprite,
  Rectangle,
} from "pixi.js";
import type {
  AssetRecord,
  PlanetDocument,
  SceneDocument,
  Layer,
  UniverseDocument,
  Hotspot,
  EffectParams,
  Transform,
} from "@colorverse/contracts";
import type { AssetStore } from "@colorverse/application";
import {
  sortedLayers,
  planetFrame,
  planetAnchorTransform,
  visibleImageOpacity,
  particleCounts,
  composeDecorationTransform,
  hitTest,
  planetOrbit,
  planetDisplayScale,
  orbitPosition,
  orbitBounds,
  cameraAt,
  PLANET_FOCUS_ZOOM,
  cameraTransitionAmount,
  MAX_UNIVERSE_ZOOM,
  type Orbit,
  type UniverseEntry,
  zoomAt,
  regionCamera,
} from "@colorverse/domain";
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
export interface RendererOptions {
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
  onHotspot?: (h: Hotspot) => void;
  onCamera?: (c: Camera) => void;
  onGrowth?: (layerId: string) => void;
  onLayerSelect?: (layerId: string) => void;
  reducedMotion?: boolean;
  lowQuality?: boolean;
  onPlanetMove?: (move: {
    planetId: string;
    position: { x: number; y: number };
    expectedPosition: { x: number; y: number };
  }) => Promise<void>;
  onMoveDenied?: () => void;
  onAreaFocus?: (camera: Camera) => void;
  onAreaCancel?: () => void;
}
interface OrbitNode {
  id: string;
  node: Container;
  orbit: Orbit;
  guide: Graphics;
  entry: UniverseEntry;
  artwork?: {
    record: AssetRecord;
    layer: Layer;
    sprite: Sprite;
    display: boolean;
    loading: boolean;
  };
}
type UniverseDrag = { x: number; y: number; pointerId: number } & (
  | { kind: "pan"; camera: Camera }
  | { kind: "planet"; planet: OrbitNode; initial: { x: number; y: number } }
  | {
      kind: "region";
      start: { x: number; y: number };
      end: { x: number; y: number };
    }
  | { kind: "locked" }
);
export class SceneRenderer {
  private app = new Application();
  private stage = new Container();
  private space = new Container();
  private worldStars = new Container();
  private starTile: TilingSprite | null = null;
  private atmosphere: UniverseAtmosphere | null = null;
  private selection = new Graphics();
  private scene: SceneDocument | null = null;
  private exteriorFrame: { bodyId: string; transform: Transform } | null = null;
  private layerPreview: { id: string; transform: Transform } | null = null;
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private mode: "universe" | "scene" = "scene";
  private cache = new Map<string, Promise<Texture>>();
  private textures: Texture[] = [];
  private transientTextures: Texture[] = [];
  private pointer = { x: 0, y: 0 };
  private urls: string[] = [];
  private tickNodes: { node: Container; layer: Layer }[] = [];
  private orbitNodes: OrbitNode[] = [];
  private effectUpdates: ((seconds: number) => void)[] = [];
  private effectCount = 0;
  private particleCount = 0;
  private showOrbitGuides = false;
  private movable = new Set<string>();
  private areaSelection = false;
  private motionPaused = false;
  private focusId: string | null = null;
  private cameraTarget: Camera | null = null;
  private generation = 0;
  private disposed = false;
  private elapsed = 0;
  private drag: UniverseDrag | null = null;
  private moved = false;
  private observer: ResizeObserver | null = null;
  constructor(
    private assets: AssetStore,
    private options: RendererOptions = {},
  ) {}
  async mount(host: HTMLElement) {
    await this.app.init({
      background: "#090e19",
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(devicePixelRatio, this.options.lowQuality ? 1 : 1.5),
      autoDensity: true,
      preference: "webgl",
      width: host.clientWidth || 1000,
      height: host.clientHeight || 700,
    });
    if (this.disposed) {
      this.app.destroy(true);
      return;
    }
    host.appendChild(this.app.canvas);
    this.app.canvas.setAttribute("aria-label", "星球场景画布");
    this.atmosphere = new UniverseAtmosphere(
      this.options.lowQuality,
      this.options.reducedMotion,
    );
    this.app.stage.addChild(
      this.atmosphere.background,
      this.space,
      this.worldStars,
      this.atmosphere.world,
      this.stage,
      this.atmosphere.foreground,
      this.selection,
    );
    this.drawSpace();
    this.observer = new ResizeObserver(() => {
      this.app.renderer.resize(host.clientWidth, host.clientHeight);
      this.layout();
    });
    this.observer.observe(host);
    this.app.ticker.add((ticker) => {
      if (document.hidden) return;
      const seconds = Math.min(ticker.deltaMS, 50) / 1000;
      if (!this.motionPaused && !this.options.reducedMotion) {
        this.elapsed += seconds;
        this.animate();
        if (this.mode === "universe") {
          this.app.canvas.dataset.activeMeteors = String(
            this.atmosphere?.update(this.elapsed) ?? 0,
          );
          this.app.canvas.dataset.atmosphereTime = this.elapsed.toFixed(3);
        }
      }
      this.animateCamera(seconds);
    });
    this.app.canvas.addEventListener("pointerdown", this.pointerDown);
    this.app.canvas.addEventListener("pointermove", this.pointerMove);
    this.app.canvas.addEventListener("pointerup", this.pointerUp);
    this.app.canvas.addEventListener("pointercancel", this.cancelDrag);
    this.app.canvas.addEventListener("dblclick", this.doubleClick);
    window.addEventListener("keydown", this.keyDown);
    this.app.canvas.addEventListener("wheel", this.wheel, { passive: false });
  }
  private pointerDown = (e: PointerEvent) => {
    if (this.mode !== "universe") return;
    const start = this.worldPoint(e),
      hit = this.planetAt(start);
    const origin = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    if (e.shiftKey || this.areaSelection)
      this.drag = { ...origin, kind: "region", start, end: start };
    else if (hit)
      this.drag = this.movable.has(hit.id)
        ? {
            ...origin,
            kind: "planet",
            planet: hit,
            initial: { x: hit.node.x, y: hit.node.y },
          }
        : { ...origin, kind: "locked" };
    else this.drag = { ...origin, kind: "pan", camera: { ...this.camera } };
    this.moved = false;
    this.app.canvas.setPointerCapture(e.pointerId);
  };
  private worldPoint(e: { clientX: number; clientY: number }) {
    const rect = this.app.canvas.getBoundingClientRect();
    return this.stage.toLocal({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }
  private planetAt(point: { x: number; y: number }) {
    return [...this.orbitNodes]
      .reverse()
      .find(
        (p) =>
          Math.hypot(p.node.x - point.x, p.node.y - point.y) <
          190 * planetDisplayScale(p.entry.scale) * 0.9,
      );
  }
  private pointerMove = (e: PointerEvent) => {
    if (this.mode === "scene") {
      const rect = this.app.canvas.getBoundingClientRect();
      this.pointer = {
        x: (e.clientX - rect.left) / rect.width - 0.5,
        y: (e.clientY - rect.top) / rect.height - 0.5,
      };
      return;
    }
    if (!this.drag) return;
    const scale = Math.min(
      this.app.screen.width / 1600,
      this.app.screen.height / 900,
    );
    const dx = (e.clientX - this.drag.x) / scale,
      dy = (e.clientY - this.drag.y) / scale;
    const firstMove =
      !this.moved &&
      Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 4;
    if (firstMove) {
      this.moved = true;
      if (this.drag.kind === "locked") this.options.onMoveDenied?.();
      else this.options.onCamera?.({ ...this.camera });
    }
    if (!this.moved) return;
    if (this.drag.kind === "locked") return;
    if (this.moved) {
      this.focusId = null;
      this.cameraTarget = null;
    }
    if (this.drag.kind === "pan") {
      this.camera = {
        ...this.drag.camera,
        x: this.drag.camera.x + dx,
        y: this.drag.camera.y + dy,
      };
      this.layout();
    } else if (this.drag.kind === "planet") {
      const { planet, initial } = this.drag;
      planet.node.position.set(
        initial.x + dx / this.camera.zoom,
        initial.y + dy / this.camera.zoom,
      );
      planet.guide.position.set(
        planet.orbit.center.x + dx / this.camera.zoom,
        planet.orbit.center.y + dy / this.camera.zoom,
      );
    } else if (this.drag.kind === "region") {
      this.drag.end = this.worldPoint(e);
      const rect = this.app.canvas.getBoundingClientRect();
      this.selection
        .clear()
        .rect(
          Math.min(this.drag.x, e.clientX) - rect.left,
          Math.min(this.drag.y, e.clientY) - rect.top,
          Math.abs(e.clientX - this.drag.x),
          Math.abs(e.clientY - this.drag.y),
        )
        .fill({ color: "#A4CCDB", alpha: 0.08 })
        .stroke({ color: "#A4CCDB", alpha: 0.8, width: 1 });
    }
  };
  private pointerUp = () => {
    const drag = this.drag,
      changed = drag && this.moved;
    this.drag = null;
    this.selection.clear();
    if (!changed) return;
    if (drag.kind === "pan") this.options.onCamera?.({ ...this.camera });
    if (
      drag.kind === "region" &&
      Math.hypot(drag.end.x - drag.start.x, drag.end.y - drag.start.y) *
        this.stage.scale.x >
        12
    ) {
      const camera = regionCamera(
        {
          left: Math.min(drag.start.x, drag.end.x),
          right: Math.max(drag.start.x, drag.end.x),
          top: Math.min(drag.start.y, drag.end.y),
          bottom: Math.max(drag.start.y, drag.end.y),
        },
        this.app.screen,
      );
      this.options.onAreaFocus?.(camera);
    }
    if (drag.kind === "planet") {
      const p = drag.planet,
        original = { ...p.entry.position },
        current = orbitPosition(p.orbit, this.elapsed);
      const dx = p.node.x - current.x,
        dy = p.node.y - current.y;
      const position = { x: original.x + dx, y: original.y + dy };
      p.entry.position = position;
      p.orbit.center.x += dx;
      p.orbit.center.y += dy;
      p.guide.position.set(p.orbit.center.x, p.orbit.center.y);
      const generation = this.generation;
      void (
        this.options.onPlanetMove?.({
          planetId: p.id,
          position,
          expectedPosition: original,
        }) ?? Promise.reject()
      ).catch(() => {
        if (generation !== this.generation) return;
        p.entry.position = original;
        p.orbit.center.x -= dx;
        p.orbit.center.y -= dy;
        const restored = orbitPosition(p.orbit, this.elapsed);
        p.node.position.set(restored.x, restored.y);
        p.guide.position.set(p.orbit.center.x, p.orbit.center.y);
      });
    }
  };
  private cancelDrag = () => {
    if (this.drag?.kind === "planet") {
      const p = this.drag.planet,
        position = orbitPosition(p.orbit, this.elapsed);
      p.node.position.set(position.x, position.y);
      p.guide.position.set(p.orbit.center.x, p.orbit.center.y);
    }
    this.drag = null;
    this.moved = true;
    this.selection.clear();
  };
  private keyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      this.cancelDrag();
      this.areaSelection = false;
      this.options.onAreaCancel?.();
    }
  };
  private doubleClick = (e: MouseEvent) => {
    if (this.mode !== "universe") return;
    const point = this.worldPoint(e);
    if (this.planetAt(point)) return;
    this.options.onAreaFocus?.(
      cameraAt(point, Math.min(MAX_UNIVERSE_ZOOM, this.camera.zoom * 2.2)),
    );
  };
  private wheel = (e: WheelEvent) => {
    if (this.mode !== "universe") return;
    e.preventDefault();
    this.cancelDrag();
    this.cameraTarget = null;
    this.focusId = null;
    this.camera = zoomAt(
      this.camera,
      this.worldPoint(e),
      this.camera.zoom * Math.exp(-e.deltaY * 0.001),
    );
    this.layout();
    this.options.onCamera?.({ ...this.camera });
  };
  setCamera(camera: Camera) {
    if (
      camera.x === this.camera.x &&
      camera.y === this.camera.y &&
      camera.zoom === this.camera.zoom
    ) {
      this.cameraTarget = null;
      return;
    }
    if (this.options.reducedMotion) {
      this.camera = { ...camera };
      this.layout();
    } else this.cameraTarget = { ...camera };
  }
  setMotionPaused(paused: boolean) {
    this.motionPaused = paused;
  }
  setLayerPreview(preview: { id: string; transform: Transform } | null) {
    this.layerPreview = preview;
    for (const { node, layer } of this.tickNodes) {
      const t = preview?.id === layer.id ? preview.transform : layer.transform;
      node.position.set(t.x, t.y);
      node.scale.set(t.scaleX, t.scaleY);
      node.rotation = (t.rotationDeg * Math.PI) / 180;
    }
    this.applyAttachments();
  }
  private imageSprite(
    texture: Texture,
    layer: Layer,
    width: number,
    height: number,
    squareViewport = false,
  ) {
    const crop = "assetId" in layer.source ? layer.source.crop : undefined;
    let sampled = texture;
    if (crop) {
      sampled = new Texture({
        source: texture.source,
        frame: new Rectangle(
          texture.frame.x + crop.x * texture.frame.width,
          texture.frame.y + crop.y * texture.frame.height,
          crop.width * texture.frame.width,
          crop.height * texture.frame.height,
        ),
      });
      this.transientTextures.push(sampled);
    }
    const sprite = new Sprite(sampled);
    if (squareViewport) {
      const cover = Math.max(width / sampled.width, height / sampled.height);
      sprite.scale.set(cover);
      sprite.anchor.set(0.5);
      sprite.position.set(
        (0.5 - layer.transform.anchorX) * width,
        (0.5 - layer.transform.anchorY) * height,
      );
      return sprite;
    }
    sprite.width = width * (crop?.width ?? 1);
    sprite.height = height * (crop?.height ?? 1);
    sprite.position.set(
      ((crop?.x ?? 0) - layer.transform.anchorX) * width,
      ((crop?.y ?? 0) - layer.transform.anchorY) * height,
    );
    return sprite;
  }
  setOrbitGuides(visible: boolean) {
    this.showOrbitGuides = visible;
    for (const p of this.orbitNodes) p.guide.visible = visible;
    this.app.canvas.dataset.orbitGuides = String(visible);
  }
  setFocus(id: string | null) {
    this.focusId = id;
    delete this.app.canvas.dataset.focusedArtworkWidth;
    delete this.app.canvas.dataset.focusedArtworkVariant;
    const artwork = this.orbitNodes.find((p) => p.id === id)?.artwork;
    if (artwork?.display) {
      this.app.canvas.dataset.focusedArtworkWidth = String(
        artwork.sprite.texture.source.width,
      );
      this.app.canvas.dataset.focusedArtworkVariant = "display";
    }
    void this.upgradeFocusedArtwork();
  }
  private async upgradeFocusedArtwork() {
    const planet = this.orbitNodes.find((p) => p.id === this.focusId),
      artwork = planet?.artwork;
    if (!artwork || artwork.display || artwork.loading) return;
    artwork.loading = true;
    const generation = this.generation;
    try {
      const texture = await this.texture(artwork.record, "display");
      if (
        generation !== this.generation ||
        this.disposed ||
        this.focusId !== planet!.id ||
        artwork.sprite.destroyed
      )
        return;
      const parent = artwork.sprite.parent;
      if (!parent) return;
      const sprite = this.imageSprite(
        texture,
        artwork.layer,
        artwork.record.original.width!,
        artwork.record.original.width!,
        true,
      );
      parent.addChildAt(sprite, parent.getChildIndex(artwork.sprite));
      parent.removeChild(artwork.sprite);
      artwork.sprite.destroy();
      artwork.sprite = sprite;
      artwork.display = true;
      this.app.canvas.dataset.focusedArtworkWidth = String(texture.width);
      this.app.canvas.dataset.focusedArtworkVariant = "display";
    } catch {
      // Keep the already-rendered thumbnail if the larger local variant fails.
    } finally {
      artwork.loading = false;
    }
  }
  setMovablePlanets(ids: string[]) {
    this.movable = new Set(ids);
    if (this.drag?.kind === "planet" && !this.movable.has(this.drag.planet.id))
      this.cancelDrag();
    for (const p of this.orbitNodes)
      p.node.cursor = this.movable.has(p.id) ? "grab" : "pointer";
  }
  setAreaSelection(enabled: boolean) {
    this.areaSelection = enabled;
  }
  private drawSpace() {
    let seed = 7492;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    for (let i = 0; i < (this.options.lowQuality ? 65 : 180); i++) {
      ctx.beginPath();
      ctx.arc(
        random() * 512,
        random() * 512,
        0.3 + random() * 0.55,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = `rgba(171,206,231,${0.2 + random() * 0.6})`;
      ctx.fill();
    }
    const texture = Texture.from(canvas);
    this.textures.push(texture);
    this.starTile = new TilingSprite({ texture });
    this.starTile.tileScale.set(4);
    this.space.eventMode = "none";
    this.space.addChild(this.starTile);
  }
  private animateCamera(seconds: number) {
    const focused = this.orbitNodes.find((n) => n.id === this.focusId);
    if (focused)
      this.cameraTarget = cameraAt(
        { x: focused.node.x, y: focused.node.y },
        PLANET_FOCUS_ZOOM,
      );
    if (!this.cameraTarget) return;
    const amount = cameraTransitionAmount(
      seconds,
      !!focused,
      this.options.reducedMotion,
    );
    for (const key of ["x", "y", "zoom"] as const)
      this.camera[key] += (this.cameraTarget[key] - this.camera[key]) * amount;
    if (
      !focused &&
      Math.abs(this.camera.x - this.cameraTarget.x) +
        Math.abs(this.camera.y - this.cameraTarget.y) +
        Math.abs(this.camera.zoom - this.cameraTarget.zoom) <
        0.001
    ) {
      this.camera = { ...this.cameraTarget };
      this.cameraTarget = null;
    }
    this.layout();
  }
  private layout() {
    const w = this.scene?.width ?? 1600,
      h = this.scene?.height ?? 900,
      scale = Math.min(this.app.screen.width / w, this.app.screen.height / h);
    this.stage.scale.set(scale * this.camera.zoom);
    this.stage.position.set(
      (this.app.screen.width - w * scale * this.camera.zoom) / 2 +
        this.camera.x * scale,
      (this.app.screen.height - h * scale * this.camera.zoom) / 2 +
        this.camera.y * scale,
    );
    this.app.canvas.dataset.camera = JSON.stringify(this.camera);
    this.space.visible = this.mode === "universe";
    this.worldStars.visible = this.mode === "universe";
    this.worldStars.scale.copyFrom(this.stage.scale);
    this.worldStars.position.copyFrom(this.stage.position);
    this.app.canvas.dataset.universeAtmosphere = String(
      this.mode === "universe",
    );
    this.app.canvas.dataset.wanderingStars = String(
      this.mode === "universe" ? (this.options.lowQuality ? 8 : 24) : 0,
    );
    this.atmosphere?.layout(
      this.app.screen.width,
      this.app.screen.height,
      this.stage.scale.x,
      this.stage.x,
      this.stage.y,
      this.mode === "universe",
    );
    this.space.scale.copyFrom(this.stage.scale);
    this.space.position.copyFrom(this.stage.position);
    this.app.canvas.dataset.backgroundScale = String(this.space.scale.x);
    if (this.starTile) {
      const left = -this.stage.x / this.stage.scale.x,
        top = -this.stage.y / this.stage.scale.y;
      this.starTile.width = this.app.screen.width / this.stage.scale.x;
      this.starTile.height = this.app.screen.height / this.stage.scale.y;
      this.starTile.position.set(left, top);
      this.starTile.tilePosition.set(-left, -top);
    }
  }
  private reset() {
    delete this.app.canvas.dataset.focusedArtworkWidth;
    delete this.app.canvas.dataset.focusedArtworkVariant;
    this.exteriorFrame = null;
    this.cancelDrag();
    this.generation++;
    this.app.canvas.dataset.sceneGeneration = String(this.generation);
    this.app.canvas.dataset.sceneReady = "false";
    this.app.canvas.dataset.activeMeteors = "0";
    this.app.canvas.dataset.atmosphereTime = this.elapsed.toFixed(3);
    const clearFilters = (node: Container) => {
      node.filters?.forEach((f) => f.destroy());
      node.children.forEach(clearFilters);
    };
    for (const child of this.stage.removeChildren()) {
      clearFilters(child);
      child.destroy({ children: true });
    }
    this.transientTextures.forEach((t) =>
      t.destroy(
        !this.textures.some((original) => original.source === t.source),
      ),
    );
    for (const child of this.worldStars.removeChildren()) child.destroy();
    this.transientTextures = [];
    this.tickNodes = [];
    this.effectUpdates = [];
    this.effectCount = 0;
    this.particleCount = 0;
    this.app.canvas.dataset.effectLayers = "0";
    this.app.canvas.dataset.particleCount = "0";
    this.orbitNodes = [];
    this.cameraTarget = null;
    this.app.canvas.onclick = null;
  }
  private async texture(
    record: AssetRecord,
    variant: "display" | "thumbnail" = "display",
  ) {
    const key =
      record.variants.find((v) => v.kind === variant)?.path ??
      record.original.path;
    if (!this.cache.has(key))
      this.cache.set(
        key,
        (async () => {
          const blob = await this.assets.resolve(record, variant),
            url = URL.createObjectURL(blob);
          this.urls.push(url);
          const image = new Image();
          image.src = url;
          await image.decode();
          if (this.disposed) throw new Error("Renderer disposed");
          const t = Texture.from(image);
          this.textures.push(t);
          return t;
        })(),
      );
    return this.cache.get(key)!;
  }
  async loadUniverse(
    planets: PlanetDocument[],
    universe: UniverseDocument,
    camera: Camera,
  ) {
    this.reset();
    const version = this.generation;
    this.mode = "universe";
    this.scene = null;
    this.camera = { ...camera };
    const starfield = new Graphics();
    const bounds = universe.entries
      .filter((e) => e.visible)
      .map((e) => orbitBounds(e, universe.layout.seed));
    const left = Math.min(-1600, ...bounds.map((b) => b.left)) - 1200;
    const top = Math.min(-900, ...bounds.map((b) => b.top)) - 900;
    const right = Math.max(3200, ...bounds.map((b) => b.right)) + 1200;
    const bottom = Math.max(1800, ...bounds.map((b) => b.bottom)) + 900;
    let seed = universe.layout.seed;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 650; i++)
      starfield
        .circle(
          left + random() * (right - left),
          top + random() * (bottom - top),
          random() > 0.96 ? 2.3 : 1.2,
        )
        .fill({ color: "#BCC8D9", alpha: random() * 0.35 + 0.12 });
    this.worldStars.addChild(starfield);
    const guides = new Map<string, Graphics>();
    for (const entry of universe.entries.filter((e) => e.visible)) {
      const orbit = planetOrbit(entry, universe.layout.seed);
      const guide = new Graphics()
        .ellipse(0, 0, orbit.radiusX, orbit.radiusY)
        .stroke({ color: "#8EAABF", alpha: 0.16, width: 1.3 });
      guide.position.set(orbit.center.x, orbit.center.y);
      guide.rotation = orbit.rotation;
      guide.visible = this.showOrbitGuides;
      this.stage.addChild(guide);
      guides.set(entry.planetId, guide);
    }
    this.layout();
    const visibleIds = new Set(
      universe.entries.filter((e) => e.visible).map((e) => e.planetId),
    );
    const counts = particleCounts(
      planets
        .filter((p) => visibleIds.has(p.planetId))
        .flatMap((p) => p.exterior.scene.layers),
      this.options.lowQuality ? 300 : 1000,
      this.options.lowQuality ? 50 : 180,
    );
    for (const entry of universe.entries.filter((e) => e.visible)) {
      const p = planets.find((p) => p.planetId === entry.planetId);
      if (!p) continue;
      const body = p.exterior.scene.layers.find((l) => l.kind === "image");
      if (!body || !("assetId" in body.source)) continue;
      const assetId = body.source.assetId;
      const record = p.assetRefs.find((a) => a.assetId === assetId);
      if (!record) continue;
      const tex = await this.texture(record, "thumbnail");
      if (version !== this.generation || this.disposed) return;
      const node = new Container(),
        art = new Container(),
        images = new Container();
      let artwork: OrbitNode["artwork"];
      const frame = planetFrame(p.exterior.scene),
        factor = 512 / frame.diameter;
      const planetMask = new Graphics().circle(0, 0, 256).fill(0xffffff);
      // A quiet base surface keeps the planet visible when artwork is moved or
      // shrunk inside its fixed frame, including transparent PNGs.
      images.addChild(new Graphics().circle(0, 0, 256).fill("#26334a"));
      node.addChild(art);
      art.addChild(images, planetMask);
      images.mask = planetMask;
      for (const layer of sortedLayers(p.exterior.scene)) {
        if (!layer.visible) continue;
        if ("assetId" in layer.source) {
          const imageRecord = p.assetRefs.find(
            (a) =>
              "assetId" in layer.source && a.assetId === layer.source.assetId,
          );
          if (!imageRecord) continue;
          const imageTex =
            layer.id === body.id
              ? tex
              : await this.texture(imageRecord, "display");
          if (version !== this.generation || this.disposed) return;
          const imageNode = new Container();
          const image = this.imageSprite(
            imageTex,
            layer,
            imageRecord.original.width!,
            layer.id === body.id
              ? imageRecord.original.width!
              : imageRecord.original.height!,
            layer.id === body.id,
          );
          imageNode.addChild(image);
          if (layer.id === body.id)
            artwork = {
              record: imageRecord,
              layer,
              sprite: image,
              display: false,
              loading: false,
            };
          imageNode.position.set(
            (layer.transform.x - frame.x) * factor,
            (layer.transform.y - frame.y) * factor,
          );
          imageNode.scale.set(
            layer.transform.scaleX * factor,
            layer.transform.scaleY * factor,
          );
          imageNode.rotation = (layer.transform.rotationDeg * Math.PI) / 180;
          this.adjust(imageNode, {
            ...layer,
            opacity: visibleImageOpacity(layer.opacity, true),
          });
          images.addChild(imageNode);
          continue;
        }
        if (!("effectId" in layer.source)) continue;
        const decor = new Container(),
          source = layer.source;
        if (source.anchorLayerId === body.id && !body.visible) continue;
        this.effect(
          decor,
          source.effectId,
          source.params,
          p.exterior.scene,
          counts.get(layer.id) ?? 0,
        );
        const transform =
          source.anchorLayerId === body.id
            ? composeDecorationTransform(
                layer.transform,
                planetAnchorTransform(
                  p.exterior.scene,
                  body,
                  record.original.width!,
                ),
              )
            : layer.transform;
        decor.position.set(
          (transform.x - frame.x) * factor,
          (transform.y - frame.y) * factor,
        );
        decor.scale.set(transform.scaleX * factor, transform.scaleY * factor);
        decor.rotation = (transform.rotationDeg * Math.PI) / 180;
        this.adjust(decor, layer);
        decor.eventMode = "none";
        art.addChild(decor);
      }
      node.scale.set(planetDisplayScale(entry.scale) * 0.9);
      const orbit = planetOrbit(entry, universe.layout.seed);
      const position = orbitPosition(orbit, this.elapsed);
      node.position.set(position.x, position.y);
      node.eventMode = "static";
      node.hitArea = new Circle(0, 0, 190);
      node.cursor = this.movable.has(p.planetId) ? "grab" : "pointer";
      node.on("pointerover", () => this.options.onHover?.(p.planetId));
      node.on("pointerout", () => this.options.onHover?.(null));
      node.on("pointertap", () => {
        if (!this.moved && !this.areaSelection)
          this.options.onSelect?.(p.planetId);
      });
      this.stage.addChild(node);
      this.orbitNodes.push({
        id: p.planetId,
        node,
        orbit,
        entry: structuredClone(entry),
        artwork,
        guide: guides.get(p.planetId)!,
      });
    }
    this.app.canvas.dataset.sceneReady = "true";
    void this.upgradeFocusedArtwork();
  }
  private adjust(node: Container, layer: Layer) {
    node.alpha = layer.opacity;
    const a = layer.adjustments;
    const filter = new ColorMatrixFilter();
    filter.hue(a.hueDeg, true);
    filter.saturate(a.saturation - 1, true);
    filter.brightness(a.brightness, true);
    filter.contrast(a.contrast - 1, true);
    const temp = new ColorMatrixFilter();
    temp.matrix = [
      1 + a.temperature * 0.12,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      1 - a.temperature * 0.12,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
    ];
    if (
      Object.entries(a).some(
        ([k, v]) =>
          v !==
          (
            {
              hueDeg: 0,
              saturation: 1,
              brightness: 1,
              contrast: 1,
              temperature: 0,
            } as Record<string, number>
          )[k],
      )
    )
      node.filters = [filter, temp];
    else {
      filter.destroy();
      temp.destroy();
    }
  }
  async load(
    scene: SceneDocument,
    records: AssetRecord[],
    planetBodyId?: string,
  ) {
    this.reset();
    const generation = this.generation;
    this.mode = "scene";
    this.scene = structuredClone(scene);
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.layout();
    const background = scene.background;
    if (background.type === "image") {
      const record = records.find((a) => a.assetId === background.assetId);
      if (record) {
        const texture = await this.texture(record);
        if (generation !== this.generation) return;
        const s = new Sprite(texture),
          scale =
            background.fit === "cover"
              ? Math.max(
                  scene.width / texture.width,
                  scene.height / texture.height,
                )
              : Math.min(
                  scene.width / texture.width,
                  scene.height / texture.height,
                );
        s.scale.set(scale);
        s.anchor.set(0.5);
        s.position.set(scene.width / 2, scene.height / 2);
        this.stage.addChild(s);
      }
    } else if (background.type === "color") {
      this.stage.addChild(
        new Graphics()
          .rect(0, 0, scene.width, scene.height)
          .fill(background.color),
      );
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = scene.width;
      canvas.height = scene.height;
      const ctx = canvas.getContext("2d")!,
        angle = (background.angleDeg * Math.PI) / 180,
        cx = scene.width / 2,
        cy = scene.height / 2,
        length = Math.hypot(scene.width, scene.height) / 2,
        gradient = ctx.createLinearGradient(
          cx - Math.cos(angle) * length,
          cy - Math.sin(angle) * length,
          cx + Math.cos(angle) * length,
          cy + Math.sin(angle) * length,
        );
      background.stops.forEach((s) => gradient.addColorStop(s.offset, s.color));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const texture = Texture.from(canvas);
      this.transientTextures.push(texture);
      this.stage.addChild(new Sprite(texture));
    }
    const counts = particleCounts(
      scene.layers,
      this.options.lowQuality ? 300 : 1000,
      this.options.lowQuality ? 50 : 180,
    );
    const body = scene.layers.find((l) => l.id === planetBodyId);
    const bodyRecord =
      body && "assetId" in body.source
        ? records.find(
            (a) =>
              "assetId" in body.source && a.assetId === body.source.assetId,
          )
        : undefined;
    const bodySize = bodyRecord?.original.width ?? 512;
    const frame = planetFrame(scene);
    this.exteriorFrame = body
      ? {
          bodyId: body.id,
          transform: planetAnchorTransform(scene, body, bodySize),
        }
      : null;
    const planetMask = body
      ? new Graphics()
          .circle(frame.x, frame.y, frame.diameter / 2)
          .fill(0xffffff)
      : null;
    if (planetMask) {
      this.stage.addChild(
        new Graphics()
          .circle(frame.x, frame.y, frame.diameter / 2)
          .fill("#26334a"),
        planetMask,
      );
    }
    this.app.canvas.dataset.planetMask = String(!!planetMask);
    for (const layer of sortedLayers(scene)) {
      if (!layer.visible) continue;
      const node = new Container();
      const source = layer.source;
      if ("assetId" in source) {
        const record = records.find((a) => a.assetId === source.assetId);
        if (record) {
          const texture = await this.texture(record);
          if (generation !== this.generation) {
            node.destroy();
            return;
          }
          const s = this.imageSprite(
            texture,
            layer,
            record.original.width ?? texture.width,
            layer.id === planetBodyId
              ? (record.original.width ?? texture.width)
              : (record.original.height ?? texture.height),
            layer.id === planetBodyId,
          );
          node.addChild(s);
        }
      } else if ("effectId" in source) {
        this.effect(
          node,
          source.effectId,
          source.params,
          scene,
          counts.get(layer.id) ?? 0,
        );
      } else if (source.presetId === "sphere") {
        const g = new Graphics()
          .circle(0, 0, 175)
          .fill(source.params.color)
          .ellipse(-45, -50, 100, 90)
          .fill({ color: "#FFFFFF", alpha: source.params.light * 0.2 });
        node.addChild(g);
        if (source.params.textureAssetId) {
          const record = records.find(
            (a) => a.assetId === source.params.textureAssetId,
          );
          if (record) {
            const texture = await this.texture(record);
            if (generation !== this.generation) return;
            const s = new Sprite(texture);
            s.anchor.set(0.5);
            s.width = s.height = 350;
            const mask = new Graphics().circle(0, 0, 175).fill("#FFFFFF");
            node.addChild(s, mask);
            s.mask = mask;
          }
        }
      } else {
        const p = source.params,
          g = drawGrowth(source.presetId, p.color, p.seed);
        node.addChild(g);
        const glow = new Graphics()
          .circle(0, 0, 70)
          .fill({ color: p.color, alpha: p.glowIntensity * 0.25 });
        glow.filters = [new BlurFilter({ strength: 18, quality: 2 })];
        node.addChildAt(glow, 0);
        node.eventMode = "static";
        node.cursor = "pointer";
        node.on("pointertap", () => this.options.onGrowth?.(layer.id));
      }
      const t = layer.transform;
      node.position.set(t.x, t.y);
      node.scale.set(t.scaleX, t.scaleY);
      node.rotation = (t.rotationDeg * Math.PI) / 180;
      this.adjust(
        node,
        planetMask && layer.kind === "image"
          ? { ...layer, opacity: visibleImageOpacity(layer.opacity, true) }
          : layer,
      );
      if (planetMask && "assetId" in layer.source) node.mask = planetMask;
      node.eventMode = "static";
      node.on("pointertap", () => this.options.onLayerSelect?.(layer.id));
      this.stage.addChild(node);
      this.tickNodes.push({ node, layer });
    }
    if (generation !== this.generation) return;
    for (const h of scene.hotspots) {
      const group = new Container(),
        g = h.geometry,
        mark = new Graphics();
      mark
        .circle(g.x, g.y, g.type === "circle" ? Math.min(g.radius, 18) : 18)
        .stroke({ color: "#F1D8A2", alpha: 0.9, width: 1.5 })
        .circle(g.x, g.y, 5)
        .fill("#F1D8A2");
      if (g.type === "rect")
        mark
          .rect(g.x, g.y, g.width, g.height)
          .stroke({ color: "#F1D8A2", alpha: 0.3, width: 1 });
      group.addChild(mark);
      if (h.anchorLayerId) {
        const l = scene.layers.find((l) => l.id === h.anchorLayerId)!;
        group.position.set(l.transform.x, l.transform.y);
        group.scale.set(l.transform.scaleX, l.transform.scaleY);
        group.rotation = (l.transform.rotationDeg * Math.PI) / 180;
        this.tickNodes.push({ node: group, layer: { ...l, opacity: 1 } });
      }
      this.stage.addChild(group);
    }
    this.applyAttachments();
    this.app.canvas.onclick = (event) => {
      const rect = this.app.canvas.getBoundingClientRect(),
        local = this.stage.toLocal({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        }),
        hotspot = this.hitTest(local.x, local.y);
      if (hotspot) this.options.onHotspot?.(hotspot);
    };
    this.app.canvas.dataset.sceneReady = "true";
  }
  private effect(
    node: Container,
    id: string,
    params: EffectParams,
    scene: SceneDocument,
    count: number,
  ) {
    const update = renderEffect(
      node,
      id,
      params,
      scene,
      !!this.options.lowQuality,
      count,
    );
    if (update) this.effectUpdates.push(update);
    this.effectCount++;
    this.particleCount += count;
    this.app.canvas.dataset.effectLayers = String(this.effectCount);
    this.app.canvas.dataset.particleCount = String(this.particleCount);
  }
  private animate() {
    for (const update of this.effectUpdates) update(this.elapsed);
    for (const { node, orbit, id } of this.orbitNodes) {
      if (this.drag?.kind === "planet" && this.drag.planet.id === id) continue;
      const position = orbitPosition(orbit, this.elapsed);
      node.position.set(position.x, position.y);
    }
    for (const { node, layer } of this.tickNodes) {
      const t =
        this.layerPreview?.id === layer.id
          ? this.layerPreview.transform
          : layer.transform;
      node.scale.set(t.scaleX, t.scaleY);
      node.x = t.x;
      node.y = t.y;
      if (this.mode === "scene") {
        node.x += this.pointer.x * layer.parallaxFactor * 400;
        node.y += this.pointer.y * layer.parallaxFactor * 400;
      }
      node.alpha = visibleImageOpacity(
        layer.opacity,
        !!this.exteriorFrame && layer.kind === "image",
      );
      node.rotation = (t.rotationDeg * Math.PI) / 180;
      for (const a of layer.animation) {
        if (a.type === "float")
          node.y +=
            Math.sin((this.elapsed * 2 * Math.PI) / a.periodSec) *
            a.amplitudePx;
        if (a.type === "rotate")
          node.rotation += (this.elapsed * a.degreesPerSec * Math.PI) / 180;
        if (a.type === "breathe")
          node.alpha *=
            a.minOpacity +
            (a.maxOpacity - a.minOpacity) *
              (0.5 +
                0.5 * Math.sin((this.elapsed * 2 * Math.PI) / a.periodSec));
      }
      node.alpha = visibleImageOpacity(
        node.alpha,
        !!this.exteriorFrame && layer.kind === "image",
      );
    }
    this.applyAttachments();
  }
  private applyAttachments() {
    if (this.mode !== "scene") return;
    for (const { node, layer } of this.tickNodes) {
      if (!("effectId" in layer.source) || !layer.source.anchorLayerId)
        continue;
      const parent = this.tickNodes.find(
        (n) =>
          n.layer.id ===
          ("effectId" in layer.source ? layer.source.anchorLayerId : undefined),
      );
      if (!parent) {
        node.visible = false;
        continue;
      }
      const result = composeDecorationTransform(
        {
          ...layer.transform,
          x: node.x,
          y: node.y,
          rotationDeg: (node.rotation * 180) / Math.PI,
        },
        this.exteriorFrame?.bodyId === parent.layer.id
          ? this.exteriorFrame.transform
          : {
              ...parent.layer.transform,
              scaleX: parent.node.scale.x,
              scaleY: parent.node.scale.y,
              x: parent.node.x,
              y: parent.node.y,
              rotationDeg: (parent.node.rotation * 180) / Math.PI,
            },
      );
      node.position.set(result.x, result.y);
      node.scale.set(result.scaleX, result.scaleY);
      node.rotation = (result.rotationDeg * Math.PI) / 180;
      node.visible = parent.node.visible && parent.layer.visible;
    }
  }
  hitTest(x: number, y: number) {
    if (!this.scene) return undefined;
    const effective = structuredClone(this.scene);
    for (const l of effective.layers) {
      const rendered = this.tickNodes.find((n) => n.layer.id === l.id)?.node;
      if (rendered) {
        l.transform.x = rendered.x;
        l.transform.y = rendered.y;
        l.transform.rotationDeg = (rendered.rotation * 180) / Math.PI;
        l.transform.scaleX = rendered.scale.x;
        l.transform.scaleY = rendered.scale.y;
        l.opacity = rendered.alpha;
      }
    }
    return hitTest(effective, x, y);
  }
  async captureThumbnail() {
    return this.app.renderer.extract.base64({
      target: this.stage,
      format: "webp",
      quality: 0.8,
    });
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.observer?.disconnect();
    this.urls.forEach(URL.revokeObjectURL);
    if (this.app.renderer) {
      this.reset();
      this.app.canvas.removeEventListener("pointerdown", this.pointerDown);
      this.app.canvas.removeEventListener("pointermove", this.pointerMove);
      this.app.canvas.removeEventListener("pointerup", this.pointerUp);
      this.app.canvas.removeEventListener("pointercancel", this.cancelDrag);
      this.app.canvas.removeEventListener("dblclick", this.doubleClick);
      window.removeEventListener("keydown", this.keyDown);
      this.app.canvas.removeEventListener("wheel", this.wheel);
      this.app.destroy(true, { children: true });
      this.atmosphere?.dispose();
      this.textures.forEach((t) => {
        if (!t.destroyed) t.destroy(true);
      });
    }
    this.cache.clear();
  }
}
