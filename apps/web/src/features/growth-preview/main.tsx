import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import {
  MoonOrbit,
  StarDust,
  StarLantern,
  type GrowthPalette,
} from "./Ornaments";
import "./preview.css";
import { previewAsset, previewHome } from "./assets";
import { FloatingCharm, charmNames } from "./FloatingCharms";
import {
  DraggableCharm,
  CharmPositionControls,
  initialCharmPlacement,
  type CharmPlacement,
} from "./DraggableCharm";
import { FramePresetArt, RingPresetArt } from "./PresetArt";
import { PresetCatalog, LockIcon } from "./PresetCatalog";
import {
  framePresets,
  ringPresets,
  type FrameId,
  type RingId,
} from "./presets";

const backgrounds = [
  {
    id: "garden",
    name: "绮丽花园",
    hint: "高饱和 · 复杂图案",
    src: previewAsset("competition/case-3-interior.webp"),
  },
  {
    id: "red",
    name: "朱红盛景",
    hint: "高饱和 · 暖色",
    src: previewAsset("emotion-cases/red-vermilion-c1c04cddd601.webp"),
  },
  {
    id: "cream",
    name: "奶油午后",
    hint: "高明度 · 浅色",
    src: previewAsset("emotion-cases/yellow-cream-8ebb92103f82.webp"),
  },
];
const palettes = [
  {
    id: "gold" as const,
    name: "青金星辉",
    colors: ["#edcb87", "#8edddd", "#fff6d8"],
  },
  {
    id: "moon" as const,
    name: "月光银蓝",
    colors: ["#d7e6fa", "#99b8ff", "#f5fbff"],
  },
  {
    id: "rose" as const,
    name: "紫晶玫瑰",
    colors: ["#edb5dc", "#bda5ff", "#fff0fc"],
  },
];
function Preview() {
  const [palette, setPalette] = useState<GrowthPalette>("gold"),
    [background, setBackground] = useState("garden");
  const [framePreset, setFramePreset] = useState<FrameId>(),
    [ringPreset, setRingPreset] = useState<RingId>();
  const [moving, setMoving] = useState(true),
    [frame, setFrame] = useState(true),
    [particles, setParticles] = useState(true),
    [ring, setRing] = useState(true),
    [moon, setMoon] = useState(true),
    [lantern, setLantern] = useState(true);
  const [charmPlacements, setCharmPlacements] = useState<
    Record<string, CharmPlacement>
  >({});
  const charmKey = framePreset ?? "default";
  const charmPlacement = charmPlacements[charmKey] ?? initialCharmPlacement;
  const setCharmPlacement = (next: CharmPlacement) =>
    setCharmPlacements((previous) => ({ ...previous, [charmKey]: next }));
  const charmName = framePreset ? charmNames[framePreset] : "星灯";
  const [upload, setUpload] = useState<File>(),
    [uploadUrl, setUploadUrl] = useState("");
  const [message, setMessage] = useState("");
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const change = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    if (!upload) return;
    const u = URL.createObjectURL(upload);
    setUploadUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [upload]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 2200);
    return () => clearTimeout(t);
  }, [message]);
  const bg = backgrounds.find((b) => b.id === background) ?? backgrounds[0];
  const scene = background === "upload" ? uploadUrl : bg.src;
  const frameName = framePresets.find((p) => p.id === framePreset)?.name;
  const ringName = ringPresets.find((p) => p.id === ringPreset)?.name;
  const tryOn = () =>
    document.querySelector(".gp-preview-grid")?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
  return (
    <div
      className={`gp-app palette-${palette} ${moving && !hidden ? "" : "motion-paused"}`}
    >
      <header className="gp-header">
        <a className="gp-brand" href={previewHome}>
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="16" />
            <ellipse
              cx="24"
              cy="24"
              rx="21"
              ry="19"
              transform="rotate(-28 24 24)"
            />
            <circle cx="24" cy="24" r="10" fill="currentColor" stroke="none" />
            <circle cx="41" cy="13" r="3" fill="currentColor" stroke="none" />
          </svg>
          <span>
            COLORVERSE<small>色 彩 星 球</small>
          </span>
        </a>
        <span className="gp-header-label">
          星光收藏 <span>/</span> 装饰预设
        </span>
        <span className="gp-local">
          {import.meta.env.BASE_URL === "/" ? "仅本地预览" : "独立测试预览"}
        </span>
      </header>
      <main className="gp-main">
        <section className="gp-heading">
          <div>
            <p className="gp-eyebrow">A LITTLE MORE WONDER, EVERY TIME.</p>
            <h1>为你的星球，收藏更多光芒。</h1>
            <p className="gp-intro">
              宝石、繁花、初冬与星海。让每一次成长，都有自己的模样。
            </p>
          </div>
          <div className="gp-collection-actions">
            <a href="#presets">
              <LockIcon /> 浏览 {framePresets.length + ringPresets.length}{" "}
              款预设 ↓
            </a>
            <button
              disabled={!framePreset && !ringPreset}
              onClick={() => {
                setFramePreset(undefined);
                setRingPreset(undefined);
              }}
            >
              结束试戴
            </button>
          </div>
        </section>
        <div className="gp-preview-grid">
          <section className="gp-exterior-panel" aria-label="星球外部预览">
            <div className="gp-panel-caption">
              <span>
                01 <b>星球外观</b>
              </span>
              <span className="gp-stage-chip">
                {ringPreset ? "仅试戴 · 未解锁" : "原始外观"}
              </span>
            </div>
            <div className="gp-exterior-stage">
              <div className="gp-exterior-aura" />
              {particles && <StarDust />}
              {ringPreset && ring && (
                <RingPresetArt id={ringPreset} particles={particles} />
              )}
              <img
                className="gp-planet-body"
                src={previewAsset("competition/case-3-exterior.webp")}
                alt="保留原有花园外观的星球"
              />
              {ringPreset && ring && (
                <RingPresetArt id={ringPreset} front particles={particles} />
              )}
              {moon && ringPreset !== "jellyfish" && <MoonOrbit />}
            </div>
            <div className="gp-planet-caption">
              <span className="gp-eyebrow">YOUR OWN LITTLE UNIVERSE</span>
              <h2>森野绮梦</h2>
              <p>
                {ringName
                  ? `当前试戴：${ringName} · 解锁条件待配置`
                  : "从预设目录挑一款星环，预览环绕的细节。"}
              </p>
            </div>
          </section>
          <section className="gp-interior-panel" aria-label="星球内部预览">
            <div className="gp-panel-caption">
              <span>
                02 <b>内部空间</b>
              </span>
              <span>
                {frameName ? `试戴：${frameName}` : "原画保留 · 装饰独立叠加"}
              </span>
            </div>
            <div className="gp-room-scene">
              <img className="gp-room-art" src={scene} alt="星球内部背景原画" />
              {framePreset && frame && <FramePresetArt id={framePreset} />}
              {particles && <StarDust interior />}
              <div className="gp-work-elements" aria-label="原有作业元素">
                {[
                  { x: 25, y: 68, c: "#a7e8df", n: "冷暖色练习" },
                  { x: 49, y: 78, c: "#e0c3fc", n: "色彩情绪探索" },
                  { x: 66, y: 57, c: "#ffcaa3", n: "配色与节奏" },
                ].map((w, i) => (
                  <button
                    key={w.n}
                    style={
                      {
                        left: w.x + "%",
                        top: w.y + "%",
                        "--work-color": w.c,
                      } as React.CSSProperties
                    }
                    aria-label={`查看作品：${w.n}`}
                    title={w.n}
                    onClick={() => setMessage(`作品入口仍可点击 · ${w.n}`)}
                  >
                    <svg viewBox="0 0 40 48" aria-hidden="true">
                      <path
                        d={
                          i === 0
                            ? "M20 2L34 15L27 40L20 47L7 31L8 12Z"
                            : i === 1
                              ? "M20 1L24 17L39 23L25 28L20 46L15 28L1 23L15 17Z"
                              : "M20 3L35 38H5ZM20 3V38M5 38L27 24"
                        }
                        fill="currentColor"
                        fillOpacity=".65"
                        stroke="currentColor"
                        strokeWidth="1.3"
                      />
                    </svg>
                  </button>
                ))}
              </div>
              {lantern && (
                <DraggableCharm
                  key={charmKey}
                  placement={charmPlacement}
                  onChange={setCharmPlacement}
                  name={charmName}
                >
                  {framePreset ? (
                    <FloatingCharm id={framePreset} />
                  ) : (
                    <StarLantern />
                  )}
                </DraggableCharm>
              )}
              {message && (
                <p className="gp-toast" role="status">
                  {message}
                </p>
              )}
            </div>
            <div className="gp-room-footer">
              <span>
                <i /> {background === "upload" ? "自己的背景" : bg.hint}
              </span>
              <span>
                {frameName
                  ? `仅试戴 · 未解锁：${frameName}`
                  : "选择下方预设可临时试戴"}
              </span>
            </div>
          </section>
        </div>
        <CharmPositionControls
          placement={charmPlacement}
          onChange={setCharmPlacement}
          name={charmName}
          disabled={!lantern}
        />
        <section className="gp-controls" aria-label="装饰与背景设置">
          <div className="gp-control-group gp-palette-group">
            <h3>
              氛围配色 <small>星灯与伴星 · 边框和星环使用各自材质</small>
            </h3>
            <div className="gp-palette-options">
              {palettes.map((p) => (
                <button
                  key={p.id}
                  aria-pressed={palette === p.id}
                  onClick={() => setPalette(p.id)}
                >
                  <span className="gp-swatches">
                    {p.colors.map((c) => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="gp-control-group">
            <h3>
              换个背景看看 <small>检验复杂画面的辨识度</small>
            </h3>
            <div className="gp-background-options">
              {backgrounds.map((b) => (
                <button
                  key={b.id}
                  aria-pressed={background === b.id}
                  onClick={() => setBackground(b.id)}
                  title={b.hint}
                >
                  <img src={b.src} alt="" />
                  {b.name}
                </button>
              ))}
              <label className="gp-upload">
                ＋ 自选背景
                <input
                  type="file"
                  aria-label="选择自己的背景预览"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setUpload(file);
                      setBackground("upload");
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </section>
        <section className="gp-bottom-controls" aria-label="装饰显示开关">
          <div>
            {[
              { name: "星环", value: ring, set: setRing },
              { name: "伴生卫星", value: moon, set: setMoon },
              { name: "星辉边框", value: frame, set: setFrame },
              { name: "配套浮饰", value: lantern, set: setLantern },
              { name: "微光粒子", value: particles, set: setParticles },
            ].map((c) => (
              <label key={c.name}>
                <input
                  type="checkbox"
                  checked={c.value}
                  onChange={(e) => c.set(e.target.checked)}
                />
                {c.name}
              </label>
            ))}
          </div>
          <button
            className="gp-motion-toggle"
            aria-pressed={moving}
            onClick={() => setMoving(!moving)}
          >
            {moving ? "Ⅱ 暂停动态" : "▷ 开启动态"}
          </button>
        </section>
        <PresetCatalog
          frame={framePreset}
          ring={ringPreset}
          background={scene}
          onFrame={(id) => {
            setFramePreset(id);
            setFrame(true);
            tryOn();
          }}
          onRing={(id) => {
            setRingPreset(id);
            setRing(true);
            tryOn();
          }}
        />
        <footer className="gp-page-footer">
          <span>STARS GROW WITH YOU.</span>
          <span>
            所有预设默认锁定 · 解锁要求后续配置 · 试戴不发放装饰，不写入课堂数据
          </span>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
