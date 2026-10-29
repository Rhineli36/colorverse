import { useEffect, useRef, useState } from "react";
import { createTreeRenderer, treeColor } from "./tree-renderer";
import {
  readTree,
  saveTree,
  treeDefaults,
  treeMode,
  seasonPalette,
  SEASONS,
  TreeSchema,
  type TreeSettings,
  type TreePalette,
} from "./tree-state";
import { LAB_PATH, TREE_PATH, labNavigate } from "./lab-navigation";
import "./color-lab.css";
type Engine = ReturnType<typeof createTreeRenderer>;
declare global {
  interface Window {
    treeLab?: { getSnapshot: () => ReturnType<Engine["snapshot"]> };
  }
}
export default function TreeLab({ classroom }: { classroom: boolean }) {
  const [s, set] = useState(readTree),
    latest = useRef(s),
    camera = useRef(s.camera),
    engine = useRef<Engine | null>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    root = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    file = useRef<HTMLInputElement>(null);
  const [drawer, open] = useState(false),
    [error, fail] = useState(""),
    [attempt, retry] = useState(0),
    [message, notify] = useState(""),
    [labeled, label] = useState(false),
    [part, selectPart] = useState("树冠");
  latest.current = s;
  const side = s.compare ? s.activeSide : 0,
    p = s.palettes[side];
  const change = (patch: Partial<TreeSettings>) =>
    set((v) => ({ ...v, ...patch }));
  const palette = (patch: Partial<TreePalette>) =>
    set((v) => {
      const palettes: [TreePalette, TreePalette] = [...v.palettes];
      const i = v.compare ? v.activeSide : 0;
      palettes[i] = { ...palettes[i], ...patch };
      return { ...v, palettes };
    });
  useEffect(() => {
    let e: Engine | undefined;
    try {
      e = createTreeRenderer(
        canvas.current!,
        { ...latest.current, camera: camera.current },
        (c) => {
          camera.current = c;
          saveTree({ ...latest.current, camera: c });
        },
        () => fail("显卡画面中断，请重试或改用低画质。"),
      );
      engine.current = e;
      window.treeLab = { getSnapshot: () => e!.snapshot() };
      fail("");
    } catch {
      fail("无法启动 WebGL 2，请启用浏览器硬件加速后重试。");
    }
    return () => {
      if (e) {
        saveTree({ ...latest.current, camera: e.snapshot().camera });
        e.destroy();
      }
      delete window.treeLab;
      engine.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    engine.current?.update(s);
    saveTree({ ...s, camera: camera.current });
  }, [s]);
  useEffect(() => {
    if (drawer && !dialog.current?.open) dialog.current?.showModal();
    else if (!drawer && dialog.current?.open) dialog.current.close();
  }, [drawer]);
  const mode = (value: boolean) => {
    open(false);
    labNavigate(TREE_PATH + (value ? "?mode=classroom" : ""));
  };
  const full = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      notify("此浏览器未允许全屏，课堂模式仍可使用。");
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.repeat ||
        (e.target instanceof HTMLElement &&
          e.target.closest("input,select,textarea,button,summary"))
      )
        return;
      if (e.key === " ") {
        e.preventDefault();
        if (s.mode !== "context") change({ paused: !s.paused });
      }
      if (e.key.toLowerCase() === "r") engine.current?.resetView();
      if (e.key.toLowerCase() === "h") mode(!classroom);
      if (e.key.toLowerCase() === "f") void full();
      if (e.key === "Escape" && !document.fullscreenElement && !drawer)
        mode(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function restore() {
    const d = treeDefaults();
    camera.current = d.camera;
    set(d);
    engine.current?.resetView();
    notify("已恢复默认秋日配色。");
  }
  const controls = (
    <div className="lab-settings tree-settings">
      <header>
        <h2>观察与调色</h2>
        <small>
          {s.compare ? `编辑 ${side === 0 ? "A" : "B"}` : "受控比较"}
        </small>
      </header>
      <div className="lab-control-tabs" role="tablist" aria-label="树教学模式">
        {[
          ["season", "四季调色"],
          ["context", "同色异境"],
          ["free", "自由调色"],
        ].map(([v, n]) => (
          <button
            key={v}
            role="tab"
            aria-selected={s.mode === v}
            onClick={() => set((vv) => treeMode(vv, v as TreeSettings["mode"]))}
          >
            {n}
          </button>
        ))}
      </div>
      {s.compare && s.mode !== "context" && (
        <div className="lab-side-target">
          {[0, 1].map((i) => (
            <button
              key={i}
              aria-pressed={side === i}
              onClick={() => change({ activeSide: i as 0 | 1 })}
            >
              编辑 {i === 0 ? "A" : "B"}
            </button>
          ))}
        </div>
      )}
      <div className="lab-panel-scroll">
        {s.mode !== "context" && (
          <div className="lab-presets">
            {SEASONS.map((v, i) => (
              <button
                key={v.name}
                aria-pressed={p.season === i}
                onClick={() => palette(seasonPalette(i))}
              >
                <span className="lab-mini-swatches">
                  {v.colors.map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </span>
                <strong>{v.name}</strong>
              </button>
            ))}
          </div>
        )}
        {s.mode === "season" && (
          <>
            {(["hue", "saturation", "brightness", "accent"] as const).map(
              (k, i) => (
                <label className="lab-slider" key={k}>
                  <span>
                    {["色相偏移", "饱和度", "整体明暗", "点缀色面积"][i]}
                    <output>
                      {p[k]}
                      {i === 0 ? "°" : "%"}
                    </output>
                  </span>
                  <input
                    aria-label={
                      ["色相偏移", "饱和度", "整体明暗", "点缀色面积"][i]
                    }
                    type="range"
                    min={i === 0 ? -180 : i === 2 ? 30 : 0}
                    max={i === 0 ? 180 : i === 2 ? 170 : i === 3 ? 50 : 150}
                    value={p[k]}
                    onChange={(e) =>
                      palette({
                        [k]: +e.target.value,
                        ...(k === "accent"
                          ? {
                              auxiliary: Math.min(
                                p.auxiliary,
                                100 - +e.target.value,
                              ),
                            }
                          : {}),
                      })
                    }
                  />
                </label>
              ),
            )}
            <p className="lab-help">
              主色 {p.colors[0]} · 点缀 {p.colors[2]}
            </p>
            <p>✓ 锁定形态与光照</p>
          </>
        )}
        {s.mode === "context" && (
          <>
            <p>目标色已锁定 · 同位置扁平叶形教学色片</p>
            <label>
              目标颜色
              <input
                aria-label="目标颜色"
                type="color"
                value={s.target}
                onChange={(e) => change({ target: e.target.value })}
              />
            </label>
            {[0, 1].map((i) => (
              <fieldset key={i}>
                <legend>{i === 0 ? "A" : "B"} 周围颜色</legend>
                {(["colors", "background"] as const).map((k, j) => (
                  <label key={k}>
                    {j === 0 ? "树冠" : "背景"}
                    <input
                      aria-label={`${i === 0 ? "A" : "B"}${j === 0 ? "周围树冠" : "背景"}`}
                      type="color"
                      value={
                        j === 0
                          ? s.palettes[i].colors[0]
                          : s.palettes[i].background
                      }
                      onChange={(e) =>
                        set((v) => {
                          const palettes: [TreePalette, TreePalette] =
                            structuredClone(v.palettes);
                          if (j === 0)
                            palettes[i].colors = [
                              e.target.value,
                              e.target.value,
                              e.target.value,
                            ];
                          else palettes[i].background = e.target.value;
                          return { ...v, palettes };
                        })
                      }
                    />
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="lab-card-actions">
              {[
                ["冷暖背景", "#243B63", "#AD6948"],
                ["深浅背景", "#16202B", "#D9D6C9"],
              ].map(([n, a, b]) => (
                <button
                  key={n}
                  onClick={() =>
                    set((v) => ({
                      ...v,
                      palettes: [
                        {
                          ...v.palettes[0],
                          background: a,
                          colors: ["#376B94", "#376B94", "#376B94"],
                        },
                        {
                          ...v.palettes[1],
                          background: b,
                          colors: ["#B57844", "#B57844", "#B57844"],
                        },
                      ],
                    }))
                  }
                >
                  {n}
                </button>
              ))}
            </div>
            <button onClick={() => change({ reveal: !s.reveal })}>
              {s.reveal ? "隐藏色值" : "揭示色值"}
            </button>
            {s.reveal && (
              <p>
                A目标色 {s.target.toUpperCase()}
                <br />
                B目标色 {s.target.toUpperCase()}
              </p>
            )}
            <button onClick={() => change({ extract: !s.extract })}>
              {s.extract ? "返回树场景" : "提取目标色"}
            </button>
            <p className="lab-help">
              目标色片不受灯光、雾和透明混合影响；相机与风动固定。
            </p>
          </>
        )}
        {s.mode === "free" && (
          <>
            <h3>创造你的第五季</h3>
            <label>
              方案名称
              <input
                aria-label="方案名称"
                value={s.name}
                maxLength={60}
                onChange={(e) => change({ name: e.target.value })}
              />
            </label>
            <div className="tree-parts">
              {["树冠", "枝干", "地面", "背景"].map((n) => (
                <button
                  key={n}
                  aria-pressed={part === n}
                  onClick={() => selectPart(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            {part === "树冠" ? (
              <>
                {p.colors.map((c, i) => (
                  <label key={i}>
                    {["主色", "辅助色", "点缀色"][i]}
                    <input
                      aria-label={["树冠主色", "树冠辅助色", "树冠点缀色"][i]}
                      type="color"
                      value={c}
                      onChange={(e) => {
                        const colors: [string, string, string] = [...p.colors];
                        colors[i] = e.target.value;
                        palette({ colors });
                      }}
                    />
                  </label>
                ))}
                <label className="lab-slider">
                  辅助色 {p.auxiliary}%
                  <input
                    aria-label="辅助色比例"
                    type="range"
                    min="0"
                    max={100 - p.accent}
                    value={p.auxiliary}
                    onChange={(e) => palette({ auxiliary: +e.target.value })}
                  />
                </label>
                <label className="lab-slider">
                  点缀色 {p.accent}%
                  <input
                    aria-label="点缀色比例"
                    type="range"
                    min="0"
                    max={Math.min(50, 100 - p.auxiliary)}
                    value={p.accent}
                    onChange={(e) => palette({ accent: +e.target.value })}
                  />
                </label>
                <p>
                  主色 {100 - p.accent - p.auxiliary}% · 辅助 {p.auxiliary}% ·
                  点缀 {p.accent}%
                </p>
              </>
            ) : (
              <label>
                {part}颜色
                <input
                  aria-label={part + "颜色"}
                  type="color"
                  value={
                    p[
                      part === "枝干"
                        ? "bark"
                        : part === "地面"
                          ? "ground"
                          : "background"
                    ]
                  }
                  onChange={(e) =>
                    palette({
                      [part === "枝干"
                        ? "bark"
                        : part === "地面"
                          ? "ground"
                          : "background"]: e.target.value,
                    })
                  }
                />
              </label>
            )}
            <div className="lab-card-actions">
              <button
                onClick={() => {
                  saveTree({ ...s, camera: camera.current });
                  localStorage.setItem(
                    "colorverse.tree.saved.v1",
                    JSON.stringify({ ...s, camera: camera.current }),
                  );
                  notify("方案已保存到本机。");
                }}
              >
                保存方案
              </button>
              <button
                onClick={() => {
                  const parsed = TreeSchema.safeParse(
                    JSON.parse(
                      localStorage.getItem("colorverse.tree.saved.v1") ??
                        "null",
                    ),
                  );
                  if (!parsed.success) {
                    notify("还没有保存的方案。");
                    return;
                  }
                  const v = parsed.data;
                  camera.current = v.camera;
                  set(v);
                  retry((n) => n + 1);
                }}
              >
                加载方案
              </button>
              <button
                onClick={() =>
                  download(
                    new Blob(
                      [
                        JSON.stringify(
                          { ...s, camera: camera.current },
                          null,
                          2,
                        ),
                      ],
                      { type: "application/json" },
                    ),
                    "色彩之树-方案.json",
                  )
                }
              >
                导出 JSON
              </button>
              <button onClick={() => file.current?.click()}>导入 JSON</button>
            </div>
          </>
        )}
        <details>
          <summary>动态与画质</summary>
          <label className="lab-slider">
            微风 {s.wind}%
            <input
              aria-label="微风"
              disabled={s.mode === "context"}
              type="range"
              min="0"
              max="100"
              value={s.wind}
              onChange={(e) => change({ wind: +e.target.value })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              disabled={s.mode === "context"}
              checked={s.orbit}
              onChange={(e) => change({ orbit: e.target.checked })}
            />
            自动环绕（默认关闭）
          </label>
          <label>
            画质
            <select
              aria-label="树画质"
              disabled={s.compare}
              value={s.quality}
              onChange={(e) =>
                change({ quality: e.target.value as TreeSettings["quality"] })
              }
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
          <p className="lab-help">
            受控对照期间锁定画质；质量只改变分辨率，保留全部叶片 ID。
          </p>
        </details>
        <p className="lab-question">
          {s.mode === "context"
            ? "两侧目标叶片的实际颜色相同，你看到的感觉是否相同？"
            : SEASONS[p.season].question}
        </p>
        <details>
          <summary>色彩课堂笔记</summary>
          <p>
            比较前保持形态、叶片、相机、光源和曝光一致。颜色与情绪的联想因人和情境而异。本版只开放受控比较，不提供艺术演绎。
          </p>
        </details>
        <label>
          <input
            type="checkbox"
            checked={labeled}
            onChange={(e) => label(e.target.checked)}
          />
          PNG 带方案名称与色标信息
        </label>
      </div>
      <footer>
        <button
          disabled={!!error}
          onClick={async () => {
            try {
              download(await engine.current!.png(labeled), "色彩之树.png");
            } catch {
              notify("画面导出失败，请重试。");
            }
          }}
        >
          保存画面
        </button>
        <button onClick={restore}>恢复默认</button>
      </footer>
    </div>
  );
  return (
    <div
      ref={root}
      className={
        "jellyfish-lab tree-lab " +
        (classroom ? "is-classroom " : "") +
        (s.compare ? "is-comparing" : "")
      }
    >
      {!classroom && (
        <div className="lab-experiment-toolbar">
          <button onClick={() => labNavigate(LAB_PATH)}>← 返回实验室</button>
          <span>色彩实验室 / 色彩之树</span>
          <div>
            <button className="lab-mobile-settings" onClick={() => open(true)}>
              显示设置
            </button>
            <button onClick={() => mode(true)}>课堂模式 ↗</button>
          </div>
        </div>
      )}
      <div className="lab-workspace">
        <section className="lab-stage">
          <div className="lab-canvas-area">
            <canvas
              key={attempt}
              ref={canvas}
              tabIndex={0}
              aria-label="色彩之树三维画布"
            />
            <div className="lab-scene-title">
              <span className="lab-eyebrow">EXPERIMENT 02</span>
              <h1>
                色彩之树<small>一树四季 · 色彩的气候</small>
              </h1>
            </div>
            {s.compare && (
              <div className="lab-comparison-labels">
                <span>A{s.mode === "context" ? " · 目标色已锁定" : ""}</span>
                <span>B{s.mode === "context" ? " · 目标色已锁定" : ""}</span>
              </div>
            )}
            {error && (
              <div className="lab-render-fallback" role="alert">
                <img
                  src={import.meta.env.BASE_URL + "color-lab/tree-cover.webp"}
                  alt="三维树场景封面"
                />
                <div>
                  <p>{error}</p>
                  <button onClick={() => retry((v) => v + 1)}>重试加载</button>
                  <button
                    onClick={() => {
                      change({ quality: "low" });
                      retry((v) => v + 1);
                    }}
                  >
                    低画质重试
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="lab-scene-caption">
            <span>{s.mode === "free" ? s.name : SEASONS[p.season].name}</span>
            <div className="lab-real-swatches">
              {p.colors.map((c, i) => (
                <i
                  key={i}
                  style={{ background: "#" + treeColor(c, p).getHexString() }}
                  title={"#" + treeColor(c, p).getHexString()}
                />
              ))}
            </div>
          </div>
          <div className="lab-playbar">
            <button
              disabled={s.mode === "context"}
              aria-pressed={s.paused}
              onClick={() => change({ paused: !s.paused })}
            >
              {s.paused ? "继续" : "暂停"}
            </button>
            <button
              disabled={s.mode === "context"}
              aria-pressed={s.compare}
              onClick={() => change({ compare: !s.compare, activeSide: 0 })}
            >
              左右对照
            </button>
            <button
              disabled={s.mode === "context"}
              onClick={() => engine.current?.resetView()}
            >
              重置视角
            </button>
            {classroom && (
              <>
                <select
                  aria-label="课堂树模式"
                  value={s.mode}
                  onChange={(e) =>
                    set((v) =>
                      treeMode(v, e.target.value as TreeSettings["mode"]),
                    )
                  }
                >
                  <option value="season">四季调色</option>
                  <option value="context">同色异境</option>
                  <option value="free">自由调色</option>
                </select>
                <button onClick={() => open(true)}>显示设置</button>
                <button onClick={() => void full()}>全屏</button>
                <button onClick={() => mode(false)}>退出课堂模式</button>
              </>
            )}
          </div>
        </section>
        {!classroom && (
          <aside className="lab-desktop-settings">{!drawer && controls}</aside>
        )}
      </div>
      <dialog
        ref={dialog}
        className="lab-settings-dialog"
        onCancel={() => open(false)}
      >
        <button onClick={() => open(false)}>关闭设置 ×</button>
        {drawer && controls}
      </dialog>
      <input
        hidden
        ref={file}
        type="file"
        accept=".json"
        aria-label="导入树方案文件"
        onChange={async (e) => {
          try {
            const f = e.target.files?.[0];
            if (!f || f.size > 20000) throw Error();
            const v = TreeSchema.parse(JSON.parse(await f.text()));
            camera.current = v.camera;
            set(v);
            retry((n) => n + 1);
            notify("方案已导入。");
          } catch {
            notify("方案无效：请使用版本 1 的完整参数 JSON。");
          }
          e.target.value = "";
        }}
      />
      {message && (
        <button className="lab-toast" onClick={() => notify("")}>
          {message} ×
        </button>
      )}
    </div>
  );
}
