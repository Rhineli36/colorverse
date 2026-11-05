import type { WardrobeData, WardrobeSelection } from "./wardrobe-types";
import { useEffect, useState, type ReactNode } from "react";
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

const sampleBackgrounds = [
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
export function GrowthPreview({
  classroomPlanet,
  onBack,
  wardrobe,
  extraFramePreview,
}: {
  extraFramePreview?: ReactNode;
  classroomPlanet?: {
    name: string;
    interiorSrc: string;
    exteriorSrc: string;
    exterior: ReactNode;
    interior: ReactNode;
  };
  onBack?: () => void;
  wardrobe?: {
    data: WardrobeData;
    onSave: (v: WardrobeSelection) => Promise<void>;
    onRefresh?: () => Promise<void>;
  };
}) {
  const backgrounds = classroomPlanet
    ? [
        {
          id: "own",
          name: "我的星球背景",
          hint: "自己的星球 · 仅试戴",
          src: classroomPlanet.interiorSrc,
        },
        ...sampleBackgrounds,
      ]
    : sampleBackgrounds;
  const [palette, setPalette] = useState<GrowthPalette | undefined>(
      wardrobe?.data.settings.options.palette,
    ),
    [background, setBackground] = useState(classroomPlanet ? "own" : "garden");
  const [framePreset, setFramePreset] = useState<FrameId | undefined>(
      wardrobe?.data.settings.frameId ?? undefined,
    ),
    [ringPreset, setRingPreset] = useState<RingId>();
  const [moving, setMoving] = useState(true),
    [frame, setFrame] = useState(true),
    [particles, setParticles] = useState(
      wardrobe?.data.settings.options.particles ?? true,
    ),
    [ring, setRing] = useState(true),
    [moon, setMoon] = useState(!wardrobe),
    [lantern, setLantern] = useState(
      wardrobe?.data.settings.options.lantern ?? true,
    );
  const [charmPlacements, setCharmPlacements] = useState<
    Record<string, CharmPlacement>
  >(
    wardrobe?.data.settings.frameId
      ? { [wardrobe.data.settings.frameId]: wardrobe.data.settings.placement }
      : {},
  );
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
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const saveFrame = async (id: FrameId | null) => {
    if (!wardrobe || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await wardrobe.onSave({
        frameId: id,
        placement: id
          ? (charmPlacements[id] ?? initialCharmPlacement)
          : initialCharmPlacement,
        options: id
          ? { palette, particles, lantern }
          : { particles: false, lantern: false },
        revision: wardrobe.data.settings.revision,
      });
      setFramePreset(id ?? undefined);
      setFrame(true);
      if (!id) {
        setRingPreset(undefined);
        setLantern(false);
        setParticles(false);
        setMoon(false);
        setPalette(undefined);
      }
      setMessage(
        id ? "装扮已套用并保存" : "已恢复无装扮，原图片和解锁资格保留",
      );
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };
  const bg = backgrounds.find((b) => b.id === background) ?? backgrounds[0];
  const scene = background === "upload" ? uploadUrl : bg.src;
  const frameName = framePresets.find((p) => p.id === framePreset)?.name;
  const ringName = ringPresets.find((p) => p.id === ringPreset)?.name;
  const applyPalette = (next: GrowthPalette) => {
    setPalette(next);
    // Make a palette click visible even before the user picks a ring.
    // This is a temporary trial, never an ownership/unlock operation.
    if (!ringPreset) {
      setRingPreset("gold");
      setRing(true);
    }
  };
  const tryOn = () =>
    document.querySelector(".gp-preview-grid")?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
  return (
    <div
      className={`gp-app palette-${palette ?? "gold"} ${moving && !hidden ? "" : "motion-paused"}`}
    >
      {onBack ? (
        <header className="gp-header">
          <button disabled={saving} onClick={onBack}>
            ← 返回星球
          </button>
          <strong>装扮星球</strong>
          <span>试戴不更改星球，已解锁款式可点击套用</span>
        </header>
      ) : (
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
              <circle
                cx="24"
                cy="24"
                r="10"
                fill="currentColor"
                stroke="none"
              />
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
      )}
      <main className="gp-main">
        <section className="gp-heading">
          <div>
            <p className="gp-eyebrow">A LITTLE MORE WONDER, EVERY TIME.</p>
            <h1>{onBack ? "装扮星球" : "为你的星球，收藏更多光芒。"}</h1>
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
                <RingPresetArt
                  id={ringPreset}
                  particles={particles}
                  palette={palette}
                />
              )}
              {classroomPlanet ? (
                classroomPlanet.exterior
              ) : (
                <img
                  className="gp-planet-body"
                  src={previewAsset("competition/case-3-exterior.webp")}
                  alt="保留原有花园外观的星球"
                />
              )}
              {ringPreset && ring && (
                <RingPresetArt
                  id={ringPreset}
                  front
                  particles={particles}
                  palette={palette}
                />
              )}
              {moon && ringPreset !== "jellyfish" && <MoonOrbit />}
            </div>
            <div className="gp-planet-caption">
              <span className="gp-eyebrow">YOUR OWN LITTLE UNIVERSE</span>
              <h2>{classroomPlanet?.name ?? "森野绮梦"}</h2>
              <p>
                {ringName
                  ? `${ring ? "当前试戴" : "已隐藏"}：${ringName} · 解锁条件待配置`
                  : "勾选星环即可试戴，也可以从预设中挑选款式。"}
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
              {background === "own" && classroomPlanet ? (
                classroomPlanet.interior
              ) : (
                <img
                  className="gp-room-art"
                  src={scene}
                  alt="星球内部背景原画"
                />
              )}
              {framePreset && frame && (
                <FramePresetArt id={framePreset} palette={palette} />
              )}
              {particles && <StarDust interior />}
              {!onBack && (
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
              )}
              {lantern && (
                <DraggableCharm
                  key={charmKey}
                  placement={charmPlacement}
                  onChange={setCharmPlacement}
                  name={charmName}
                >
                  {framePreset ? (
                    <FloatingCharm id={framePreset} palette={palette} />
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
                  ? `${wardrobe?.data.unlocked.includes(framePreset!) ? "已解锁" : "仅试戴 · 未解锁"}：${frameName}`
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
              装饰配色 <small>同步调整试戴装饰，保留原画与主题图案</small>
            </h3>
            <div className="gp-palette-options">
              {palettes.map((p) => (
                <button
                  key={p.id}
                  aria-pressed={palette === p.id}
                  onClick={() => applyPalette(p.id)}
                >
                  <span className="gp-swatches">
                    {p.colors.map((c) => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </span>
                  {p.name}
                </button>
              ))}
              <button
                aria-pressed={palette === undefined}
                onClick={() => setPalette(undefined)}
              >
                原配色
              </button>
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
              {
                name: "星环",
                value: Boolean(ringPreset && ring),
                set: (show: boolean) => {
                  setRing(show);
                  if (show && !ringPreset) setRingPreset("gold");
                },
              },
              { name: "伴生卫星", value: moon, set: setMoon },
              {
                name: "星辉边框",
                value: Boolean(framePreset && frame),
                set: (show: boolean) => {
                  setFrame(show);
                  if (show && !framePreset) setFramePreset("gold");
                },
              },
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
        {wardrobe && (
          <section className="gp-save-controls" aria-label="保存星球装扮">
            {saveError && <p role="alert">{saveError}</p>}
            {wardrobe.onRefresh && (
              <button
                disabled={saving || refreshing}
                onClick={async () => {
                  setRefreshing(true);
                  setSaveError("");
                  try {
                    await wardrobe.onRefresh?.();
                    setMessage("解锁状态已刷新");
                  } catch (e) {
                    setSaveError(
                      e instanceof Error ? e.message : "读取失败，请重试",
                    );
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                {refreshing ? "正在刷新…" : "刷新解锁进度"}
              </button>
            )}
            <button
              disabled={
                saving ||
                !framePreset ||
                !wardrobe.data.unlocked.includes(framePreset)
              }
              onClick={() => void saveFrame(framePreset ?? null)}
            >
              {saving ? "正在保存…" : "保存当前装扮"}
            </button>
            <button
              disabled={
                saving ||
                (!wardrobe.data.settings.frameId && !framePreset && !ringPreset)
              }
              onClick={() => void saveFrame(null)}
            >
              恢复无装扮
            </button>
            <p>恢复无装扮仅移除装饰，不更换星球原图，也不清除解锁资格。</p>
            <p role="status">
              {message || "未解锁款式可试戴；套用和保存仅对已解锁款式开放。"}
            </p>
          </section>
        )}
        <PresetCatalog
          extraFramePreview={extraFramePreview}
          unlocked={wardrobe?.data.unlocked}
          progress={wardrobe?.data.progress}
          winterLabel={
            wardrobe?.data.bindings.find((b) => b.skin_id === "winter")
              ?.title ?? undefined
          }
          onApply={wardrobe ? (id) => void saveFrame(id) : undefined}
          saving={saving}
          frame={framePreset}
          ring={ringPreset}
          background={scene}
          exteriorSrc={classroomPlanet?.exteriorSrc}
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
            {wardrobe
              ? "已解锁款式可套用并保存 · 试戴其他款式不会自动替换"
              : "解锁条件见各款卡片 · 独立预览不发放解锁资格"}
          </span>
        </footer>
      </main>
    </div>
  );
}
