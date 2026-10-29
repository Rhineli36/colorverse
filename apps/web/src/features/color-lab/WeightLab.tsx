import { useEffect, useRef, useState } from "react";
import { LAB_PATH, WEIGHT_PATH, labNavigate } from "./lab-navigation";
import {
  readWeight,
  weightDefault,
  weightPaths,
  roundedAreas,
  WEIGHT_NAMES,
  WEIGHT_STORAGE,
  type WeightScene,
} from "./weight-scene";
import { weightAreas, weightPng } from "./weight-raster";
import "./color-lab.css";
import "./weight-lab.css";

function Artwork({ scene, label }: { scene: WeightScene; label: string }) {
  return (
    <svg
      className="weight-art"
      viewBox="0 0 1200 750"
      role="img"
      aria-label={label}
    >
      {weightPaths(scene).map((p, i) => (
        <path key={i} d={p.d} fill={scene.palette[p.color]} />
      ))}
    </svg>
  );
}
function Areas({
  counts,
  scene,
  unavailable = false,
}: {
  counts: number[] | undefined;
  scene: WeightScene;
  unavailable?: boolean;
}) {
  if (!counts)
    return (
      <div className="weight-areas" role="status">
        {unavailable ? "面积暂不可用" : "正在计算可见面积…"}
      </div>
    );
  const values = roundedAreas(counts);
  return (
    <div className="weight-areas" aria-label="实际可见颜色面积">
      <div className="weight-area-bar" aria-hidden="true">
        {values.map((v, i) => (
          <span
            key={i}
            style={{ width: v + "%", background: scene.palette[i] }}
          />
        ))}
      </div>
      <ul>
        {values.map((v, i) => (
          <li key={i}>
            <i style={{ background: scene.palette[i] }} />
            {WEIGHT_NAMES[i]} 约{v.toFixed(1)}%
          </li>
        ))}
      </ul>
    </div>
  );
}
declare global {
  interface Window {
    weightLab?: {
      getSnapshot: () => unknown;
      measure: (width: number) => Promise<number[]>;
    };
  }
}
export default function WeightLab({ classroom }: { classroom: boolean }) {
  const [documentState, setDocument] = useState(readWeight),
    [compare, setCompare] = useState(false),
    [selected, select] = useState<string | null>(null);
  const [measurements, setMeasurements] = useState<{
      key: string;
      counts: number[][];
    } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [exporting, setExporting] = useState(false),
    [attempt, retry] = useState(0);
  const root = useRef<HTMLDivElement>(null),
    latest = useRef(documentState);
  latest.current = documentState;
  const current = documentState.current,
    saved =
      documentState.saved.find((s) => s.id === selected) ??
      documentState.saved.at(-1),
    snapshot = compare ? saved?.scene : undefined;
  const key = JSON.stringify([current, snapshot]);
  useEffect(() => {
    try {
      localStorage.setItem(WEIGHT_STORAGE, JSON.stringify(documentState));
    } catch {
      setNotice("本机存储不可用，本次仍可操作和导出。");
    }
  }, [documentState]);
  useEffect(() => {
    let cancelled = false;
    setError("");
    const timer = setTimeout(() => {
      void Promise.all([
        weightAreas(current),
        ...(snapshot ? [weightAreas(snapshot)] : []),
      ])
        .then((counts) => {
          if (!cancelled) setMeasurements({ key, counts });
        })
        .catch(() => {
          if (!cancelled) setError("可见面积计算失败，请重试。");
        });
    }, 70);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, attempt, current, snapshot]);
  const counts = measurements?.key === key ? measurements.counts : undefined;
  useEffect(() => {
    window.weightLab = {
      getSnapshot: () => ({
        document: structuredClone(latest.current),
        compare,
        selected: saved?.id,
        ready: !!counts,
        counts,
        animationLoops: 0,
      }),
      measure: (width) => weightAreas(latest.current.current, width),
    };
    return () => {
      delete window.weightLab;
    };
  }, [compare, saved?.id, counts]);
  const mode = (value: boolean) =>
    labNavigate(WEIGHT_PATH + (value ? "?mode=classroom" : ""));
  const full = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      setNotice("浏览器未允许全屏，课堂模式仍可使用。");
    }
  };
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && classroom && !document.fullscreenElement)
        mode(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [classroom]);
  function save() {
    const existing = documentState.saved.find(
      (s) => JSON.stringify(s.scene) === JSON.stringify(current),
    );
    if (existing) {
      select(existing.id);
      setCompare(true);
      setNotice("已切换到这份构图的对照。");
      return;
    }
    const id = crypto.randomUUID();
    setDocument((v) => ({
      ...v,
      saved: [...v.saved, { id, scene: structuredClone(v.current) }].slice(-2),
    }));
    select(id);
    setCompare(true);
    setNotice("已保存这份构图，保留最近两份对照。");
  }
  async function exportImage() {
    setExporting(true);
    try {
      const blob = await weightPng(current, snapshot),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = snapshot ? "色彩的分量-左右对照.png" : "色彩的分量.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice("图片导出失败，请重试。");
    } finally {
      setExporting(false);
    }
  }
  return (
    <div
      ref={root}
      className={
        "jellyfish-lab weight-lab " + (classroom ? "is-classroom" : "")
      }
    >
      <div className="lab-experiment-toolbar">
        <button onClick={() => labNavigate(LAB_PATH)}>← 返回实验室</button>
        <span>色彩实验室 / 色彩的分量</span>
        <div>
          {classroom ? (
            <>
              <button onClick={() => void full()}>全屏</button>
              <button onClick={() => mode(false)}>退出课堂模式</button>
            </>
          ) : (
            <button onClick={() => mode(true)}>课堂模式 ↗</button>
          )}
        </div>
      </div>
      <header className="weight-heading">
        <div className="weight-title">
          <div className="weight-title-line">
            <span className="lab-eyebrow">实验 03</span>
            <h1>
              色彩的分量 <small>一室一瓶，同色不同局</small>
            </h1>
          </div>
          <div className="weight-notice" role="status">
            <span>{notice || "固定四种颜色，观察面积与主次的变化。"}</span>
            {notice && (
              <button aria-label="关闭提示" onClick={() => setNotice("")}>
                ×
              </button>
            )}
          </div>
        </div>
        <div className="weight-actions">
          <button className="lab-primary" onClick={save}>
            保存对照
          </button>
          <button
            disabled={!saved}
            aria-pressed={compare}
            onClick={() => setCompare((v) => !v)}
          >
            左右对照
          </button>
          <button disabled={exporting} onClick={() => void exportImage()}>
            {exporting ? "正在导出…" : "导出图片"}
          </button>
        </div>
      </header>
      <div className="weight-workspace">
        <section className="weight-stage" aria-label="静物与对照画面">
          <div className={"weight-scenes " + (snapshot ? "is-pair" : "")}>
            {snapshot && (
              <figure>
                <figcaption>已保存 · 窗帘展开 {snapshot.curtain}%</figcaption>
                <div className="weight-picture">
                  <Artwork scene={snapshot} label="已保存的窗边花瓶" />
                </div>
                <Areas
                  scene={snapshot}
                  counts={counts?.[1]}
                  unavailable={!!error}
                />
              </figure>
            )}
            <figure>
              <figcaption>
                {snapshot ? "当前 · " : "窗边的花瓶 · "}窗帘展开{" "}
                {current.curtain}%
              </figcaption>
              <div className="weight-picture">
                <Artwork scene={current} label="当前窗边花瓶" />
              </div>
              <Areas
                scene={current}
                counts={counts?.[0]}
                unavailable={!!error}
              />
            </figure>
          </div>
          {error ? (
            <div role="alert">
              {error}
              <button onClick={() => retry((n) => n + 1)}>重新计算</button>
            </div>
          ) : (
            <p className="weight-footnote">
              <strong>观察：你的目光先落在哪里？</strong>
              <span>
                按插画可见面积近似统计，合计100%；不含界面与画布外留白。
              </span>
            </p>
          )}
        </section>
        <aside className="weight-settings">
          <section>
            <h2>
              固定配色 <span className="weight-locked">已锁定</span>
            </h2>
            <div className="weight-palette">
              {current.palette.map((c, i) => (
                <div key={c}>
                  <i style={{ background: c }} />
                  <span>{WEIGHT_NAMES[i]}</span>
                  <code>{c}</code>
                </div>
              ))}
            </div>
          </section>
          <section>
            <label className="weight-slider" htmlFor="curtain-width">
              窗帘展开 <output>{current.curtain}%</output>
            </label>
            <input
              id="curtain-width"
              type="range"
              min="12"
              max="48"
              step="1"
              value={current.curtain}
              onChange={(e) => {
                const curtain = +e.target.value;
                setDocument((v) => ({
                  ...v,
                  current: { ...v.current, curtain },
                }));
              }}
            />
            <div className="weight-range-labels" aria-hidden="true">
              <span>12% · 较少</span>
              <span>48% · 较多</span>
            </div>
            <p>展开比例表示窗帘宽度，颜色面积另行统计。</p>
            <button
              onClick={() =>
                setDocument((v) => ({ ...v, current: weightDefault() }))
              }
            >
              重置当前画面
            </button>
          </section>
          <section>
            <h3>已保存的对照</h3>
            {!documentState.saved.length ? (
              <p>保存一份构图，再移动窗帘，观察画面的主次变化。</p>
            ) : (
              <div className="weight-saved-grid">
                {documentState.saved.map((s, i) => (
                  <button
                    className="weight-saved"
                    key={s.id}
                    aria-pressed={saved?.id === s.id && compare}
                    onClick={() => {
                      select(s.id);
                      setCompare(true);
                    }}
                  >
                    <Artwork scene={s.scene} label={`对照${i + 1}`} />
                    <span>
                      对照 {i + 1} · 窗帘 {s.scene.curtain}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
