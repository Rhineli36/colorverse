import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  AssignmentDefinitionSchema,
  type AssignmentDefinition,
} from "@colorverse/contracts";
import { NewAssignmentForm } from "./NewAssignmentForm";
import { classroomRequest } from "./cloud-request";
const Content = z.object({
  id: z.uuid(),
  definition: AssignmentDefinitionSchema,
  revision: z.number().int().nonnegative(),
});
export function PublishedAssignmentEditor({
  classId,
  publicationId,
  onClose,
  onSaved,
  onPendingChange,
}: {
  classId: string;
  publicationId: string;
  onClose: () => void;
  onSaved: (value: {
    id: string;
    definition: AssignmentDefinition;
    revision: number;
  }) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [content, setContent] = useState<z.infer<typeof Content>>();
  const [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    onPendingChange(dirty || saving);
    return () => onPendingChange(false);
  }, [dirty, saving, onPendingChange]);
  useEffect(() => {
    const abort = new AbortController();
    setError("");
    void classroomRequest(
      `classes/${classId}/publications/${publicationId}/content`,
      { signal: abort.signal },
    )
      .then((r) => r.json())
      .then((v) => {
        if (!abort.signal.aborted) setContent(Content.parse(v));
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : "作业暂时无法读取。");
      });
    return () => abort.abort();
  }, [classId, publicationId, attempt]);
  const close = () => {
    if (
      !saving &&
      (!dirty || window.confirm("修改尚未保存，确定放弃并关闭吗？"))
    )
      onClose();
  };
  return (
    <dialog
      className="assignment-mail"
      ref={ref}
      aria-label="修改已发布作业"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <button
        className="mail-close"
        aria-label="关闭修改作业"
        disabled={saving}
        onClick={close}
      >
        ×
      </button>
      <h2>修改已发布作业</h2>
      <p>
        保存后同步本次发布的文字和参考图片；应交名单、学生作品与评分保持不变。
      </p>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setAttempt((n) => n + 1)}>重新读取作业</button>
        </div>
      )}
      {!content && !error && <p role="status">正在读取已发布内容…</p>}
      {content && (
        <NewAssignmentForm
          initialTask={content.definition}
          editLabel="作业内容"
          saveOnly
          onDirtyChange={setDirty}
          onBack={close}
          onCreate={async (
            definition,
            image,
            _requestId,
            images = [],
            keepImageIndices,
          ) => {
            const body = new FormData();
            body.set(
              "metadata",
              JSON.stringify({
                revision: content.revision,
                definition,
                keepImageIndices,
              }),
            );
            if (image) body.set("image", image);
            for (const file of images) body.append("images", file);
            setSaving(true);
            try {
              const response = await classroomRequest(
                `classes/${classId}/publications/${publicationId}/content`,
                { method: "PATCH", body },
              );
              const saved = Content.parse(await response.json());
              setDirty(false);
              onSaved(saved);
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </dialog>
  );
}
