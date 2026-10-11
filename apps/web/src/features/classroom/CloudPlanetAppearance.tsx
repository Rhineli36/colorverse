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
export function CloudPlanetAppearance({
  classId,
  id,
  document,
  busy,
  run,
  onSaved,
  onClose,
}: {
  classId: string;
  id: string;
  document: PlanetDocument;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  onSaved: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [name, setName] = useState(document.metadata.name),
    [skin, setSkin] = useState(document.skin),
    [color, setColor] = useState(document.color);
  const [files, setFiles] = useState<
    Partial<Record<"exterior" | "interior", File>>
  >({});
  const [status, setStatus] = useState("");
  const [requests, setRequests] = useState({
    exterior: crypto.randomUUID(),
    interior: crypto.randomUUID(),
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
      <p>
        建议尽快上传你设计的星球外貌和内部背景，让同学一眼认出你。现在也可以先使用默认外观，之后随时回来修改。
      </p>
      {document.media.exterior && (
        <p>你上传的外貌将优先显示。默认外观用于尚未上传图片的星球。</p>
      )}
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
      <div className="cloud-skins" aria-label="默认星球外观">
        {CloudPlanetPresets.map((preset, index) => (
          <button
            key={preset.name}
            disabled={busy}
            aria-label={`选择${preset.name}`}
            aria-pressed={skin === index}
            onClick={() => {
              setSkin(index);
              setColor(preset.color);
            }}
          >
            <img
              src={`${import.meta.env.BASE_URL}demo/v2/body-${index}.webp`}
              alt=""
            />
            <span>{preset.name}</span>
          </button>
        ))}
      </div>
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
      <button
        className="primary"
        disabled={busy || !name.trim()}
        onClick={() =>
          void run(async () => {
            setStatus("");
            try {
              await classroomRequest(
                `classes/${classId}/planets/${id}/appearance`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name,
                    skin,
                    color,
                    revision: document.revision,
                  }),
                },
              );
              await onSaved();
              setStatus("名称和默认外观已保存到云端。");
            } catch (e) {
              setStatus(e instanceof Error ? e.message : "保存失败，请重试");
            }
          })
        }
      >
        {busy ? "正在保存…" : "保存名称和默认外观"}
      </button>
      <div className="cloud-image-settings">
        {(["exterior", "interior"] as const).map((kind) => (
          <div key={kind}>
            <h3>{kind === "exterior" ? "① 星球外貌" : "② 内部背景"}</h3>
            <p>
              {document.media[kind]
                ? "已上传，可随时替换。"
                : kind === "exterior"
                  ? "建议正方形图片，将自动裁成圆形。"
                  : "建议横向场景图，作为作品的展示空间。"}
            </p>
            <input
              aria-label={
                kind === "exterior" ? "星球外貌图片" : "星球内部背景图片"
              }
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                setFiles((f) => ({ ...f, [kind]: file }));
                setRequests((r) => ({ ...r, [kind]: crypto.randomUUID() }));
                setStatus("");
              }}
            />
            <button
              disabled={busy || !files[kind]}
              onClick={() =>
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
                    setStatus(
                      e instanceof Error ? e.message : "上传失败，请重试",
                    );
                  }
                })
              }
            >
              {busy
                ? "正在上传…"
                : kind === "exterior"
                  ? "上传星球外貌"
                  : "上传内部背景"}
            </button>
          </div>
        ))}
      </div>
      <small>
        PNG / JPEG / WebP，每张最多 8 MB、1600
        万像素。图片仅对班级成员开放；外貌和背景会保存为优化后的图片。
      </small>
      {status && (
        <p role="status" className="cloud-notice">
          {status}
        </p>
      )}
    </section>
  );
}
