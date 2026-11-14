import { useEffect, useRef, useState } from "react";
import {
  LearningIntentSchema,
  type LearningIntent,
  type WorkLearning,
} from "@colorverse/contracts";
import { classroomRequest } from "./cloud-request";
import { validateWorkImages } from "./cloud-image-upload";
import { WorkImagePicker } from "./WorkImagePicker";
import { IntentFields } from "./LearningPanels";
import { ClassroomThumbnail } from "./ClassroomThumbnail";

type Content = {
  id: string;
  title: string;
  description: string;
  revision: number;
  imageCount: number;
  learning: WorkLearning | null;
  locked: boolean;
  withdrawn: boolean;
};
export function StudentWorkEditor({
  classId,
  workId,
  onClose,
  onSaved,
}: {
  classId: string;
  workId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    requestId = useRef(crypto.randomUUID());
  const [content, setContent] = useState<Content>(),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState("");
  const [keep, setKeep] = useState<number[]>([]),
    [files, setFiles] = useState<File[]>([]),
    [intent, setIntent] = useState<LearningIntent>(
      LearningIntentSchema.parse({}),
    );
  const [imagesChecking, setImagesChecking] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  const root = `classes/${classId}/works/`;
  useEffect(() => {
    ref.current?.showModal();
    let active = true;
    void classroomRequest(root + workId + "/content")
      .then((r) => r.json())
      .then((v: Content) => {
        if (!active) return;
        setContent(v);
        setTitle(v.title);
        setDescription(v.description);
        setKeep(Array.from({ length: v.imageCount }, (_, i) => i));
        const l = v.learning;
        setIntent({
          intendedMoods: l?.intendedMoods ?? [],
          customMood: l?.customMood ?? "",
          colorRationale: l?.colorRationale ?? "",
          paletteColors: l?.paletteColors ?? [],
        });
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [classId, workId]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  const close = () => {
    if (!busy && (!dirty || window.confirm("修改尚未保存，确定放弃吗？")))
      onClose();
  };
  return (
    <dialog
      className="assignment-mail student-work-editor"
      aria-label="修改已提交作业"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <button
        className="mail-close"
        aria-label="关闭修改作业"
        disabled={busy || imagesChecking}
        onClick={close}
      >
        ×
      </button>
      <h2>修改已提交作业</h2>
      {error && <p role="alert">{error}</p>}
      {!content && !error && <p>正在读取作品…</p>}
      {content && (content.locked || content.withdrawn) ? (
        <p>作品已评分或已撤回，不能修改。请返回刷新列表。</p>
      ) : (
        content && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || imagesChecking) return;
              setBusy(true);
              setError("");
              try {
                if (!title.trim()) throw Error("请填写作品名称");
                if (!keep.length && !files.length)
                  throw Error("至少保留一张作品图片");
                if (keep.length + files.length > 6)
                  throw Error("最多保留6张图片");
                const retained: File[] = [];
                for (const index of keep) {
                  const r = await classroomRequest(
                    root + workId + "/original?index=" + index,
                  );
                  const blob = await r.blob();
                  retained.push(
                    new File(
                      [blob],
                      `original-${index}.${blob.type.split("/")[1] || "png"}`,
                      { type: blob.type },
                    ),
                  );
                }
                const images = [...retained, ...files];
                await validateWorkImages(images);
                const form = new FormData();
                form.set("image", images[0]);
                images.slice(1).forEach((f) => form.append("images", f));
                form.set(
                  "metadata",
                  JSON.stringify({
                    title: title.trim(),
                    description,
                    learning: content.learning
                      ? {
                          ...intent,
                          taskId: content.learning.taskId,
                          publicationId: content.learning.publicationId ?? null,
                          comparisonGroupId: content.learning.comparisonGroupId,
                          variantLabel: content.learning.variantLabel,
                        }
                      : null,
                  }),
                );
                const query = new URLSearchParams({
                  requestId: requestId.current,
                  replaceWorkId: workId,
                  revision: String(content.revision),
                });
                await classroomRequest(root.slice(0, -1) + "?" + query, {
                  method: "POST",
                  body: form,
                });
                setDirty(false);
                onSaved();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "修改失败，内容已保留",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy || imagesChecking}>
              <label>
                作品名称
                <input
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <div className="student-work-images">
                {keep.map((index) => (
                  <div key={index}>
                    <ClassroomThumbnail
                      source={`private:${root}${workId}/image?index=${index}`}
                      identity={`${workId}:${content.revision}:${index}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setKeep((v) => v.filter((i) => i !== index));
                        setDirty(true);
                      }}
                    >
                      移除原图片 {index + 1}
                    </button>
                  </div>
                ))}
              </div>
              <WorkImagePicker
                label="添加或替换作品图片"
                files={files}
                existingCount={keep.length}
                disabled={busy}
                onCheckingChange={setImagesChecking}
                onChange={(next) => {
                  setFiles(next);
                  setDirty(true);
                }}
              />
              <label>
                创作说明
                <textarea
                  aria-label="创作说明"
                  rows={3}
                  maxLength={2000}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              {content.learning && (
                <IntentFields
                  value={intent}
                  disabled={busy || imagesChecking}
                  onChange={(v) => {
                    setIntent(v);
                    setDirty(true);
                  }}
                />
              )}
            </fieldset>
            <button
              type="submit"
              className="primary"
              disabled={busy || imagesChecking}
            >
              {busy ? "正在保存，请保持浏览器在前台…" : "保存修改"}
            </button>
          </form>
        )
      )}
    </dialog>
  );
}
