import { useState, useEffect, useRef } from "react";
import {
  CloudPlanetPresets,
  type CloudPlanetDocumentSchema,
  type GrowthPresetIds,
} from "@colorverse/contracts";
import type { z } from "zod";
import { ColorCardPicker } from "./ColorCardPicker";
import { blankIntent } from "./LearningPanels";
import { CloudAtmosphere } from "./CloudStudentGuide";
import { GrowthPresetPreview } from "../studio/GrowthPresetPreview";
import "./planet-design.css";
import { FramedImage } from "./FramedImage";
import { resetImagePlacement } from "@colorverse/contracts";
export type DesignDocument = z.infer<typeof CloudPlanetDocumentSchema>;
export type DesignElement = {
  id: string;
  title: string;
  presetId: (typeof GrowthPresetIds)[number];
  color?: string;
  params?: { x: number; y: number; size: number; motion: string };
  revision?: number;
};
export function PlanetDesignEditor({
  document,
  onChange,
  exterior,
  interior,
  elements = [],
  onElementChange,
  onFile,
  onTemplate,
  onSave,
  onClose,
  busy,
  dirty,
  status,
  initialTab = "exterior",
}: {
  document: DesignDocument;
  onChange: (d: DesignDocument) => void;
  exterior: string;
  interior: string;
  elements?: DesignElement[];
  onElementChange?: (e: DesignElement) => void;
  onFile: (kind: "exterior" | "interior", file: File) => void;
  onTemplate: (skin: number) => void;
  onSave: () => void;
  onClose: () => void;
  busy: boolean;
  dirty: boolean;
  status?: string;
  initialTab?: "exterior" | "interior";
}) {
  const [tab, setTab] = useState(initialTab),
    [profile, setProfile] = useState(false),
    [elementId, setElementId] = useState(elements[0]?.id ?? ""),
    [failed, setFailed] = useState(false);
  const profileDialog = useRef<HTMLDialogElement>(null);
  const current = useRef(document);
  current.current = document;
  const d = document,
    view = d.interiorView,
    element = elements.find((e) => e.id === elementId);
  const patch = (p: Partial<DesignDocument>) => {
    const next = { ...current.current, ...p };
    current.current = next;
    onChange(next);
  };
  useEffect(() => {
    if (profile) profileDialog.current?.showModal();
  }, [profile]);
  useEffect(() => {
    setFailed(false);
  }, [exterior, interior, tab]);
  const leave = () => {
    if (!dirty || window.confirm("还有未保存的修改，确定离开吗？")) onClose();
  };
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const range = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    change: (n: number) => void,
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={busy}
        onChange={(e) => change(Number(e.target.value))}
      />
      <output>{Math.round(value * 100)}%</output>
    </label>
  );
  return (
    <section className="planet-design-editor" aria-label="编辑星球">
      <header className="design-title">
        <div>
          <p className="eyebrow">COLORVERSE</p>
          <h1>
            编辑星球 <small>｜ {d.metadata.name}</small>
          </h1>
        </div>
        <div className="row-buttons">
          <button onClick={() => setProfile(true)}>星球资料</button>
          <button disabled={busy} onClick={leave}>
            返回宇宙
          </button>
        </div>
      </header>
      <div className="design-tabs" role="tablist" aria-label="编辑对象">
        <button
          role="tab"
          aria-selected={tab === "exterior"}
          onClick={() => setTab("exterior")}
        >
          星球外观
        </button>
        <button
          role="tab"
          aria-selected={tab === "interior"}
          onClick={() => setTab("interior")}
        >
          内部背景
        </button>
      </div>
      <div className="design-columns">
        <aside
          className="design-settings design-panel"
          aria-label={tab === "exterior" ? "外观设置" : "内部设置"}
        >
          <h2>{tab === "exterior" ? "外观设置" : "内部设置"}</h2>
          {tab === "exterior" ? (
            <>
              <label>星球模板</label>
              <div className="design-templates">
                {CloudPlanetPresets.map((p, i) => (
                  <button
                    key={p.name}
                    aria-label={`默认星球 ${i + 1}`}
                    aria-pressed={d.skin === i}
                    disabled={busy}
                    onClick={() => onTemplate(i)}
                  >
                    <img
                      src={`${import.meta.env.BASE_URL}demo/v2/body-${i}.webp`}
                      alt=""
                    />
                    <span>{p.name}</span>
                    {d.skin === i && <b>✓</b>}
                  </button>
                ))}
              </div>
              <label>
                上传星球外观
                <input
                  aria-label="上传星球外貌"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) =>
                    e.target.files?.[0] && onFile("exterior", e.target.files[0])
                  }
                />
              </label>
              <label>
                光晕效果
                <select
                  aria-label="光晕效果"
                  value={d.halo}
                  onChange={(e) =>
                    patch({ halo: e.target.value as DesignDocument["halo"] })
                  }
                >
                  <option value="none">无</option>
                  <option value="soft">柔光</option>
                  <option value="ring">星环</option>
                </select>
              </label>
              {range("光晕强度", d.haloIntensity, 0, 1, 0.05, (n) =>
                patch({ haloIntensity: n }),
              )}
              <label>
                运行速度
                <select
                  aria-label="星球运行速度"
                  value={d.motion.mode}
                  onChange={(e) =>
                    patch({
                      motion: {
                        ...d.motion,
                        mode: e.target
                          .value as DesignDocument["motion"]["mode"],
                      },
                    })
                  }
                >
                  <option value="stationary">静止</option>
                  <option value="slow">缓慢</option>
                  <option value="fast">快速</option>
                </select>
              </label>
              <label>
                运行轨迹
                <select
                  aria-label="运行轨迹"
                  value={d.motion.trajectory}
                  onChange={(e) =>
                    patch({
                      motion: {
                        ...d.motion,
                        trajectory: e.target
                          .value as DesignDocument["motion"]["trajectory"],
                      },
                    })
                  }
                >
                  <option value="ellipse">椭圆</option>
                  <option value="circle">圆形</option>
                  <option value="figure-eight">八字</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                背景图片
                <input
                  aria-label="上传内部背景"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) =>
                    e.target.files?.[0] && onFile("interior", e.target.files[0])
                  }
                />
              </label>
              <fieldset>
                <legend>内部图层</legend>
                {(
                  [
                    ["backgroundVisible", "背景原图"],
                    ["particlesVisible", "氛围粒子"],
                    ["elementsVisible", "作品成长元素"],
                  ] as const
                ).map(([key, label]) => (
                  <label className="layer-toggle" key={key}>
                    <input
                      type="checkbox"
                      checked={view[key]}
                      onChange={(e) =>
                        patch({
                          interiorView: { ...view, [key]: e.target.checked },
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <label>
                粒子氛围
                <select
                  aria-label="粒子氛围"
                  value={d.atmosphere}
                  onChange={(e) =>
                    patch({
                      atmosphere: e.target
                        .value as DesignDocument["atmosphere"],
                    })
                  }
                >
                  <option value="none">无</option>
                  <option value="stardust">星尘微光</option>
                  <option value="fireflies">萤火</option>
                </select>
              </label>
              {range("环境光强度", view.environmentLight, 0, 1, 0.05, (n) =>
                patch({ interiorView: { ...view, environmentLight: n } }),
              )}
              {range("背景亮度", view.brightness, 0.5, 1.5, 0.05, (n) =>
                patch({ interiorView: { ...view, brightness: n } }),
              )}
              {range("背景饱和度", view.saturation, 0, 2, 0.05, (n) =>
                patch({ interiorView: { ...view, saturation: n } }),
              )}
              {elements.length > 0 && (
                <>
                  <label>
                    作品成长元素
                    <select
                      aria-label="选择内部元素"
                      value={elementId}
                      onChange={(e) => setElementId(e.target.value)}
                    >
                      {elements.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {element && onElementChange && (
                    <>
                      <label>
                        元素颜色
                        <input
                          type="color"
                          aria-label="内部元素颜色"
                          value={element.color ?? d.color}
                          onChange={(e) =>
                            onElementChange({
                              ...element,
                              color: e.target.value,
                            })
                          }
                        />
                      </label>
                      {range(
                        "元素大小",
                        element.params?.size ?? 0.9,
                        0.3,
                        1.5,
                        0.05,
                        (n) =>
                          onElementChange({
                            ...element,
                            params: {
                              x: 0.5,
                              y: 0.5,
                              motion: "float",
                              ...element.params,
                              size: n,
                            },
                          }),
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </aside>
        <section className="design-preview design-panel" aria-label="实时预览">
          <h2>{tab === "exterior" ? "外观实时预览" : "内部实时预览"}</h2>
          <p>
            {tab === "exterior" ? "在宇宙中看到的样子" : "进入星球后看到的样子"}
          </p>
          <div
            className={`design-preview-stage ${tab === "exterior" ? "exterior-preview" : "interior-preview"}`}
            style={
              {
                "--preview-color": d.color,
                "--halo-strength": d.haloIntensity,
                "--ambient-strength": view.environmentLight,
              } as React.CSSProperties
            }
          >
            {tab === "exterior" ? (
              <div
                className={`design-orb motion-${d.motion.mode} halo-${d.halo}`}
              >
                <FramedImage
                  round
                  editing={!busy && !exterior.includes("/demo/")}
                  color={d.color}
                  placement={d.imagePlacement.exterior}
                  onChange={(exterior) =>
                    patch({ imagePlacement: { ...d.imagePlacement, exterior } })
                  }
                  src={exterior}
                  alt="星球实时预览"
                  onError={() => setFailed(true)}
                />
                <strong>{d.metadata.name}</strong>
              </div>
            ) : (
              <>
                {view.backgroundVisible && (
                  <FramedImage
                    editing={!busy && !interior.includes("/demo/")}
                    color={d.color}
                    className="design-room-adjustment"
                    placement={d.imagePlacement.interior}
                    onChange={(interior) =>
                      patch({
                        imagePlacement: { ...d.imagePlacement, interior },
                      })
                    }
                    src={interior}
                    style={{
                      objectFit: view.fit,
                      filter: `brightness(${view.brightness}) saturate(${view.saturation})`,
                    }}
                    alt="内部背景实时预览"
                    onError={() => setFailed(true)}
                  />
                )}
                <div className="design-ambient" />
                {view.particlesVisible && (
                  <CloudAtmosphere kind={d.atmosphere} />
                )}
                {view.elementsVisible &&
                  elements.map((e, i) => (
                    <button
                      className={`design-element ${elementId === e.id ? "selected" : ""}`}
                      key={e.id}
                      aria-label={`预览元素 ${e.title}`}
                      onClick={() => setElementId(e.id)}
                      style={{
                        left: `${(e.params?.x ?? 0.2 + i * 0.12) * 100}%`,
                        top: `${(e.params?.y ?? 0.5) * 100}%`,
                        width: 70 * (e.params?.size ?? 0.9),
                        height: 70 * (e.params?.size ?? 0.9),
                      }}
                    >
                      <GrowthPresetPreview
                        id={e.presetId}
                        color={e.color ?? d.color}
                      />
                    </button>
                  ))}
              </>
            )}
            {failed && (
              <p className="design-image-error" role="alert">
                图片暂时未能显示，请重新选择或重试。
              </p>
            )}
          </div>
          <button
            className="image-reset"
            disabled={busy}
            onClick={() =>
              patch({
                imagePlacement: {
                  ...d.imagePlacement,
                  [tab]: resetImagePlacement(),
                },
              })
            }
          >
            复位
          </button>
          <p className="design-preview-note">
            {tab === "exterior"
              ? "选择模板、色彩或细节，即时查看变化"
              : "背景保留原色，主题色用于边缘环境光与装饰"}
          </p>
        </section>
        <aside className="design-colors design-panel" aria-label="情感色板">
          <h2>
            情感色卡 <small>23 色 · 直接点选</small>
          </h2>
          <ColorCardPicker
            color={d.color}
            referenceCaseId={d.learningIntent?.referenceCaseId}
            onColor={(color) => patch({ color })}
            onReference={(referenceCaseId) =>
              patch({
                learningIntent: {
                  ...(current.current.learningIntent ?? blankIntent()),
                  referenceCaseId,
                },
              })
            }
            mood={d.learningIntent?.customMood ?? ""}
            onMood={(customMood) =>
              patch({
                learningIntent: {
                  ...(d.learningIntent ?? blankIntent()),
                  customMood,
                },
              })
            }
          />
        </aside>
      </div>
      <footer className="design-save">
        <span role="status">
          {status || (dirty ? "● 有未保存的修改" : "已保存")}
        </span>
        <div className="row-buttons">
          <button disabled={busy} onClick={leave}>
            取消
          </button>
          <button
            className="primary"
            disabled={busy || !d.metadata.name.trim()}
            onClick={onSave}
          >
            {busy ? "正在保存…" : "保存并返回我的星球"}
          </button>
        </div>
      </footer>
      {profile && (
        <dialog
          ref={profileDialog}
          className="design-profile"
          aria-label="星球资料"
          onCancel={() => setProfile(false)}
        >
          <h2>星球资料</h2>
          {(
            [
              ["name", "星球名称", 60],
              ["summary", "星球寄语", 1000],
              ["reflection", "创作碎碎念", 1500],
              ["courseNotes", "关于这堂色彩课", 1000],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key}>
              {label}
              {key === "name" ? (
                <input
                  aria-label={label}
                  value={d.metadata[key] ?? ""}
                  maxLength={max}
                  onChange={(e) =>
                    patch({
                      metadata: { ...d.metadata, [key]: e.target.value },
                    })
                  }
                />
              ) : (
                <textarea
                  aria-label={label}
                  rows={3}
                  value={d.metadata[key] ?? ""}
                  maxLength={max}
                  onChange={(e) =>
                    patch({
                      metadata: { ...d.metadata, [key]: e.target.value },
                    })
                  }
                />
              )}
            </label>
          ))}
          <button onClick={() => setProfile(false)}>完成资料编辑</button>
        </dialog>
      )}
    </section>
  );
}
