import { useEffect, useRef, useState } from "react";
import {
  AssignmentDefinitionSchema,
  CustomAssignmentFields,
  type CustomAssignmentDraft,
  type AssignmentMark,
  type AssignmentDefinition,
} from "@colorverse/contracts";
import { AssignmentBrief, AssignmentImage } from "./AssignmentBrief";
import { AssignmentTextEditor, sliceMarks } from "./AssignmentText";
export function NewAssignmentForm({
  onCreate,
  onBack,
  onDirtyChange,
  saveOnly = false,
  initialTask,
}: {
  saveOnly?: boolean;
  initialTask?: AssignmentDefinition;
  onCreate: (
    draft: CustomAssignmentDraft,
    image: File | null,
    requestId: string,
    images?: File[],
    keepImageIndices?: number[],
  ) => Promise<void>;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => ({
    title: initialTask?.title ?? "",
    description: initialTask?.description ?? "",
    steps: initialTask?.steps.join("\n") ?? "",
    deliverables: initialTask?.deliverables ?? "",
    inspiration: initialTask?.inspiration ?? "",
    exampleObservation: initialTask?.exampleObservation ?? "",
  }));
  const [changed, setChanged] = useState(false);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [marks, setMarks] = useState<
    Record<"description" | "steps" | "deliverables", AssignmentMark[]>
  >(() => {
    let offset = 0;
    return {
      description: initialTask?.formatting?.description ?? [],
      deliverables: initialTask?.formatting?.deliverables ?? [],
      steps:
        initialTask?.steps.flatMap((step, i) => {
          const start = offset;
          offset += step.length + 1;
          return (initialTask.formatting?.steps?.[i] ?? []).map((mark) => ({
            ...mark,
            from: mark.from + start,
            to: mark.to + start,
          }));
        }) ?? [],
    };
  });
  const [extraUrls, setExtraUrls] = useState<string[]>([]);
  useEffect(() => {
    const urls = extraFiles.map((f) => URL.createObjectURL(f));
    setExtraUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [extraFiles]);
  const [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState(""),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const initialImages = initialTask?.images?.length
    ? initialTask.images
    : initialTask?.image
      ? [initialTask.image]
      : [];
  const [removedImages, setRemovedImages] = useState<number[]>([]);
  const savedImages = initialImages
    .map((src, index) => ({ src, index }))
    .filter(({ index }) => !removedImages.includes(index));
  const dirty =
    !!file ||
    (initialTask
      ? changed || removedImages.length > 0
      : Object.values(draft).some(Boolean));
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  const validate = () => {
    let offset = 0;
    const steps = draft.steps.split("\n").flatMap((line) => {
      const start = offset;
      offset += line.length + 1;
      const withoutNumber = line.trimStart().replace(/^\d+[.、]\s*/, "");
      const text = withoutNumber.trimEnd();
      if (!text) return [];
      const from = start + line.length - withoutNumber.length;
      return [
        { text, marks: sliceMarks(marks.steps, from, from + text.length) },
      ];
    });
    const trimMarks = (field: "description" | "deliverables") => {
      const text = draft[field];
      const start = text.length - text.trimStart().length;
      return sliceMarks(marks[field], start, start + text.trim().length);
    };
    const formatting = {
      description: trimMarks("description"),
      deliverables: trimMarks("deliverables"),
      steps: steps.map((s) => s.marks),
    };
    return CustomAssignmentFields.parse({
      ...draft,
      steps: steps.map((s) => s.text),
      ...(formatting.description.length ||
      formatting.deliverables.length ||
      formatting.steps.some((s) => s.length)
        ? { formatting }
        : {}),
    });
  };
  return (
    <section
      className="new-assignment"
      aria-label={initialTask ? "编辑作业草稿" : "新增作业"}
    >
      <h3>{initialTask ? "编辑作业草稿" : "新增作业"}</h3>
      {!preview ? (
        <div className="assignment-fields">
          {(
            [
              ["title", "作业标题"],
              ["description", "作业要求"],
              ["steps", "创作步骤（每行一步）"],
              ["deliverables", "提交内容"],
              ["inspiration", "灵感入口（可选）"],
              ["exampleObservation", "范例观察（可选）"],
            ] as const
          ).map(([key, label]) =>
            saveOnly &&
            (key === "description" ||
              key === "steps" ||
              key === "deliverables") ? (
              <div key={key} className="assignment-format-field">
                <span>{label}</span>
                <AssignmentTextEditor
                  label={label}
                  text={draft[key]}
                  marks={marks[key]}
                  rows={key === "steps" ? 5 : 3}
                  maxLength={key === "steps" ? 5000 : 2000}
                  disabled={busy}
                  onChange={(text, nextMarks) => {
                    setChanged(true);
                    requestId.current = crypto.randomUUID();
                    setDraft({ ...draft, [key]: text });
                    setMarks({ ...marks, [key]: nextMarks });
                  }}
                />
              </div>
            ) : (
              <label key={key}>
                {label}
                {key === "title" ? (
                  <input
                    aria-label={label}
                    maxLength={120}
                    value={draft[key]}
                    disabled={busy}
                    onChange={(e) => {
                      setChanged(true);
                      requestId.current = crypto.randomUUID();
                      setDraft({ ...draft, [key]: e.target.value });
                    }}
                  />
                ) : (
                  <textarea
                    aria-label={label}
                    rows={key === "steps" ? 5 : 3}
                    maxLength={
                      key === "steps"
                        ? 5000
                        : key === "inspiration"
                          ? 500
                          : 2000
                    }
                    value={draft[key]}
                    disabled={busy}
                    onChange={(e) => {
                      setChanged(true);
                      requestId.current = crypto.randomUUID();
                      setDraft({ ...draft, [key]: e.target.value });
                    }}
                  />
                )}
              </label>
            ),
          )}
          <label>
            {initialTask
              ? `上传参考图片（已保留 ${savedImages.length} 张，最多 6 张）`
              : saveOnly
                ? "上传参考图片（可多选，最多6张，合计8MB）"
                : "上传示范图片（可选）"}
            <input
              aria-label="上传作业示范图片"
              type="file"
              multiple={saveOnly}
              accept="image/png,image/jpeg,image/webp"
              disabled={
                busy ||
                savedImages.length + (file ? 1 : 0) + extraFiles.length >= 6
              }
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []);
                if (!chosen.length) return;
                const next = saveOnly
                  ? [...(file ? [file] : []), ...extraFiles, ...chosen]
                  : chosen.slice(0, 1);
                if (
                  savedImages.length + next.length > 6 ||
                  next.some(
                    (f) =>
                      !["image/png", "image/jpeg", "image/webp"].includes(
                        f.type,
                      ),
                  ) ||
                  next.reduce((n, f) => n + f.size, 0) > 8388608
                ) {
                  setError(
                    "每份作业最多 6 张参考图，本次上传的 PNG、JPG 或 WebP 合计不超过 8 MB。",
                  );
                  e.target.value = "";
                  return;
                }
                setError("");
                requestId.current = crypto.randomUUID();
                setFile(next[0]);
                setExtraFiles(next.slice(1));
                e.target.value = "";
              }}
            />
            {initialTask && (
              <small>
                可添加或移除参考图，保存后生效。本次新增图片合计最多 8 MB。
              </small>
            )}
          </label>
          {savedImages.map(({ src, index }, position) => (
            <div className="assignment-file-preview" key={index}>
              <AssignmentImage
                src={src}
                alt={`已保存的参考图片 ${position + 1}`}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setRemovedImages((removed) => [...removed, index]);
                }}
              >
                移除参考图片 {position + 1}
              </button>
            </div>
          ))}
          {file && (
            <div className="assignment-file-preview">
              <img src={url} alt="新增作业示范预览" />
              <span>{file.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  requestId.current = crypto.randomUUID();
                  setFile(extraFiles[0] ?? null);
                  setExtraFiles(extraFiles.slice(1));
                }}
              >
                移除图片
              </button>
            </div>
          )}
          {extraFiles.map((f, index) => (
            <div className="assignment-file-preview" key={index}>
              <img
                src={extraUrls[index]}
                alt={`新增作业示范预览 ${index + 2}`}
              />
              <span>{f.name}</span>
              <button
                disabled={busy}
                onClick={() => {
                  requestId.current = crypto.randomUUID();
                  setExtraFiles(extraFiles.filter((_, i) => i !== index));
                }}
              >
                移除图片 {index + 2}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <AssignmentBrief
          task={AssignmentDefinitionSchema.parse({
            ...validate(),
            id: initialTask?.id ?? `custom-${requestId.current}`,
            image: savedImages[0]?.src || url,
            images: [
              ...savedImages.map((image) => image.src),
              ...[url, ...extraUrls].filter(Boolean),
            ],
          })}
          showTitle
        />
      )}
      {error && <p role="alert">{error}</p>}
      <footer className="assignment-mail-actions">
        <button disabled={busy} onClick={onBack}>
          返回模板
        </button>
        <div className="assignment-create-actions">
          <button
            disabled={busy}
            onClick={() => {
              if (preview) {
                setPreview(false);
                return;
              }
              try {
                validate();
                setError("");
                setPreview(true);
              } catch {
                setError(
                  "请填写标题、作业要求和提交内容；步骤最多10行，每行不超过500字。",
                );
              }
            }}
          >
            {preview ? "继续编辑" : "预览作业"}
          </button>
          <button
            className="primary"
            disabled={busy || (!!initialTask && !dirty)}
            onClick={() => {
              let value: CustomAssignmentDraft;
              try {
                value = validate();
              } catch {
                setError(
                  "请填写标题、作业要求和提交内容；步骤最多10行，每行不超过500字。",
                );
                return;
              }
              setBusy(true);
              setError("");
              void onCreate(
                value,
                file,
                requestId.current,
                extraFiles,
                removedImages.length
                  ? savedImages.map((image) => image.index)
                  : undefined,
              )
                .catch((e) =>
                  setError(
                    e instanceof Error
                      ? e.message
                      : saveOnly
                        ? "保存失败，请重试"
                        : "发布失败，请重试",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {busy
              ? saveOnly
                ? "正在保存…"
                : "正在发布…"
              : saveOnly
                ? initialTask
                  ? "保存修改"
                  : "保存作业"
                : "发布新作业"}
          </button>
        </div>
      </footer>
    </section>
  );
}
