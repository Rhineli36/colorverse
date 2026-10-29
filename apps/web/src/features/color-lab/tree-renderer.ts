import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { type TreeSettings, type TreePalette } from "./tree-state";
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
export function createTreeRenderer(
  canvas: HTMLCanvasElement,
  initial: TreeSettings,
  onCamera: (c: TreeSettings["camera"]) => void,
  onLost: () => void,
) {
  const started = performance.now();
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  created++;
  active++;
  const id = created;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;
  renderer.autoClear = false;
  let s = structuredClone(initial),
    cam = { ...initial.camera },
    time = 0,
    raf = 0,
    last = performance.now(),
    dead = false,
    lost = false,
    frames = 0,
    w = 1,
    h = 1;
  let seed = 20261029;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(40, 1, 0.1, 100),
    focus = new T.Vector3(0, 2.5, 0);
  const ambient = new T.HemisphereLight(0xe4efff, 0x39412d, 2.1);
  scene.add(ambient);
  const sun = new T.DirectionalLight(0xffe8c9, 2.6);
  sun.position.set(-6, 10, 7);
  scene.add(sun);
  const bark = new T.MeshStandardMaterial({ color: 0x71513b, roughness: 0.95 }),
    rock = new T.MeshStandardMaterial({
      color: 0x626771,
      roughness: 1,
      flatShading: true,
    }),
    ground = new T.MeshStandardMaterial({ color: 0x697449, roughness: 1 }),
    leafMat = new T.MeshStandardMaterial({
      roughness: 0.83,
      side: T.DoubleSide,
    });
  const branches: T.BufferGeometry[] = [],
    rocks: T.BufferGeometry[] = [],
    anchors: T.Vector3[] = [];
  function tube(points: T.Vector3[], radius: number) {
    const curve = new T.CatmullRomCurve3(points);
    const g = new T.TubeGeometry(curve, 12, radius, 7, false);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const u = Math.floor(i / 8) / 12,
        c = curve.getPointAt(Math.min(1, u));
      const p = new T.Vector3().fromBufferAttribute(a, i);
      p.sub(c)
        .multiplyScalar(1 - u * 0.78)
        .add(c);
      a.setXYZ(i, p.x, p.y, p.z);
    }
    g.computeVertexNormals();
    branches.push(g);
  }
  tube(
    [
      new T.Vector3(0, 0, 0),
      new T.Vector3(-0.25, 1, 0),
      new T.Vector3(0.25, 2, 0.05),
      new T.Vector3(-0.1, 3.1, 0),
      new T.Vector3(0.25, 4.2, 0),
    ],
    0.5,
  );
  function branch(
    start: T.Vector3,
    direction: T.Vector3,
    length: number,
    radius: number,
    depth: number,
  ) {
    const end = start.clone().addScaledVector(direction, length);
    const mid = start
      .clone()
      .lerp(end, 0.5)
      .add(new T.Vector3((rnd() - 0.5) * 0.28, 0.15, (rnd() - 0.5) * 0.25));
    tube([start, mid, end], radius);
    if (depth === 0) {
      anchors.push(end);
      return;
    }
    for (let i = 0; i < 3; i++) {
      const angle = rnd() * Math.PI * 2;
      const next = direction
        .clone()
        .multiplyScalar(0.5)
        .add(
          new T.Vector3(
            Math.cos(angle) * 0.65,
            0.35 + rnd() * 0.35,
            Math.sin(angle) * 0.65,
          ),
        )
        .normalize();
      branch(end, next, length * 0.65, radius * 0.53, depth - 1);
    }
  }
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + 0.3;
    branch(
      new T.Vector3(0.1, 2.1 + i * 0.18, 0),
      new T.Vector3(
        Math.cos(angle) * 0.83,
        0.5,
        Math.sin(angle) * 0.83,
      ).normalize(),
      1.7 + rnd() * 0.7,
      0.22,
      3,
    );
  }
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    tube(
      [
        new T.Vector3(0, 0.5, 0),
        new T.Vector3(Math.cos(a) * 0.8, 0.15, Math.sin(a) * 0.8),
        new T.Vector3(Math.cos(a) * 1.55, -0.02, Math.sin(a) * 1.55),
      ],
      0.17,
    );
  }
  const treeGeometry = mergeGeometries(branches)!;
  branches.forEach((g) => g.dispose());
  scene.add(new T.Mesh(treeGeometry, bark));
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2,
      r = Math.sqrt(rnd()) * 2.65;
    const g = new T.IcosahedronGeometry(0.35 + rnd() * 0.45, 0);
    g.scale(1, 0.7 + rnd(), 1);
    g.translate(Math.cos(a) * r, -0.25 - rnd() * 0.5, Math.sin(a) * r);
    rocks.push(g);
  }
  const core = new T.ConeGeometry(2.75, 2.5, 11, 4);
  core.rotateX(Math.PI);
  core.translate(0, -1.25, 0);
  rocks.push(core);
  const rockGeometry = mergeGeometries(
    rocks.map((g) => g.toNonIndexed().deleteAttribute("uv")),
  )!;
  rocks.forEach((g) => g.dispose());
  scene.add(new T.Mesh(rockGeometry, rock));
  const soilGeometry = new T.CylinderGeometry(2.75, 2.6, 0.25, 48);
  const soil = new T.Mesh(soilGeometry, ground);
  soil.position.y = -0.08;
  scene.add(soil);
  // Curved, pointed leaf geometry, with stable instance IDs and orientations.
  const leafGeometry = new T.BufferGeometry();
  leafGeometry.setAttribute(
    "position",
    new T.Float32BufferAttribute(
      [
        0, 0, 0, -0.075, 0.14, 0.018, 0, 0.31, 0, 0, 0, 0, 0, 0.31, 0, 0.075,
        0.14, 0.018,
      ],
      3,
    ),
  );
  leafGeometry.computeVertexNormals();
  const grassMaterial = new T.MeshStandardMaterial({
    color: "#799151",
    side: T.DoubleSide,
    roughness: 1,
  });
  const grass = new T.InstancedMesh(leafGeometry, grassMaterial, 950);
  const grassDummy = new T.Object3D();
  for (let i = 0; i < 950; i++) {
    const a = rnd() * Math.PI * 2,
      r = 0.65 + Math.sqrt(rnd()) * 1.95;
    grassDummy.position.set(Math.cos(a) * r, 0.07, Math.sin(a) * r);
    grassDummy.rotation.set(0.2, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5);
    grassDummy.scale.setScalar(0.35 + rnd() * 0.45);
    grassDummy.updateMatrix();
    grass.setMatrixAt(i, grassDummy.matrix);
  }
  scene.add(grass);
  const count = anchors.length * 65,
    leaves = new T.InstancedMesh(leafGeometry, leafMat, count);
  const dummy = new T.Object3D();
  const ranks: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = anchors[Math.floor(i / 65)],
      theta = rnd() * Math.PI * 2,
      r = Math.cbrt(rnd()) * 0.66;
    dummy.position.set(
      a.x + Math.cos(theta) * r,
      a.y + (rnd() - 0.5) * 0.95,
      a.z + Math.sin(theta) * r,
    );
    dummy.rotation.set(
      rnd() * Math.PI,
      rnd() * Math.PI * 2,
      rnd() * Math.PI * 2,
    );
    dummy.scale.setScalar(0.65 + rnd() * 0.65);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    leaves.setColorAt(i, new T.Color());
    ranks.push(rnd());
  }
  scene.add(leaves);
  const windUniform = { value: 0 },
    timeUniform = { value: 0 };
  leafMat.onBeforeCompile = (shader) => {
    shader.uniforms.treeTime = timeUniform;
    shader.uniforms.treeWind = windUniform;
    shader.vertexShader =
      "uniform float treeTime;uniform float treeWind;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nfloat phase=treeTime*1.2+instanceMatrix[3].x*.9+instanceMatrix[3].z*.7;transformed.x+=sin(phase)*treeWind*position.y*.32;transformed.z+=cos(phase*.83)*treeWind*position.y*.18;",
    );
  };
  // Fixed neutral rocks in the distance, real 3D geometry, not a reference-image background.
  const distant = new T.Group();
  for (let i = 0; i < 14; i++) {
    const mountain = new T.Mesh(
      new T.ConeGeometry(1 + rnd() * 2, 2 + rnd() * 4, 5),
      new T.MeshBasicMaterial({
        color: 0x718294,
        transparent: true,
        opacity: 0.16,
      }),
    );
    mountain.position.set((rnd() - 0.5) * 36, -2 - rnd() * 2, -10 - rnd() * 12);
    distant.add(mountain);
  }
  scene.add(distant);
  const targetShape = new T.Shape();
  targetShape.moveTo(0, -0.32);
  targetShape.quadraticCurveTo(-0.4, 0, 0, 0.32);
  targetShape.quadraticCurveTo(0.4, 0, 0, -0.32);
  const targetGeometry = new T.ShapeGeometry(targetShape, 24),
    targetMaterial = new T.MeshBasicMaterial({
      color: initial.target,
      fog: false,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    });
  const target = new T.Mesh(targetGeometry, targetMaterial);
  target.renderOrder = 999;
  scene.add(target);
  const border = new T.LineLoop(
    new T.BufferGeometry().setFromPoints(
      targetShape
        .getPoints(48)
        .map((p) => new T.Vector3(p.x * 1.1, p.y * 1.1, 0)),
    ),
    new T.LineBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      toneMapped: false,
    }),
  );
  target.add(border);
  const displayed = [
    initial.palettes[0].colors.map((c) => new T.Color(c)),
    initial.palettes[1].colors.map((c) => new T.Color(c)),
  ];
  const bgs = initial.palettes.map((p) => new T.Color(p.background));
  function adjusted(hex: string, p: TreePalette) {
    return treeColor(hex, p);
  }
  function cameraUpdate(width: number) {
    camera.aspect = width / h;
    const d = cam.distance * Math.max(1, 0.78 / camera.aspect);
    camera.position.set(
      Math.sin(cam.yaw) * Math.cos(cam.pitch) * d,
      focus.y + Math.sin(cam.pitch) * d,
      Math.cos(cam.yaw) * Math.cos(cam.pitch) * d,
    );
    camera.lookAt(focus);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  const samples: { x: number; y: number }[] = [];
  function draw(dt = 0.016) {
    if (dead || lost || document.hidden) return;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.clear();
    samples.length = 0;
    const two = s.compare || s.mode === "context";
    for (let side = 0; side < (two ? 2 : 1); side++) {
      const width = two ? Math.floor(w / 2) : w,
        x = side ? width : 0;
      renderer.setViewport(x, 0, width, h);
      renderer.setScissor(x, 0, width, h);
      renderer.setScissorTest(true);
      cameraUpdate(width);
      const p = s.palettes[side],
        ease = s.mode === "context" ? 1 : 1 - Math.exp(-dt * 3);
      for (let j = 0; j < 3; j++)
        displayed[side][j].lerp(adjusted(p.colors[j], p), ease);
      bgs[side].lerp(new T.Color(p.background), ease);
      scene.background = s.extract ? new T.Color("#808080") : bgs[side];
      bark.color.set(p.bark);
      ground.color.set(p.ground);
      for (let i = 0; i < count; i++) {
        const rank = ranks[i];
        leaves.setColorAt(
          i,
          displayed[side][
            rank < p.accent / 100
              ? 2
              : rank < (p.accent + p.auxiliary) / 100
                ? 1
                : 0
          ],
        );
      }
      leaves.instanceColor!.needsUpdate = true;
      target.visible = s.mode === "context";
      target.material.color.set(s.target);
      target.position.set(0, 4.6, 1.8);
      target.quaternion.copy(camera.quaternion);
      if (s.extract) {
        target.position.copy(focus);
        target.scale.setScalar(2);
        scene.children.forEach((o) => {
          if (o !== target) o.visible = false;
        });
      } else {
        target.scale.setScalar(1);
        scene.children.forEach((o) => {
          if (o !== target) o.visible = true;
        });
      }
      const projected = target.position.clone().project(camera);
      samples.push({
        x: Math.round(x + ((projected.x + 1) * width) / 2),
        y: Math.round(((1 - projected.y) * h) / 2),
      });
      renderer.render(scene, camera);
    }
    renderer.setScissorTest(false);
    frames++;
  }
  function frame(now: number) {
    raf = 0;
    if (dead || lost || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!s.paused && s.mode !== "context") {
      time += dt;
      timeUniform.value = time;
      windUniform.value = s.wind / 100;
      if (s.orbit) {
        cam.yaw += dt * 0.07;
        onCamera({ ...cam });
      }
    } else windUniform.value = s.mode === "context" ? 0 : s.wind / 100;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }
  function resize() {
    if (dead || lost) return;
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(
      Math.min(
        devicePixelRatio *
          (s.quality === "low" ? 0.7 : s.quality === "medium" ? 1 : 1.4),
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
    if (!document.hidden) raf = requestAnimationFrame(frame);
  };
  document.addEventListener("visibilitychange", visibility);
  const lostHandler = (e: Event) => {
    e.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    onLost();
  };
  canvas.addEventListener("webglcontextlost", lostHandler);
  let drag: { x: number; y: number } | null = null;
  const down = (e: PointerEvent) => {
    if (s.mode === "context") return;
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    cam.yaw -= (e.clientX - drag.x) * 0.006;
    cam.pitch = T.MathUtils.clamp(
      cam.pitch + (e.clientY - drag.y) * 0.004,
      0.05,
      1,
    );
    drag = { x: e.clientX, y: e.clientY };
    onCamera({ ...cam });
  };
  const up = () => (drag = null);
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (s.mode === "context") return;
    cam.distance = T.MathUtils.clamp(
      cam.distance * Math.exp(e.deltaY * 0.001),
      9,
      30,
    );
    onCamera({ ...cam });
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false });
  resize();
  raf = requestAnimationFrame(frame);
  return {
    update(next: TreeSettings) {
      s = structuredClone(next);
      resize();
    },
    resetView() {
      cam = { yaw: 0.4, pitch: 0.28, distance: 17.1 };
      onCamera({ ...cam });
    },
    snapshot() {
      return {
        id,
        seed: 20261029,
        leafCount: count,
        geometryId: treeGeometry.id,
        leafGeometryId: leafGeometry.id,
        time,
        frames,
        camera: { ...cam },
        samples: [...samples],
        quality: s.quality,
        mode: s.mode,
        paused: s.paused,
        palettes: structuredClone(s.palettes),
        lights: [sun.intensity, ambient.intensity],
        exposure: renderer.toneMappingExposure,
        lifecycle: { created, disposed, active },
        fps: frames / Math.max(0.001, (performance.now() - started) / 1000),
        drawCalls: renderer.info.render.calls,
      };
    },
    async png(label = false) {
      draw(1);
      const out = document.createElement("canvas");
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      if (label) {
        ctx.fillStyle = "#101725";
        ctx.fillRect(0, out.height - 52, out.width, 52);
        ctx.fillStyle = "#E9EDF6";
        ctx.font = "18px sans-serif";
        s.palettes.slice(0, s.compare ? 2 : 1).forEach((p, side) =>
          p.colors.forEach((c, i) => {
            ctx.fillStyle = c;
            ctx.fillRect(
              out.width - 160 + i * 26 - side * 90,
              out.height - 38,
              20,
              20,
            );
          }),
        );
        ctx.fillStyle = "#E9EDF6";
        ctx.fillText(
          s.name +
            " · " +
            s.palettes
              .map((p) => p.colors.join(" / "))
              .slice(0, s.compare ? 2 : 1)
              .join("  |  "),
          18,
          out.height - 18,
        );
      }
      return new Promise<Blob>((resolve, reject) =>
        out.toBlob((b) => (b ? resolve(b) : reject(Error("无法导出 PNG")))),
      );
    },
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", lostHandler);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      scene.traverse((o) => {
        if (o instanceof T.Mesh || o instanceof T.Line) {
          o.geometry.dispose();
          const m = Array.isArray(o.material) ? o.material : [o.material];
          m.forEach((v) => v.dispose());
        }
      });
      leaves.dispose();
      grass.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      active--;
      disposed++;
    },
  };
}
