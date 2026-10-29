import * as T from "three";
import { type TreeSettings, type TreePalette } from "./tree-state";
import { treeArtFragment } from "./tree-art-shader";
let created = 0,
  disposed = 0,
  active = 0;
export function treeColor(hex: string, p: TreePalette) {
  const c = new T.Color(hex),
    hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(
    hsl.h + p.hue / 360,
    Math.min(1, (hsl.s * p.saturation) / 100),
    Math.min(1, (hsl.l * p.brightness) / 100),
  );
}
const srgb = (hex: string) =>
  new T.Vector3(
    ...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
      number,
      number,
      number,
    ]),
  );
export function createTreeRenderer(
  canvas: HTMLCanvasElement,
  initial: TreeSettings,
  onCamera: (c: TreeSettings["camera"]) => void,
  onLost: (message?: string) => void,
  onReady: () => void = () => {},
) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  const id = ++created;
  active++;
  const started = performance.now();
  renderer.toneMapping = T.NoToneMapping;
  let s = structuredClone(initial),
    dead = false,
    lost = false,
    loaded = false;
  let frames = 0,
    time = 0,
    raf = 0,
    last = performance.now(),
    w = 1,
    h = 1;
  let samples: { x: number; y: number }[] = [];
  const uniforms = {
    uArt: { value: null as T.Texture | null },
    uRegions: { value: null as T.Texture | null },
    uFit: { value: new T.Vector2(1, 1) },
    uPrimary: { value: srgb(initial.palettes[0].colors[0]) },
    uAuxiliary: { value: srgb(initial.palettes[0].colors[1]) },
    uAccent: { value: srgb(initial.palettes[0].colors[2]) },
    uBark: { value: srgb(initial.palettes[0].bark) },
    uGround: { value: srgb(initial.palettes[0].ground) },
    uBackground: { value: srgb(initial.palettes[0].background) },
    uTarget: { value: srgb(initial.target) },
    uAccentArea: { value: 0.08 },
    uAuxiliaryArea: { value: 0.3 },
    uHue: { value: 0 },
    uSaturation: { value: 1 },
    uBrightness: { value: 1 },
    uTime: { value: 0 },
    uWind: { value: 0 },
    uContext: { value: 0 },
    uExtract: { value: 0 },
  };
  const material = new T.ShaderMaterial({
    uniforms,
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: treeArtFragment,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const geometry = new T.PlaneGeometry(2, 2),
    scene = new T.Scene(),
    camera = new T.Camera();
  scene.add(new T.Mesh(geometry, material));
  function draw() {
    if (dead || lost || !loaded) return;
    renderer.setScissorTest(false);
    renderer.setClearColor("#0b1118");
    renderer.clear();
    samples = [];
    const sides = s.compare ? 2 : 1;
    for (let side = 0; side < sides; side++) {
      const x = side ? Math.floor(w / 2) : 0,
        width = sides === 1 ? w : side ? w - x : Math.floor(w / 2);
      renderer.setViewport(x, 0, width, h);
      renderer.setScissor(x, 0, width, h);
      renderer.setScissorTest(true);
      const aspect = 1672 / 941,
        viewAspect = width / h;
      const fx = Math.min(1, aspect / viewAspect),
        fy = Math.min(1, viewAspect / aspect);
      uniforms.uFit.value.set(fx, fy);
      const p = s.palettes[side];
      uniforms.uPrimary.value.copy(srgb(p.colors[0]));
      uniforms.uAuxiliary.value.copy(srgb(p.colors[1]));
      uniforms.uAccent.value.copy(srgb(p.colors[2]));
      uniforms.uBark.value.copy(srgb(p.bark));
      uniforms.uGround.value.copy(srgb(p.ground));
      uniforms.uBackground.value.copy(srgb(p.background));
      uniforms.uTarget.value.copy(srgb(s.target));
      uniforms.uAccentArea.value = p.accent / 100;
      uniforms.uAuxiliaryArea.value = p.auxiliary / 100;
      uniforms.uHue.value = p.hue / 360;
      uniforms.uSaturation.value = p.saturation / 100;
      uniforms.uBrightness.value = p.brightness / 100;
      uniforms.uContext.value = +(s.mode === "context");
      uniforms.uExtract.value = +s.extract;
      uniforms.uTime.value = time;
      uniforms.uWind.value = s.mode === "context" ? 0 : s.wind / 100;
      samples.push({
        x: x + width * (s.extract ? 0.5 : 0.5 + 0.12 * fx),
        y: h * (s.extract ? 0.5 : 0.5 - 0.11 * fy),
      });
      renderer.render(scene, camera);
    }
    renderer.setScissorTest(false);
    frames++;
  }
  function schedule() {
    if (!raf && !dead && !lost && !document.hidden && loaded)
      raf = requestAnimationFrame(frame);
  }
  function frame(now: number) {
    raf = 0;
    if (dead || lost || document.hidden) return;
    if (!s.paused && s.mode !== "context" && s.wind > 0)
      time += Math.min(0.05, (now - last) / 1000);
    last = now;
    draw();
    if (!s.paused && s.mode !== "context" && s.wind > 0) schedule();
  }
  function resize() {
    if (dead || lost) return;
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(
      Math.min(
        devicePixelRatio *
          (s.quality === "low" ? 0.7 : s.quality === "high" ? 1.4 : 1),
        2,
      ),
    );
    renderer.setSize(w, h, false);
    draw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const visibility = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    last = performance.now();
    if (!document.hidden) {
      draw();
      if (!s.paused) schedule();
    }
  };
  document.addEventListener("visibilitychange", visibility);
  const lostHandler = (event: Event) => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    raf = 0;
    onLost("显卡画面中断，请重试加载。");
  };
  canvas.addEventListener("webglcontextlost", lostHandler);
  const textures: T.Texture[] = [];
  const ready = Promise.all(
    ["tree-artwork.png", "tree-regions.png"].map(
      (file) =>
        new Promise<T.Texture>((resolve, reject) => {
          const texture = new T.TextureLoader().load(
            import.meta.env.BASE_URL + "color-lab/" + file,
            (value) => {
              if (dead) {
                value.dispose();
                reject(Error("RENDERER_DISPOSED"));
                return;
              }
              value.colorSpace = T.NoColorSpace;
              value.minFilter = T.LinearFilter;
              value.magFilter = T.LinearFilter;
              value.generateMipmaps = false;
              resolve(value);
            },
            undefined,
            () => reject(Error("底图或分区素材加载失败，请重试。")),
          );
          textures.push(texture);
        }),
    ),
  ).then(([art, regions]) => {
    if (dead) return;
    uniforms.uArt.value = art;
    uniforms.uRegions.value = regions;
    loaded = true;
    resize();
    onReady();
    if (!s.paused) schedule();
  });
  void ready.catch((error) => {
    if (!dead)
      onLost(error instanceof Error ? error.message : "素材加载失败，请重试。");
  });
  resize();
  return {
    update(next: TreeSettings) {
      s = structuredClone(next);
      last = performance.now();
      cancelAnimationFrame(raf);
      raf = 0;
      resize();
      if (!s.paused) schedule();
    },
    resetView() {
      onCamera({ ...initial.camera });
      draw();
    },
    snapshot() {
      return {
        id,
        ready: loaded,
        renderMode: "fixed-artwork",
        artwork: "tree-artwork.png",
        regionMask: "tree-regions.png",
        seed: 20261029,
        geometryId: "approved-tree-artwork-v1",
        leafGeometryId: "approved-tree-regions-v1",
        leafCount: null,
        time,
        frames,
        camera: { ...initial.camera },
        samples: [...samples],
        quality: s.quality,
        mode: s.mode,
        paused: s.paused,
        palettes: structuredClone(s.palettes),
        lights: "baked-fixed",
        exposure: 1,
        lifecycle: { created, disposed, active },
        fps: frames / Math.max(0.001, (performance.now() - started) / 1000),
        drawCalls: renderer.info.render.calls,
      };
    },
    async png(label = false) {
      await ready;
      if (dead || lost || !loaded) throw Error("画面尚未就绪");
      draw();
      const out = document.createElement("canvas");
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      if (label) {
        const scale = Math.min(1, out.width / 1000),
          height = Math.round(62 * scale);
        ctx.fillStyle = "#101725";
        ctx.fillRect(0, out.height - height, out.width, height);
        ctx.font = `${Math.max(11, Math.round(16 * scale))}px sans-serif`;
        ctx.fillStyle = "#E9EDF6";
        ctx.fillText(
          s.name +
            (s.mode === "context"
              ? " · 目标色 " + s.target
              : " · " + s.palettes[0].colors.join(" / ")),
          12,
          out.height - height / 2,
          out.width - 160,
        );
        s.palettes[0].colors.forEach((c, i) => {
          ctx.fillStyle = "#" + treeColor(c, s.palettes[0]).getHexString();
          ctx.fillRect(
            out.width - 135 + i * 36,
            out.height - height / 2 - 10,
            26,
            20,
          );
        });
      }
      return new Promise<Blob>((resolve, reject) =>
        out.toBlob((blob) =>
          blob ? resolve(blob) : reject(Error("无法导出 PNG")),
        ),
      );
    },
    destroy() {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", lostHandler);
      textures.forEach((t) => t.dispose());
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      active--;
      disposed++;
    },
  };
}
