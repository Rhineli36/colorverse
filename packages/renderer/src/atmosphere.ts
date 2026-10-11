import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { seededRandom } from "@colorverse/domain";
import {
  ATMOSPHERE_BUDGET,
  meteorFrame,
  nebulaNoise,
  ambientStarPosition,
  panoramaFrame,
  UNIVERSE_LANDMARKS,
  landmarkDustCount,
} from "./atmosphere-model";

/** Universe scenery has its own layers and lifetime, outside editable scenes. */
export class UniverseAtmosphere {
  readonly background = new Container();
  readonly world = new Container();
  readonly foreground = new Container();
  private textures: Texture[] = [];
  private nebula: Sprite;
  private panorama = new Container();
  private disposed = false;
  private glints: { node: Container; x: number; y: number; phase: number }[] =
    [];
  private suns: { corona: Sprite; phase: number }[] = [];
  private wanderers: {
    node: Container;
    x: number;
    y: number;
    phase: number;
  }[] = [];
  private dust: { node: Graphics; phase: number; radius: number }[] = [];
  private meteors: Graphics[] = [];
  private width = 1600;
  private height = 900;
  private visible = false;
  private seconds = 0;
  private budget;
  constructor(
    lowQuality = false,
    private reducedMotion = false,
  ) {
    this.budget = ATMOSPHERE_BUDGET[lowQuality ? "low" : "normal"];
    for (const root of [
      this.background,
      this.world,
      this.foreground,
      this.panorama,
    ]) {
      root.eventMode = "none";
      root.interactiveChildren = false;
    }
    this.nebula = new Sprite(this.nebulaTexture());
    this.panorama.addChild(this.nebula);
    this.background.addChild(this.panorama);
    const image = new Image();
    image.onload = () => {
      if (this.disposed) return;
      const texture = this.panoramaTexture(image);
      this.textures.push(texture);
      const width = this.nebula.width,
        height = this.nebula.height,
        previous = this.nebula.texture;
      this.nebula.texture = texture;
      this.nebula.width = width;
      this.nebula.height = height;
      this.textures = this.textures.filter((t) => t !== previous);
      previous.destroy(true);
      image.onload = null;
    };
    // A failed/offline load keeps a single procedural fallback, never a tiling grid.
    image.src = lowQuality
      ? new URL("./assets/universe-v2-low.webp", import.meta.url).href
      : new URL("./assets/universe-v2.webp", import.meta.url).href;
    const glow = this.glowTexture();
    const random = seededRandom(38171);
    for (let i = 0; i < this.budget.glints; i++) {
      const node = new Container();
      const haze = new Sprite(glow);
      haze.anchor.set(0.5);
      haze.width = haze.height = 18 + random() * 18;
      haze.tint = i % 3 ? 0xa4d9ee : 0xf8d1ae;
      haze.alpha = 0.38;
      const core = new Graphics().circle(0, 0, 0.9).fill(0xe1f3ff);
      core
        .moveTo(-4, 0)
        .lineTo(4, 0)
        .moveTo(0, -4)
        .lineTo(0, 4)
        .stroke({ color: 0xb8e3f5, alpha: 0.35, width: 0.6 });
      node.addChild(haze, core);
      node.scale.set(3);
      this.background.addChild(node);
      this.glints.push({
        node,
        x: random() * 6400 - 2400,
        y: random() * 4000 - 1550,
        phase: random() * Math.PI * 2,
      });
    }
    for (let i = 0; i < this.budget.wanderers; i++) {
      const node = new Container();
      const haze = new Sprite(glow);
      haze.anchor.set(0.5);
      haze.width = haze.height = 24;
      haze.tint = 0xa7d8f0;
      haze.alpha = 0.35;
      node.addChild(
        haze,
        new Graphics()
          .circle(0, 0, 2 + random() * 1.6)
          .fill({ color: 0xc7e8ff, alpha: 0.6 + random() * 0.3 }),
      );
      this.background.addChild(node);
      this.wanderers.push({
        node,
        x: random() * 6000 - 2200,
        y: random() * 3500 - 1300,
        phase: random() * Math.PI * 2,
      });
    }
    const surface = this.starTexture(lowQuality ? 256 : 512);
    const holes = UNIVERSE_LANDMARKS.filter(
      (item) => item.kind === "black-hole",
    );
    for (const item of UNIVERSE_LANDMARKS) {
      const node = new Container();
      node.position.set(item.x, item.y);
      this.world.addChild(node);
      if (item.kind === "star")
        this.drawStar(node, glow, surface, item.radius, item.color);
      else {
        node.rotation = item.rotation;
        node.scale.set(item.radius / 103);
        this.drawBlackHole(
          node,
          glow,
          landmarkDustCount(
            this.budget.dust,
            holes.indexOf(item),
            holes.length,
          ),
          holes.indexOf(item),
        );
      }
    }
    if (!reducedMotion)
      for (let i = 0; i < 1; i++) {
        const streak = new Graphics();
        this.foreground.addChild(streak);
        this.meteors.push(streak);
      }
    this.update(0);
  }
  /** Bake a soft world-space edge once; no live mask/filter or per-frame upload. */
  private panoramaTexture(image: HTMLImageElement) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    for (const horizontal of [true, false]) {
      const gradient = ctx.createLinearGradient(
        0,
        0,
        horizontal ? canvas.width : 0,
        horizontal ? 0 : canvas.height,
      );
      gradient.addColorStop(0, "#ffffff00");
      gradient.addColorStop(0.04, "#ffffff30");
      gradient.addColorStop(0.12, "#ffffffff");
      gradient.addColorStop(0.88, "#ffffffff");
      gradient.addColorStop(0.96, "#ffffff30");
      gradient.addColorStop(1, "#ffffff00");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return Texture.from(canvas);
  }
  private nebulaTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = this.budget.textureWidth;
    canvas.height = this.budget.textureHeight;
    const ctx = canvas.getContext("2d")!;
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const u = x / canvas.width,
          v = y / canvas.height;
        const noise =
          nebulaNoise(u * 5, v * 5) * 0.55 +
          nebulaNoise(u * 13 + 8, v * 13) * 0.3 +
          nebulaNoise(u * 35, v * 35 + 12) * 0.15;
        // A broken diagonal cloud bank, with small dark channels and two color regions.
        const ridge = v - (0.72 - u * 0.42 + (noise - 0.5) * 0.35);
        const band = Math.exp(-ridge * ridge * 24);
        const fine = nebulaNoise(u * 67 + 31, v * 67 + 19);
        const channels = nebulaNoise(u * 23 + 19, v * 23 + 1);
        const density =
          band *
          Math.max(0, noise - 0.32) *
          1.65 *
          (0.45 + channels * 0.9) *
          (0.65 + fine * 0.7);
        const cyan = Math.exp(-((u - 0.72) ** 2 + (v - 0.4) ** 2) * 7);
        const violet = Math.exp(-((u - 0.25) ** 2 + (v - 0.62) ** 2) * 9);
        const bright = Math.max(0, noise + fine * 0.13 - 0.6) * 180;
        const i = (y * canvas.width + x) * 4;
        pixels.data[i] = 48 + violet * 63 + bright;
        pixels.data[i + 1] = 57 + cyan * 63 + bright;
        pixels.data[i + 2] = 104 + cyan * 42 + violet * 55 + bright;
        const edge = Math.min(1, u * 14, (1 - u) * 14, v * 14, (1 - v) * 14);
        pixels.data[i + 3] = Math.min(190, density * 255) * edge;
      }
    ctx.putImageData(pixels, 0, 0);
    const texture = Texture.from(canvas);
    this.textures.push(texture);
    return texture;
  }
  private glowTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "#ffffffc0");
    gradient.addColorStop(0.13, "#ffffff60");
    gradient.addColorStop(0.4, "#ffffff18");
    gradient.addColorStop(1, "#ffffff00");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = Texture.from(canvas);
    this.textures.push(texture);
    return texture;
  }
  /** One shared granular photosphere, baked once rather than animated noise. */
  private starTexture(size: number) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const pixels = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = ((x + 0.5) / size) * 2 - 1,
          v = ((y + 0.5) / size) * 2 - 1;
        const distance = Math.hypot(u, v);
        if (distance > 1) continue;
        const z = Math.sqrt(1 - distance * distance);
        const grain =
          nebulaNoise(u * 72 + z * 6, v * 72) * 0.55 +
          nebulaNoise(u * 160, v * 160 + z * 12) * 0.25 +
          nebulaNoise(u * 14, v * 14) * 0.2;
        const brightness = (0.72 + z * 0.28) * (0.86 + grain * 0.16);
        const i = (y * size + x) * 4;
        pixels.data[i] = 255 * brightness;
        pixels.data[i + 1] = 246 * brightness;
        pixels.data[i + 2] = 227 * brightness;
        pixels.data[i + 3] = Math.min(1, ((1 - distance) * size) / 2) * 255;
      }
    ctx.putImageData(pixels, 0, 0);
    const texture = Texture.from(canvas);
    this.textures.push(texture);
    return texture;
  }
  private drawStar(
    node: Container,
    glow: Texture,
    surface: Texture,
    radius: number,
    color: number,
  ) {
    const corona = new Sprite(glow);
    corona.anchor.set(0.5);
    corona.width = corona.height = radius * 8;
    corona.tint = color;
    corona.blendMode = "add";
    const rim = new Sprite(glow);
    rim.anchor.set(0.5);
    rim.width = rim.height = radius * 3.6;
    rim.tint = color;
    rim.alpha = 0.72;
    rim.blendMode = "add";
    const body = new Sprite(surface);
    body.anchor.set(0.5);
    body.width = body.height = radius * 2;
    body.tint = color;
    // Emissive scenery stays translucent, unlike an opaque student artwork.
    body.alpha = 0.66;
    body.blendMode = "add";
    const light = new Sprite(glow);
    light.anchor.set(0.5);
    light.width = light.height = radius * 2.4;
    light.tint = 0xfff5e5;
    light.alpha = 0.88;
    light.blendMode = "add";
    node.addChild(corona, rim, body, light);
    // Static curved prominences remain attached to the same world anchor.
    const flames = new Graphics();
    for (let i = 0; i < 3; i++) {
      const angle = i * 2.1 + radius * 0.001;
      const x = Math.cos(angle),
        y = Math.sin(angle);
      flames
        .moveTo(x * radius * 0.94, y * radius * 0.94)
        .quadraticCurveTo(
          x * radius * 1.35 - y * radius * 0.2,
          y * radius * 1.35 + x * radius * 0.2,
          x * radius * 0.89 - y * radius * 0.32,
          y * radius * 0.89 + x * radius * 0.32,
        )
        .stroke({ color, alpha: 0.36, width: radius * 0.012 });
    }
    node.addChild(flames);
    this.suns.push({ corona, phase: radius * 0.01 });
  }
  private drawBlackHole(
    hole: Container,
    glow: Texture,
    dustCount: number,
    seed: number,
  ) {
    const haze = new Sprite(glow);
    haze.anchor.set(0.5);
    haze.width = 1400;
    haze.height = 900;
    haze.tint = 0xdf8152;
    haze.alpha = 0.65;
    hole.addChild(haze);
    const diskGlow = new Sprite(glow);
    diskGlow.anchor.set(0.5);
    diskGlow.width = 790;
    diskGlow.height = 165;
    diskGlow.tint = 0xf5b778;
    diskGlow.alpha = 0.9;
    hole.addChild(diskGlow);
    const rear = new Graphics();
    for (let i = 0; i < 14; i++) {
      const radius = 170 + i * 11;
      rear.ellipse(0, 0, radius, radius * 0.24).stroke({
        color: i % 3 ? 0xd7a276 : 0xa78dce,
        width: i < 3 ? 4 : 2,
        alpha: (1 - i / 17) * 0.23,
      });
    }
    // Lensed light arcs over the shadow, a separate layer from the flattened disk.
    for (let r = 0; r < 6; r++) {
      for (let i = 0; i <= 60; i++) {
        const angle = Math.PI + (i / 60) * Math.PI;
        const x = Math.cos(angle) * (115 + r * 7),
          y = Math.sin(angle) * (125 + r * 7);
        if (i === 0) rear.moveTo(x, y);
        else rear.lineTo(x, y);
      }
      rear.stroke({ color: 0xf4c99a, alpha: 0.24 - r * 0.026, width: 5 });
    }
    hole.addChild(rear);
    const shadow = new Graphics().circle(0, 0, 103).fill(0x03060c);
    for (let i = 0; i < 5; i++)
      shadow.circle(0, 0, 104 + i * 2).stroke({
        color: i < 2 ? 0xffdfb1 : 0xdf915c,
        alpha: 0.6 / (i + 1),
        width: 2,
      });
    hole.addChild(shadow);
    const front = new Graphics();
    for (let r = 0; r < 10; r++) {
      for (let i = 0; i <= 60; i++) {
        const a = (i / 60) * Math.PI,
          radius = 135 + r * 15;
        const x = Math.cos(a) * radius,
          y = Math.sin(a) * radius * 0.24;
        if (i === 0) front.moveTo(x, y);
        else front.lineTo(x, y);
      }
      front.stroke({
        color: r < 3 ? 0xffe2b1 : 0xc99474,
        alpha: 0.55 - r * 0.043,
        width: r < 3 ? 3 : 2,
      });
    }
    hole.addChild(front);
    const random = seededRandom(922 + seed * 731);
    for (let i = 0; i < dustCount; i++) {
      const node = new Graphics().circle(0, 0, 1.5 + random() * 2).fill({
        color: i % 2 ? 0xf5c899 : 0xb49dd4,
        alpha: 0.24 + random() * 0.35,
      });
      hole.addChild(node);
      this.dust.push({
        node,
        phase: random() * Math.PI * 2,
        radius: 175 + random() * 130,
      });
    }
  }
  layout(
    width: number,
    height: number,
    worldScale: number,
    x: number,
    y: number,
    visible: boolean,
  ) {
    const resized = width !== this.width || height !== this.height;
    this.width = width;
    this.height = height;
    this.visible = visible;
    for (const root of [this.background, this.world, this.foreground])
      root.visible = visible;
    this.background.scale.set(worldScale);
    this.background.position.set(x, y);
    // Express the world projection in screen coordinates. There is no cover
    // floor or edge clamp: every image point follows the same mouse anchor.
    this.panorama.scale.set(1 / worldScale);
    this.panorama.position.set(-x / worldScale, -y / worldScale);
    const frame = panoramaFrame(worldScale, x, y);
    this.nebula.position.set(frame.x, frame.y);
    this.nebula.width = frame.width;
    this.nebula.height = frame.height;
    for (const star of this.glints) star.node.position.set(star.x, star.y);
    this.world.scale.set(worldScale);
    this.world.position.set(x, y);
    if (resized) this.update(this.seconds);
  }
  update(seconds: number): number {
    this.seconds = seconds;
    for (const sun of this.suns)
      sun.corona.alpha = 0.62 + Math.sin(seconds * 0.28 + sun.phase) * 0.05;
    for (const star of this.glints)
      star.node.alpha = 0.6 + Math.sin(seconds * 0.55 + star.phase) * 0.22;
    for (const star of this.wanderers) {
      const p = ambientStarPosition(star.x, star.y, star.phase, seconds);
      star.node.position.set(p.x, p.y);
    }
    for (const p of this.dust) {
      const angle = p.phase + seconds * 0.12;
      p.node.position.set(
        Math.cos(angle) * p.radius,
        Math.sin(angle) * p.radius * 0.24,
      );
    }
    let active = 0;
    for (const streak of this.meteors) {
      streak.clear();
      const frame = meteorFrame(seconds);
      streak.visible = !!frame;
      if (!frame) continue;
      active++;
      const length = frame.length * Math.min(this.width, 1800);
      for (let j = 0; j < 12; j++) {
        const a = (length * j) / 12,
          b = (length * (j + 1)) / 12;
        streak
          .moveTo(-a, 0)
          .lineTo(-b, 0)
          .stroke({
            color: 0xc0e8ff,
            width: 1.7 * (1 - j / 15),
            alpha: frame.alpha * (1 - j / 12) ** 2,
          });
      }
      streak.circle(0, 0, 1.6).fill({ color: 0xf1faff, alpha: frame.alpha });
      streak.position.set(frame.x * this.width, frame.y * this.height);
      streak.rotation = frame.angle;
    }
    return this.visible && !this.reducedMotion ? active : 0;
  }
  dispose() {
    this.disposed = true;
    this.textures.forEach((t) => t.destroy(true));
  }
}
