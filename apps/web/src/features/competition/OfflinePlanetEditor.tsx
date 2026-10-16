import { useEffect, useRef, useState } from "react";
import {
  cloudPlanetFromPreset,
  CloudPlanetPresets,
  type EmotionCase,
} from "@colorverse/contracts";
import { ColorCardPicker } from "../classroom/ColorCardPicker";
import { prepareImage } from "../../adapters/local/images";
import { blankIntent } from "../classroom/LearningPanels";
import type { ExperiencePlanetData } from "./competition-model";
export async function importOfflineImage(file: File) {
  const prepared = await prepareImage(file, "本机创作者");
  const path =
    prepared.record.variants.find((v) => v.kind === "display")?.path ??
    prepared.record.original.path;
  return {
    key: "local:" + prepared.record.assetId,
    blob: prepared.files.get(path)!,
    original: file,
  };
}
export function OfflinePlanetEditor({
  planet,
  initialCase,
  onSave,
  onClose,
  busy,
  resolveImage,
  onDirtyChange,
}: {
  planet: ExperiencePlanetData | null;
  initialCase?: EmotionCase;
  onSave: (p: ExperiencePlanetData, m: Map<string, Blob>) => Promise<void>;
  onClose: () => void;
  busy: boolean;
  resolveImage?: (key: string) => string | undefined;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const original = useRef(planet),
    [draft, setDraft] = useState<ExperiencePlanetData>(() =>
      structuredClone(
        planet ?? {
          id: "my-offline-planet",
          display_name: "我的创作",
          document: cloudPlanetFromPreset(0),
          sent: 0,
          received: 0,
          works: [],
          visible: true,
        },
      ),
    );
  const [media, setMedia] = useState(new Map<string, Blob>()),
    [urls, setUrls] = useState(new Map<string, string>()),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (initialCase)
      setDraft((d) => ({
        ...d,
        document: {
          ...d.document,
          color: initialCase.hex,
          learningIntent: {
            ...(d.document.learningIntent ?? blankIntent()),
            referenceCaseId: initialCase.id,
          },
        },
      }));
  }, [initialCase?.id]);
  useEffect(() => {
    const next = new Map(
      Array.from(media, ([key, blob]) => [key, URL.createObjectURL(blob)]),
    );
    setUrls(next);
    return () => {
      for (const url of next.values()) URL.revokeObjectURL(url);
    };
  }, [media]);
  const change = (patch: Partial<ExperiencePlanetData["document"]>) =>
    setDraft((d) => ({ ...d, document: { ...d.document, ...patch } }));
  const upload = async (kind: "exterior" | "interior", file?: File) => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const result = await importOfflineImage(file);
      setMedia((m) =>
        new Map(m)
          .set(result.key, result.blob)
          .set(result.key + "-original", result.original),
      );
      setDraft((d) => ({
        ...d,
        [kind]: result.key,
        document: { ...d.document, revision: d.document.revision + 1 },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片读取失败");
    } finally {
      setLoading(false);
    }
  };
  const changed =
    JSON.stringify(original.current) !== JSON.stringify(draft) ||
    media.size > 0;
  useEffect(() => {
    onDirtyChange?.(changed);
  }, [changed, onDirtyChange]);
  return (
    <section className="offline-editor" aria-label="编辑星球">
      <header>
        <div>
          <p className="eyebrow">SHAPE YOUR OWN WORLD</p>
          <h1>{planet ? "编辑星球" : "创造我的星球"}</h1>
        </div>
        <button
          onClick={() => {
            if (!changed || window.confirm("还有未保存的创作，确定离开吗？"))
              onClose();
          }}
        >
          返回宇宙
        </button>
      </header>
      <div className="offline-editor-columns">
        <div className="offline-edit-fields">
          <label>
            星球名称
            <input
              aria-label="星球名称"
              maxLength={60}
              value={draft.document.metadata.name}
              onChange={(e) =>
                change({
                  metadata: {
                    ...draft.document.metadata,
                    name: e.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            写给这颗星球
            <textarea
              aria-label="星球寄语"
              rows={3}
              maxLength={1000}
              value={draft.document.metadata.summary}
              onChange={(e) =>
                change({
                  metadata: {
                    ...draft.document.metadata,
                    summary: e.target.value,
                    demoWriting: false,
                  },
                })
              }
            />
          </label>
          <label>
            创作碎碎念
            <textarea
              aria-label="创作碎碎念"
              rows={4}
              maxLength={1500}
              value={draft.document.metadata.reflection ?? ""}
              onChange={(e) =>
                change({
                  metadata: {
                    ...draft.document.metadata,
                    reflection: e.target.value,
                    demoWriting: false,
                  },
                })
              }
            />
          </label>
          <div className="default-skins" role="group" aria-label="选择默认星球">
            {CloudPlanetPresets.map((preset, i) => (
              <button
                key={i}
                aria-pressed={draft.document.skin === i && !draft.exterior}
                aria-label={`默认星球 ${i + 1}`}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    exterior: undefined,
                    document: planet
                      ? { ...d.document, skin: i }
                      : {
                          ...cloudPlanetFromPreset(i),
                          revision: d.document.revision,
                        },
                  }))
                }
              >
                <img
                  src={`${import.meta.env.BASE_URL}demo/v2/body-${i}.webp`}
                  alt={`默认星球 ${i + 1}`}
                />
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
          <label>
            上传星球外貌
            <input
              type="file"
              aria-label="上传星球外貌"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void upload("exterior", e.target.files?.[0])}
            />
          </label>
          <label>
            上传内部背景
            <input
              type="file"
              aria-label="上传内部背景"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void upload("interior", e.target.files?.[0])}
            />
          </label>
          <label>
            默认内部环境
            <select
              value={
                draft.interior?.startsWith("local:")
                  ? "uploaded"
                  : (draft.interior ?? "")
              }
              aria-label="选择内部环境"
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  interior: e.target.value || undefined,
                }))
              }
            >
              <option value="">随模板的星空场景</option>
              {[1, 2, 3, 4, 5].map((i) => (
                <option key={i} value={`case-${i}-interior.webp`}>
                  环境 {i}
                </option>
              ))}
              {draft.interior?.startsWith("local:") && (
                <option value="uploaded">我的背景</option>
              )}
            </select>
          </label>
          <label>
            光晕
            <select
              value={draft.document.halo}
              onChange={(e) =>
                change({ halo: e.target.value as typeof draft.document.halo })
              }
            >
              <option value="none">无</option>
              <option value="soft">柔光</option>
              <option value="ring">星环</option>
            </select>
          </label>
          <label>
            运行速度
            <select
              aria-label="星球运行速度"
              value={draft.document.motion.mode}
              onChange={(e) =>
                change({
                  motion: {
                    ...draft.document.motion,
                    mode: e.target.value as typeof draft.document.motion.mode,
                  },
                })
              }
            >
              <option value="stationary">静止</option>
              <option value="slow">慢速</option>
              <option value="fast">快速</option>
            </select>
          </label>
          <label>
            粒子氛围
            <select
              aria-label="粒子氛围"
              value={draft.document.atmosphere}
              onChange={(e) =>
                change({
                  atmosphere: e.target
                    .value as typeof draft.document.atmosphere,
                })
              }
            >
              <option value="none">无</option>
              <option value="stardust">星尘</option>
              <option value="fireflies">萤火</option>
            </select>
          </label>
        </div>
        <div>
          <div
            className="offline-planet-preview"
            style={
              { "--preview-color": draft.document.color } as React.CSSProperties
            }
          >
            <img
              src={
                draft.exterior
                  ? (urls.get(draft.exterior) ??
                    resolveImage?.(draft.exterior) ??
                    (draft.exterior.startsWith("local:")
                      ? ""
                      : `${import.meta.env.BASE_URL}competition/${draft.exterior}`))
                  : `${import.meta.env.BASE_URL}demo/v2/body-${draft.document.skin}.webp`
              }
              alt="星球实时预览"
              style={{ borderColor: draft.document.color }}
            />
            <strong>{draft.document.metadata.name}</strong>
            <span>{draft.document.color.toUpperCase()}</span>
          </div>
          <ColorCardPicker
            color={draft.document.color}
            onColor={(color) => change({ color })}
            referenceCaseId={draft.document.learningIntent?.referenceCaseId}
            onReference={(referenceCaseId) =>
              change({
                learningIntent: {
                  ...(draft.document.learningIntent ?? blankIntent()),
                  referenceCaseId,
                },
              })
            }
            mood={draft.document.learningIntent?.customMood ?? ""}
            onMood={(customMood) =>
              change({
                learningIntent: {
                  ...(draft.document.learningIntent ?? blankIntent()),
                  customMood,
                },
              })
            }
          />
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="offline-save">
        <button
          className="primary"
          disabled={busy || loading || !draft.document.metadata.name.trim()}
          onClick={() => void onSave(draft, media)}
        >
          {busy ? "正在保存…" : "保存并返回我的星球"}
        </button>
      </div>
    </section>
  );
}
