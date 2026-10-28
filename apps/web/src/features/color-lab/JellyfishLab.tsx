import { useCallback, useEffect, useRef, useState } from "react";
import {
  createJellyfishRenderer,
  type JellyfishRenderer,
} from "./jellyfish-renderer";
import {
  choosePreset,
  defaultSettings,
  loadSettings,
  PRESETS,
  saveSettings,
  swatchColors,
  type ColorState,
  type LabSettings,
} from "./lab-state";
import { JELLYFISH_PATH, LAB_PATH, labNavigate } from "./lab-navigation";
import { experiments } from "./experiments";
import "./color-lab.css";
declare global {
  interface Window {
    colorLab?: { getSnapshot: () => ReturnType<JellyfishRenderer["snapshot"]> };
  }
}
export default function JellyfishLab({ classroom }: { classroom: boolean }) {
  const [settings, setSettings] = useState(loadSettings),
    latest = useRef(settings);
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<JellyfishRenderer | null>(null),
    root = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [drawer, setDrawer] = useState(false),
    [group, setGroup] = useState("color"),
    [hex, setHex] = useState(false),
    [toast, setToast] = useState(""),
    [idle, setIdle] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [saving, setSaving] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const fullscreenExitedAt = useRef(0);
  latest.current = settings;
  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    if (matchMedia("(pointer: fine)").matches)
      idleTimer.current = setTimeout(() => setIdle(true), 4200);
  }, []);
  const change = useCallback(
    (fn: (value: LabSettings) => LabSettings) =>
      setSettings((value) => fn(value)),
    [],
  );
  const selectPreset = useCallback(
    (preset: number, side?: number) =>
      change((s) => {
        const colors: [ColorState, ColorState] = [...s.colors];
        const target = side ?? (s.compare ? s.activeSide : 0);
        colors[target] = choosePreset(colors[target], preset);
        return { ...s, colors };
      }),
    [change],
  );
  const pause = useCallback(
    () => change((s) => ({ ...s, paused: !s.paused })),
    [change],
  );
  const compare = useCallback(
    () => change((s) => ({ ...s, compare: !s.compare, activeSide: 0 })),
    [change],
  );
  function mode(value: boolean) {
    setDrawer(false);
    labNavigate(JELLYFISH_PATH + (value ? "?mode=classroom" : ""));
    wake();
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      setToast("浏览器未允许全屏，仍可使用课堂模式观看。");
    }
  }
  useEffect(() => {
    let value: JellyfishRenderer | null = null;
    try {
      value = createJellyfishRenderer(canvas.current!, latest.current, {
        onCamera: (camera) => {
          latest.current = { ...latest.current, camera };
          saveSettings(latest.current);
        },
        onLost: () =>
          setError(
            "显卡渲染暂时中断。可以重试加载；若重复出现，请选择低质量档位。",
          ),
      });
      engine.current = value;
      window.colorLab = { getSnapshot: () => value!.snapshot() };
      setError("");
    } catch {
      setError(
        "无法启动三维画面。请使用支持 WebGL 2 的 Chrome 或 Edge，并启用硬件加速后重试。",
      );
    }
    return () => {
      if (value) {
        saveSettings({ ...latest.current, camera: value.snapshot().camera });
        value.destroy();
      }
      engine.current = null;
      delete window.colorLab;
    };
  }, [attempt]);
  useEffect(() => {
    if (engine.current) {
      engine.current.update(settings);
      saveSettings({ ...settings, camera: engine.current.snapshot().camera });
    }
  }, [settings]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const node = dialog.current;
    if (drawer && node && !node.open) node.showModal();
    else if (!drawer && node?.open) node.close();
    wake();
  }, [drawer, wake]);
  useEffect(() => {
    const update = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      if (!document.fullscreenElement)
        fullscreenExitedAt.current = performance.now();
    };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      wake();
      if (event.key === "Escape") {
        if (drawer) {
          setDrawer(false);
          return;
        }
        if (
          event.target instanceof HTMLElement &&
          event.target.closest("input,select,textarea")
        )
          return;
        if (
          !document.fullscreenElement &&
          !fullscreen &&
          performance.now() - fullscreenExitedAt.current > 200 &&
          classroom
        )
          mode(false);
        return;
      }
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            event.target.closest("input,select,textarea")))
      )
        return;
      if (
        (event.key === " " || event.key === "Enter") &&
        event.target instanceof HTMLElement &&
        event.target.closest("button,a,summary")
      )
        return;
      if (drawer) return;
      const key = event.key.toLowerCase();
      if (key === " ") {
        event.preventDefault();
        pause();
      } else if (/^[1-4]$/.test(key)) selectPreset(Number(key) - 1);
      else if (key === "r") engine.current?.resetView();
      else if (key === "f") void toggleFullscreen();
      else if (key === "h") mode(!classroom);
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });
  useEffect(() => {
    wake();
    return () => clearTimeout(idleTimer.current);
  }, [classroom, wake]);
  async function exportImage() {
    if (!engine.current || saving) return;
    setSaving(true);
    try {
      const blob = await engine.current.exportPng(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download =
        "深海水母-" +
        (settings.compare
          ? "左右对照"
          : PRESETS[settings.colors[0].preset].name) +
        ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast("已导出真实画布 PNG，不包含控制面板。");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "导出失败，请重试。");
    } finally {
      setSaving(false);
    }
  }
  function reset() {
    const next = defaultSettings();
    setSettings(next);
    engine.current?.restore();
    setToast("已恢复默认配色、参数和视角。");
  }
  const side = settings.compare ? settings.activeSide : 0,
    color = settings.colors[side],
    preset = PRESETS[color.preset];
  function setColor(
    key: keyof Pick<ColorState, "hue" | "saturation" | "brightness" | "accent">,
    value: number,
  ) {
    change((s) => {
      const colors: [ColorState, ColorState] = [...s.colors];
      const index = s.compare ? s.activeSide : 0;
      colors[index] = { ...colors[index], [key]: value };
      return { ...s, colors };
    });
  }
  const paletteSelect = (index: number) => (
    <label className="lab-side-preset" key={index}>
      {index === 0 ? "A" : "B"}
      <select
        aria-label={(index === 0 ? "A" : "B") + "侧配色方案"}
        value={settings.colors[index].preset}
        onChange={(e) => selectPreset(Number(e.target.value), index)}
      >
        {PRESETS.map((p, n) => (
          <option key={p.name} value={n}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
  const slider = (
    name: string,
    value: number,
    min: number,
    max: number,
    onChange: (n: number) => void,
    unit = "%",
    disabled = false,
  ) => (
    <label className="lab-slider" key={name}>
      <span>
        {name}
        <output>
          {value}
          {unit}
        </output>
      </span>
      <input
        type="range"
        aria-label={name}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
      />
    </label>
  );
  const controls = (
    <div className="lab-settings">
      <header>
        <h2>观察与调色</h2>
        <span>
          {settings.compare
            ? `正在编辑 ${side === 0 ? "A · 左侧" : "B · 右侧"}`
            : "当前画面"}
        </span>
      </header>
      {settings.compare && (
        <div className="lab-side-target" role="group" aria-label="当前编辑目标">
          {[0, 1].map((index) => (
            <button
              key={index}
              aria-pressed={side === index}
              onClick={() =>
                change((s) => ({ ...s, activeSide: index as 0 | 1 }))
              }
            >
              编辑 {index === 0 ? "A · 左侧" : "B · 右侧"}
            </button>
          ))}
        </div>
      )}
      <div className="lab-presets">
        {PRESETS.map((p, n) => (
          <button
            key={p.name}
            aria-pressed={color.preset === n}
            aria-label={p.name}
            onClick={() => selectPreset(n)}
          >
            <span className="lab-mini-swatches" aria-hidden="true">
              {p.colors.map((hex) => (
                <i key={hex} style={{ backgroundColor: hex }} />
              ))}
            </span>
            <strong>{p.name}</strong>
            <small>{p.concept}</small>
          </button>
        ))}
      </div>
      {color.preset === 3 && (
        <button className="lab-gray-return" onClick={() => selectPreset(3)}>
          返回原彩色 · {PRESETS[color.basePreset].name}
        </button>
      )}
      <div className="lab-control-tabs" role="tablist" aria-label="调色设置">
        {[
          ["color", "色彩微调"],
          ["motion", "动态与画质"],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={group === key}
            aria-controls={(drawer ? "drawer-" : "") + "lab-control-" + key}
            id={(drawer ? "drawer-" : "") + "lab-tab-" + key}
            onClick={() => setGroup(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="lab-panel-scroll">
        <section
          role="tabpanel"
          id={(drawer ? "drawer-" : "") + "lab-control-color"}
          aria-labelledby={(drawer ? "drawer-" : "") + "lab-tab-color"}
          hidden={group !== "color"}
        >
          {slider(
            "色相偏移",
            color.hue,
            -180,
            180,
            (value) => setColor("hue", value),
            "°",
          )}
          {slider("饱和度", color.saturation, 0, 150, (value) =>
            setColor("saturation", value),
          )}
          {slider("整体明暗", color.brightness, 30, 170, (value) =>
            setColor("brightness", value),
          )}
          {slider(
            "点缀色面积",
            color.accent,
            0,
            50,
            (value) => setColor("accent", value),
            "%",
            color.basePreset !== 2 || color.preset === 3,
          )}
          <p className="lab-help">
            {color.basePreset === 2 && color.preset !== 3
              ? "改变点缀色粒子比例，形态与粒子总数不变。"
              : "点缀色面积仅在彩色的「暗海微光」中启用。"}
          </p>
        </section>
        <section
          role="tabpanel"
          id={(drawer ? "drawer-" : "") + "lab-control-motion"}
          aria-labelledby={(drawer ? "drawer-" : "") + "lab-tab-motion"}
          hidden={group !== "motion"}
        >
          {slider(
            "呼吸与运动",
            Math.round(settings.speed * 100),
            0,
            150,
            (value) => change((s) => ({ ...s, speed: value / 100 })),
          )}
          {slider(
            "辉光强度",
            Math.round(settings.glow * 100),
            0,
            100,
            (value) => change((s) => ({ ...s, glow: value / 100 })),
          )}
          <label className="lab-quality">
            粒子质量
            <select
              aria-label="粒子质量"
              value={settings.quality}
              onChange={(e) =>
                change((s) => ({
                  ...s,
                  quality: e.target.value as LabSettings["quality"],
                }))
              }
            >
              <option value="low">低 · 约 4.7 万粒子</option>
              <option value="medium">中 · 约 10.9 万粒子</option>
              <option value="high">高 · 约 19.6 万粒子</option>
            </select>
          </label>
          <p className="lab-help">
            两侧共用画质与曝光；教室设备可先选低档。滑杆数值是演示参数，并非感知或物理测量。
          </p>
        </section>
        <p className="lab-question">
          <span>观察一下</span>
          {preset.question}
        </p>
        <details className="lab-notes">
          <summary>色彩课堂笔记</summary>
          <p>{preset.note}</p>
          <p>
            拖动旋转，滚轮缩放，点击画面扰动。空格暂停，1—4 配色，R 重置视角，H
            切换课堂模式，F 全屏。
          </p>
        </details>
      </div>
      <footer>
        <button
          onClick={() => void exportImage()}
          disabled={Boolean(error) || saving}
        >
          {saving ? "正在保存…" : "保存画面"}
        </button>
        <button onClick={reset}>恢复默认</button>
      </footer>
    </div>
  );
  return (
    <div
      className={
        "jellyfish-lab " +
        (classroom ? "is-classroom " : "") +
        (settings.compare ? "is-comparing " : "") +
        (idle && !drawer ? "is-idle" : "")
      }
      ref={root}
      onPointerMove={wake}
      onPointerDown={wake}
      onFocusCapture={wake}
    >
      {!classroom && (
        <div className="lab-experiment-toolbar">
          <button onClick={() => labNavigate(LAB_PATH)}>← 返回实验室</button>
          <span>色彩的奥秘 / 色彩实验室 / 深海水母</span>
          <div>
            <button
              className="lab-mobile-settings"
              onClick={() => setDrawer(true)}
            >
              显示设置
            </button>
            <button onClick={() => mode(true)}>课堂模式 ↗</button>
          </div>
        </div>
      )}
      <div className="lab-workspace">
        <section className="lab-stage" aria-label="水母实时画面">
          <div className="lab-canvas-area">
            <canvas
              key={attempt}
              ref={canvas}
              aria-label="三维水母：拖动旋转、滚轮缩放、点击扰动"
              tabIndex={0}
            />
            <div className="lab-scene-title">
              <span className="lab-eyebrow">实验 01 / 粒子与色彩</span>
              <h1>
                深海水母 <small>色彩的呼吸</small>
              </h1>
            </div>
            {settings.compare && (
              <div className="lab-comparison-labels">
                <span>A · {PRESETS[settings.colors[0].preset].name}</span>
                <span>B · {PRESETS[settings.colors[1].preset].name}</span>
              </div>
            )}
            {error && (
              <div className="lab-render-fallback" role="alert">
                <img src={experiments[0].cover} alt="水母场景的本地静态封面" />
                <div>
                  <p>{error}</p>
                  <button
                    onClick={() => {
                      setError("");
                      setAttempt((n) => n + 1);
                    }}
                  >
                    重试加载
                  </button>
                  <button
                    onClick={() => {
                      change((s) => ({ ...s, quality: "low" }));
                      setError("");
                      setAttempt((n) => n + 1);
                    }}
                  >
                    以低画质重试
                  </button>
                </div>
              </div>
            )}
          </div>
          {!classroom && (
            <div className="lab-scene-caption">
              <strong>
                {settings.compare
                  ? `当前编辑 ${side === 0 ? "A · 左侧" : "B · 右侧"}`
                  : preset.name}
              </strong>
              <div className="lab-real-swatches">
                {swatchColors(color).map((value, n) => (
                  <span key={n} title={value}>
                    <i style={{ backgroundColor: value }} />
                  </span>
                ))}
                <button aria-expanded={hex} onClick={() => setHex((v) => !v)}>
                  HEX {hex ? "−" : "+"}
                </button>
                {hex && <code>{swatchColors(color).join(" / ")}</code>}
              </div>
            </div>
          )}
          <div className="lab-playbar" role="toolbar" aria-label="实验常用操作">
            <button aria-pressed={settings.paused} onClick={pause}>
              {settings.paused ? "继续" : "暂停"}
            </button>
            {classroom && (
              <label className="lab-classroom-preset">
                {settings.compare
                  ? `编辑 ${side === 0 ? "A" : "B"} 配色`
                  : "配色方案"}
                <select
                  aria-label="课堂配色方案"
                  value={color.preset}
                  onChange={(e) => selectPreset(Number(e.target.value))}
                >
                  {PRESETS.map((p, n) => (
                    <option key={p.name} value={n}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button aria-pressed={settings.compare} onClick={compare}>
              左右对照
            </button>
            {settings.compare && (
              <div className="lab-compare-selects">
                {[0, 1].map(paletteSelect)}
              </div>
            )}
            {!classroom && (
              <button onClick={() => engine.current?.resetView()}>
                重置视角
              </button>
            )}
            {classroom && (
              <>
                <button onClick={() => setDrawer(true)}>显示设置</button>
                <button onClick={() => void toggleFullscreen()}>
                  {fullscreen ? "退出全屏" : "全屏"}
                </button>
              </>
            )}
            {classroom && (
              <button className="lab-exit" onClick={() => mode(false)}>
                退出课堂模式
              </button>
            )}
          </div>
        </section>
        {!classroom && (
          <aside className="lab-desktop-settings" aria-label="实验参数">
            {!drawer && controls}
          </aside>
        )}
      </div>
      <dialog
        ref={dialog}
        className="lab-settings-dialog"
        aria-label="显示设置"
        onCancel={() => setDrawer(false)}
        onClose={() => setDrawer(false)}
      >
        <button className="lab-drawer-close" onClick={() => setDrawer(false)}>
          关闭设置 ×
        </button>
        {drawer && controls}
      </dialog>
      {toast && (
        <p className="lab-toast" role="status">
          {toast}
        </p>
      )}
    </div>
  );
}
