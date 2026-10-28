import * as THREE from "three";
import {
  vertexShader,
  fragmentShader,
  generateGeometry,
} from "./jellyfish-shape.js";
import {
  PRESETS,
  defaultSettings,
  type LabSettings,
  type LabCamera,
  type Quality,
} from "./lab-state";
const QUALITY = {
  low: { scale: 0.43, dpr: 1, halo: 0.55 },
  medium: { scale: 1, dpr: 1.5, halo: 0.8 },
  high: { scale: 1.8, dpr: 2, halo: 1 },
};
const lifecycle = { created: 0, disposed: 0, active: 0 };
export type JellyfishRenderer = ReturnType<typeof createJellyfishRenderer>;
export function createJellyfishRenderer(
  canvas: HTMLCanvasElement,
  initial: LabSettings,
  callbacks: { onCamera: (camera: LabCamera) => void; onLost: () => void },
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  lifecycle.created++;
  lifecycle.active++;
  const id = lifecycle.created;
  let config = structuredClone(initial),
    cameraState = { ...initial.camera };
  let time = 0,
    waveTime = -100,
    frames = 0,
    raf = 0,
    destroyed = false,
    lost = false;
  let width = 1,
    height = 1,
    quality: Quality = initial.quality;
  const mouse = new THREE.Vector2(),
    mouseTarget = new THREE.Vector2(),
    wave = new THREE.Vector3();
  const scene = new THREE.Scene(),
    group = new THREE.Group();
  scene.add(group);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 80),
    target = new THREE.Vector3(0, -1.32, 0);
  const makeUniforms = () => ({
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uViewportHeight: { value: 850 },
    uWaveTime: { value: -100 },
    uWave: { value: wave },
    uMouse: { value: mouse },
    uColorA: { value: new THREE.Color() },
    uColorB: { value: new THREE.Color() },
    uColorC: { value: new THREE.Color() },
    uAccentMode: { value: 0 },
    uWarmMode: { value: 0 },
    uGray: { value: 0 },
    uAccent: { value: 0.08 },
    uHue: { value: 0 },
    uSaturation: { value: 1 },
    uBrightness: { value: 1 },
    uGlow: { value: 0.35 },
    uHalo: { value: 1 },
  });
  const materials = [0, 1].map(
    () =>
      new THREE.ShaderMaterial({
        uniforms: makeUniforms(),
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
  );
  let geometry = generateGeometry(QUALITY[quality].scale);
  const points = new THREE.Points(geometry, materials[0]);
  points.frustumCulled = false;
  group.add(points);
  renderer.setClearColor(0x020a14, 0);
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const listeners: (() => void)[] = [];
  function listen<T extends EventTarget>(
    target: T,
    type: string,
    fn: EventListener,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, fn, options);
    listeners.push(() => target.removeEventListener(type, fn, options));
  }
  function resize() {
    if (destroyed || lost) return;
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
  }
  function updateCamera(w: number) {
    camera.aspect = w / height;
    const distance = cameraState.distance * Math.max(1, 0.78 / camera.aspect);
    camera.position.set(
      Math.sin(cameraState.yaw) * Math.cos(cameraState.pitch) * distance,
      Math.sin(cameraState.pitch) * distance + target.y,
      Math.cos(cameraState.yaw) * Math.cos(cameraState.pitch) * distance,
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  function updateUniforms(material: THREE.ShaderMaterial, side: number) {
    const u = material.uniforms,
      c = config.colors[side],
      p = PRESETS[c.basePreset];
    u.uColorA.value.set(p.colors[0]);
    u.uColorB.value.set(p.colors[1]);
    u.uColorC.value.set(p.colors[2]);
    u.uAccentMode.value = c.basePreset === 2 ? 1 : 0;
    u.uWarmMode.value = c.basePreset === 1 ? 1 : 0;
    u.uGray.value = c.preset === 3 ? 1 : 0;
    u.uAccent.value = c.accent / 100;
    u.uHue.value = (c.hue * Math.PI) / 180;
    u.uSaturation.value = c.saturation / 100;
    u.uBrightness.value = c.brightness / 100;
    u.uTime.value = time;
    u.uWaveTime.value = waveTime;
    u.uPixelRatio.value = renderer.getPixelRatio();
    u.uViewportHeight.value = height;
    u.uGlow.value = config.glow;
    u.uHalo.value = QUALITY[quality].halo;
  }
  function render() {
    if (destroyed || lost || document.hidden) return;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.clear();
    for (let side = 0; side < (config.compare ? 2 : 1); side++) {
      const x = side ? Math.floor(width / 2) : 0,
        w = config.compare ? (side ? width - x : Math.floor(width / 2)) : width;
      renderer.setViewport(x, 0, w, height);
      renderer.setScissor(x, 0, w, height);
      renderer.setScissorTest(true);
      updateCamera(w);
      updateUniforms(materials[side], side);
      points.material = materials[side];
      renderer.render(scene, camera);
    }
    renderer.setScissorTest(false);
    frames++;
  }
  let last = performance.now();
  function frame(now: number) {
    raf = 0;
    if (destroyed || lost || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!config.paused) {
      time += dt * config.speed;
      mouse.lerp(mouseTarget, 1 - Math.exp(-dt * 3));
    }
    render();
    schedule();
  }
  function schedule() {
    if (!raf && !destroyed && !lost && !document.hidden && !config.paused)
      raf = requestAnimationFrame(frame);
  }
  function refresh() {
    render();
    last = performance.now();
    schedule();
  }
  const observer = new ResizeObserver(() => {
    resize();
    refresh();
  });
  observer.observe(canvas);
  listen(document, "visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      last = performance.now();
      refresh();
    }
  });
  listen(canvas, "webglcontextlost", (event) => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    raf = 0;
    callbacks.onLost();
  });
  let drag: {
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
    pointerId: number;
  } | null = null;
  listen(canvas, "pointerdown", ((event: PointerEvent) => {
    if (event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    drag = {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
    };
    canvas.setPointerCapture(event.pointerId);
  }) as EventListener);
  listen(canvas, "pointermove", ((event: PointerEvent) => {
    if (drag) {
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y;
      if (
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4
      )
        drag.moved = true;
      cameraState.yaw -= dx * 0.005;
      cameraState.pitch = THREE.MathUtils.clamp(
        cameraState.pitch + dy * 0.004,
        -0.7,
        0.8,
      );
      drag.x = event.clientX;
      drag.y = event.clientY;
    } else {
      const rect = canvas.getBoundingClientRect();
      mouseTarget.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      );
    }
    refresh();
  }) as EventListener);
  listen(canvas, "pointerup", ((event: PointerEvent) => {
    if (!drag) return;
    if (!drag.moved) {
      const rect = canvas.getBoundingClientRect(),
        w = config.compare ? width / 2 : width;
      updateCamera(w);
      const ndc = new THREE.Vector2(
        (((event.clientX - rect.left) % w) / w) * 2 - 1,
        -((event.clientY - rect.top) / height) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      ray.ray.intersectPlane(
        new THREE.Plane().setFromNormalAndCoplanarPoint(normal, target),
        wave,
      );
      waveTime = time;
    }
    callbacks.onCamera({ ...cameraState });
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    drag = null;
    refresh();
  }) as EventListener);
  listen(canvas, "pointercancel", () => {
    drag = null;
    callbacks.onCamera({ ...cameraState });
  });
  listen(canvas, "pointerleave", () => {
    if (!drag) mouseTarget.set(0, 0);
  });
  listen(
    canvas,
    "wheel",
    ((event: WheelEvent) => {
      event.preventDefault();
      cameraState.distance = THREE.MathUtils.clamp(
        cameraState.distance * Math.exp(event.deltaY * 0.0008),
        7.5,
        20,
      );
      callbacks.onCamera({ ...cameraState });
      refresh();
    }) as EventListener,
    { passive: false },
  );
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QUALITY[quality].dpr));
  resize();
  refresh();
  return {
    update(next: LabSettings) {
      if (destroyed) return;
      config = structuredClone(next);
      if (quality !== next.quality) {
        quality = next.quality;
        const old = geometry;
        geometry = generateGeometry(QUALITY[quality].scale);
        points.geometry = geometry;
        old.dispose();
        renderer.setPixelRatio(
          Math.min(devicePixelRatio || 1, QUALITY[quality].dpr),
        );
        resize();
      }
      if (config.paused) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      refresh();
    },
    resetView() {
      cameraState = { ...defaultSettings().camera };
      mouse.set(0, 0);
      mouseTarget.set(0, 0);
      callbacks.onCamera({ ...cameraState });
      refresh();
    },
    restore() {
      time = 0;
      waveTime = -100;
      this.resetView();
    },
    snapshot() {
      return {
        id,
        time,
        paused: config.paused,
        compare: config.compare,
        colors: structuredClone(config.colors),
        quality,
        particleCount: geometry.attributes.position.count,
        camera: { ...cameraState },
        frames,
        seed: 20261028,
        geometryShared: true,
        geometryId: geometry.id,
        uniformTimes: materials.map((m) => m.uniforms.uTime.value),
        colorUniforms: materials.map((m) => ({
          gray: m.uniforms.uGray.value,
          accent: m.uniforms.uAccent.value,
        })),
        viewport: { width, height },
        animationScheduled: Boolean(raf),
        hidden: document.hidden,
        lifecycle: { ...lifecycle },
        renderer: renderer.info.render,
      };
    },
    async exportPng() {
      if (lost || destroyed) throw Error("画面暂不可用，请先重试加载");
      render();
      const out = document.createElement("canvas");
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext("2d");
      if (!ctx) throw Error("无法导出图像");
      const grad = ctx.createRadialGradient(
        out.width * 0.5,
        out.height * 0.4,
        0,
        out.width * 0.5,
        out.height * 0.4,
        Math.max(out.width, out.height) * 0.7,
      );
      grad.addColorStop(0, "#081c2a");
      grad.addColorStop(0.45, "#030d19");
      grad.addColorStop(1, "#020811");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(canvas, 0, 0);
      return new Promise<Blob>((resolve, reject) =>
        out.toBlob(
          (blob) => (blob ? resolve(blob) : reject(Error("无法生成 PNG"))),
          "image/png",
        ),
      );
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      if (drag && canvas.hasPointerCapture(drag.pointerId))
        canvas.releasePointerCapture(drag.pointerId);
      drag = null;
      observer.disconnect();
      listeners.forEach((remove) => remove());
      group.remove(points);
      geometry.dispose();
      materials.forEach((m) => m.dispose());
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      lifecycle.active--;
      lifecycle.disposed++;
    },
  };
}
