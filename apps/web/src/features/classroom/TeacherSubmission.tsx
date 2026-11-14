import { useEffect, useRef, useState } from "react";
import {
  LearningIntentSchema,
  type Publication,
  type SubmissionRow,
} from "@colorverse/contracts";
import { classroomRequest } from "./cloud-request";
import { validateWorkImages } from "./cloud-image-upload";
import { WorkImagePicker } from "./WorkImagePicker";
import { IntentFields } from "./LearningPanels";

export function TeacherSubmission({
  classId,
  publication,
  student,
  requireExplanation,
  onClose,
  onSaved,
  onPendingChange,
}: {
  classId: string;
  publication: Publication;
  student: SubmissionRow;
  requireExplanation: boolean;
  onClose: () => void;
  onSaved: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef(crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [imagesChecking, setImagesChecking] = useState(false);
  const [intent, setIntent] = useState(LearningIntentSchema.parse({}));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dirty = Boolean(
    title ||
    description ||
    files.length ||
    intent.colorRationale ||
    intent.customMood ||
    intent.intendedMoods.length,
  );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    onPendingChange(dirty || busy);
    return () => onPendingChange(false);
  }, [dirty, busy, onPendingChange]);
  const close = () => {
    if (
      !busy &&
      (!dirty || window.confirm("代交内容尚未保存，确定放弃并关闭吗？"))
    )
      onClose();
  };
  return (
    <dialog
      ref={dialog}
      className="assignment-mail teacher-submission"
      aria-label="代交作业"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <button
        className="mail-close"
        aria-label="关闭代交作业"
        disabled={busy}
        onClick={close}
      >
        ×
      </button>
      <h2>为 {student.name} 代交作业</h2>
      <p>
        {student.studentNumber || "未登记学号"} · {publication.definition.title}
      </p>
      <p className="muted">
        作品将保存到这位学生的星球，记为本次作业提交并进入待批改。系统保留教师代交记录。
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || imagesChecking) return;
          setError("");
          setBusy(true);
          try {
            if (!title.trim()) throw Error("请填写作品名称");
            if (!files.length) throw Error("请选择作品图片");
            if (
              requireExplanation &&
              (!(intent.intendedMoods.length || intent.customMood.trim()) ||
                !intent.colorRationale.trim())
            )
              throw Error("请根据学生提供的说明填写目标氛围与配色理由，再提交");
            await validateWorkImages(files);
            const form = new FormData();
            form.set("image", files[0]);
            files.slice(1).forEach((file) => form.append("images", file));
            form.set(
              "metadata",
              JSON.stringify({
                title: title.trim(),
                description,
                learning: {
                  ...intent,
                  taskId: publication.taskId,
                  publicationId: publication.id,
                  comparisonGroupId: null,
                  variantLabel: "",
                },
              }),
            );
            const query = new URLSearchParams({
              requestId: requestId.current,
              onBehalfOf: student.enrollmentId,
              publicationId: publication.id,
            });
            await classroomRequest(`classes/${classId}/works?${query}`, {
              method: "POST",
              body: form,
            });
            onSaved();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "代交失败，内容已保留，请重试",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="teacher-submission-fields">
          <label>
            作品名称
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <WorkImagePicker
            files={files}
            onChange={setFiles}
            disabled={busy}
            onCheckingChange={setImagesChecking}
          />
          <label>
            创作说明
            <textarea
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <IntentFields value={intent} onChange={setIntent} disabled={busy} />
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">正在上传并保存，请保持浏览器在前台…</p>}
        <button
          type="submit"
          className="primary"
          disabled={busy || imagesChecking}
        >
          {busy ? "正在上传并保存…" : "确认代交作业"}
        </button>
      </form>
    </dialog>
  );
}
