import { useEffect, useState } from "react";
import { z } from "zod";
import {
  CloudPlanetDocumentSchema,
  CloudPlanetPresets,
} from "@colorverse/contracts";
import { classroomRequest } from "./CloudClassroomView";

type PlanetDocument = z.infer<typeof CloudPlanetDocumentSchema>;
export function usePlanetImage(
  classId: string,
  planetId: string,
  kind: "exterior" | "interior",
  mediaId?: string,
) {
  const [image, setImage] = useState({ url: "", error: false });
  useEffect(() => {
    let active = true,
      objectUrl = "";
    setImage({ url: "", error: false });
    if (mediaId)
      void classroomRequest(`classes/${classId}/planets/${planetId}/${kind}`)
        .then((r) => r.blob())
        .then((blob) => {
          if (active) {
            objectUrl = URL.createObjectURL(blob);
            setImage({ url: objectUrl, error: false });
          }
        })
        .catch(() => {
          if (active) setImage({ url: "", error: true });
        });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [classId, planetId, kind, mediaId]);
  return image;
}
export function CloudPlanetOrb({
  classId,
  id,
  document,
}: {
  classId: string;
  id: string;
  document: PlanetDocument;
}) {
  const image = usePlanetImage(
    classId,
    id,
    "exterior",
    document.media.exterior?.id,
  );
  return (
    <img
      className="student-orb cloud-planet-orb"
      alt="星球外貌"
      src={
        image.url ||
        `${import.meta.env.BASE_URL}demo/v2/body-${document.skin}.webp`
      }
    />
  );
}
export type AppearanceSection =
  "exterior" | "atmosphere" | "interior" | "tone" | "summary";
const sections: { id: AppearanceSection; title: string }[] = [
  { id: "exterior", title: "外貌" },
  { id: "atmosphere", title: "粒子氛围" },
  { id: "interior", title: "内部背景" },
  { id: "tone", title: "色调细节" },
  { id: "summary", title: "星球介绍" },
];
export function CloudPlanetAppearance({
  classId,
  id,
  document,
  busy,
  run,
  onSaved,
  onClose,
  initialSection = "exterior",
}: {
  classId: string;
  id: string;
  document: PlanetDocument;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  onSaved: () => Promise<unknown>;
  onClose: () => void;
  initialSection?: AppearanceSection;
}) {
  const [section, setSection] = useState(initialSection);
  const [name, setName] = useState(document.metadata.name),
    [skin, setSkin] = useState(document.skin),
    [color, setColor] = useState(document.color);
  const [summary, setSummary] = useState(document.metadata.summary),
    [atmosphere, setAtmosphere] = useState(document.atmosphere);
  const [brightness, setBrightness] = useState(document.brightness),
    [saturation, setSaturation] = useState(document.saturation);
  const [files, setFiles] = useState<
    Partial<Record<"exterior" | "interior", File>>
  >({});
  const [status, setStatus] = useState("");
  const [requests, setRequests] = useState({
    exterior: crypto.randomUUID(),
    interior: crypto.randomUUID(),
  });
  useEffect(() => {
    setSection(initialSection);
    setStatus("");
  }, [initialSection]);
  // Save only this section: uploading an image must not accidentally save drafts in other tabs.
  const save = () =>
    void run(async () => {
      setStatus("");
      const changes =
        section === "summary"
          ? { summary }
          : section === "atmosphere"
            ? { atmosphere }
            : section === "tone"
              ? { color, brightness, saturation, practice: "tone" }
              : { skin };
      try {
        await classroomRequest(`classes/${classId}/planets/${id}/appearance`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: section === "summary" ? name : document.metadata.name,
            color: document.color,
            skin: document.skin,
            ...changes,
            revision: document.revision,
          }),
        });
        await onSaved();
        setStatus("星球设置已保存到云端，任务进度已更新。");
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "保存失败，请重试");
      }
    });
  const upload = (kind: "exterior" | "interior") =>
    void run(async () => {
      setStatus("");
      const file = files[kind];
      if (!file) return;
      if (file.size > 8388608) {
        setStatus("图片最多 8 MB，请先缩小图片。");
        return;
      }
      try {
        await classroomRequest(
          `classes/${classId}/planets/${id}/${kind}?requestId=${requests[kind]}&revision=${document.revision}`,
          {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          },
        );
        await onSaved();
        setFiles((f) => ({ ...f, [kind]: undefined }));
        setStatus(
          `${kind === "exterior" ? "星球外貌" : "内部背景"}已上传并保存到云端。`,
        );
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "上传失败，请重试");
      }
    });
  return (
    <section className="cloud-appearance" aria-label="云端星球设置">
      <div className="cloud-room-heading">
        <div>
          <p className="eyebrow">MAKE IT YOURS</p>
          <h2>让这颗星球成为你的作品</h2>
        </div>
        <button disabled={busy} onClick={onClose}>
          完成设置
        </button>
      </div>
      <div className="cloud-settings-tabs" aria-label="星球设置分类">
        {sections.map((s) => (
          <button
            key={s.id}
            disabled={busy}
            aria-pressed={section === s.id}
            onClick={() => {
              setSection(s.id);
              setStatus("");
            }}
          >
            {s.title}
          </button>
        ))}
      </div>
      {(section === "exterior" || section === "interior") && (
        <div className="cloud-image-settings">
          <div>
            <h3>{section === "exterior" ? "星球外貌" : "内部背景"}</h3>
            <p>
              {document.media[section]
                ? "已上传，可随时替换。"
                : section === "exterior"
                  ? "上传自己的设计。建议正方形图片，将自动裁成圆形。"
                  : "建议横向场景图，作为作品的展示空间。"}
            </p>
            <input
              aria-label={
                section === "exterior" ? "星球外貌图片" : "星球内部背景图片"
              }
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => {
                const kind = section;
                setFiles((f) => ({ ...f, [kind]: e.target.files?.[0] }));
                setRequests((r) => ({ ...r, [kind]: crypto.randomUUID() }));
                setStatus("");
              }}
            />
            <button
              className="primary"
              disabled={busy || !files[section]}
              onClick={() => upload(section)}
            >
              {busy
                ? "正在上传…"
                : section === "exterior"
                  ? "上传星球外貌"
                  : "上传内部背景"}
            </button>
          </div>
        </div>
      )}
      {section === "exterior" && (
        <>
          <p className="muted">
            还没准备好图片？可以先选择默认外观。上传的图片会优先显示。
          </p>
          <div className="cloud-skins" aria-label="默认星球外观">
            {CloudPlanetPresets.map((preset, index) => (
              <button
                key={preset.name}
                disabled={busy}
                aria-label={`选择${preset.name}`}
                aria-pressed={skin === index}
                onClick={() => setSkin(index)}
              >
                <img
                  src={`${import.meta.env.BASE_URL}demo/v2/body-${index}.webp`}
                  alt=""
                />
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {section === "atmosphere" && (
        <>
          <h3>一点光，让空间活起来</h3>
          <p>
            粒子出现在星球内部，作为作品周围的氛围。成长元素的运动可以在上传作业后单独设置。
          </p>
          <div className="row-buttons">
            {(
              [
                ["none", "静谧无粒子"],
                ["stardust", "漂浮星尘"],
                ["fireflies", "萤火微光"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                disabled={busy}
                aria-pressed={atmosphere === value}
                onClick={() => setAtmosphere(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {section === "tone" && (
        <>
          <h3>调整场景的色彩层次</h3>
          <p>
            亮度和饱和度影响内部背景，成长元素保留自己的颜色。保存后在下方场景中欣赏效果。
          </p>
          <label>
            环境色调
            <input
              aria-label="星球环境色调"
              type="color"
              value={color}
              disabled={busy}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <label>
            背景亮度 · {Math.round(brightness * 100)}%
            <input
              aria-label="背景亮度"
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={brightness}
              disabled={busy}
              onChange={(e) => setBrightness(Number(e.target.value))}
            />
          </label>
          <label>
            背景饱和度 · {Math.round(saturation * 100)}%
            <input
              aria-label="背景饱和度"
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={saturation}
              disabled={busy}
              onChange={(e) => setSaturation(Number(e.target.value))}
            />
          </label>
        </>
      )}
      {section === "summary" && (
        <>
          <label>
            星球名称
            <input
              aria-label="云端星球名称"
              value={name}
              maxLength={60}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            星球介绍
            <textarea
              aria-label="星球介绍"
              value={summary}
              maxLength={1000}
              rows={4}
              placeholder="这颗星球的色彩灵感是什么？你希望同学在这里看到什么？"
              disabled={busy}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <small>{summary.length}/1000</small>
        </>
      )}
      {section !== "interior" && (
        <button
          className="primary"
          disabled={busy || !name.trim()}
          onClick={save}
        >
          {busy
            ? "正在保存…"
            : section === "exterior"
              ? "保存默认外观"
              : "保存星球设置"}
        </button>
      )}
      {(section === "exterior" || section === "interior") && (
        <small>
          PNG / JPEG / WebP，每张最多 8 MB、1600
          万像素。图片仅对班级成员开放；外貌和背景会保存为优化后的图片。
        </small>
      )}
      {status && (
        <p role="status" className="cloud-notice">
          {status}
        </p>
      )}
    </section>
  );
}
