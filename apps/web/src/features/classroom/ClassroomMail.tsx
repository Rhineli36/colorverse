import { useEffect, useRef, useState } from "react";
import {
  AssignmentCatalog,
  type AssignmentDefinition,
  type CustomAssignmentDraft,
  type ClassroomNotification,
} from "@colorverse/contracts";
import "./classroom-mail.css";
import { AssignmentBrief } from "./AssignmentBrief";
import { NewAssignmentForm } from "./NewAssignmentForm";
import { InterfaceIcon } from "./InterfaceIcon";
export function AssignmentMail({
  taskId,
  definition,
  onClose,
  onSubmit,
}: {
  taskId: string;
  definition?: AssignmentDefinition;
  onClose: () => void;
  onSubmit?: () => void;
}) {
  const task = definition ?? AssignmentCatalog.find((t) => t.id === taskId),
    ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  if (!task) return null;
  return (
    <dialog
      ref={ref}
      className="assignment-mail"
      aria-label="课堂作业邮件"
      onCancel={onClose}
    >
      <button
        className="mail-close"
        aria-label="关闭作业邮件"
        onClick={onClose}
      >
        ×
      </button>
      <p className="eyebrow">CLASSROOM · ASSIGNMENT</p>
      <h2>{task.title}</h2>
      <AssignmentBrief task={task} />
      <footer className="assignment-mail-actions">
        <button onClick={onClose}>返回</button>
        {onSubmit && (
          <button className="primary" onClick={onSubmit}>
            去我的星球提交作业 →
          </button>
        )}
      </footer>
    </dialog>
  );
}
export function AssignmentPublisher({
  onPublish,
  onCreate,
  onEdit,
  draftRevisions = {},
  catalog = AssignmentCatalog,
  disabled = false,
  saveBeforePublish = false,
  unpublishedTaskIds = [],
}: {
  saveBeforePublish?: boolean;
  unpublishedTaskIds?: string[];
  draftRevisions?: Record<string, number>;
  onEdit?: (
    taskId: string,
    revision: number,
    definition: CustomAssignmentDraft,
    images: File[],
    keepImageIndices?: number[],
  ) => Promise<void>;
  onPublish: (taskId: string) => Promise<void>;
  onCreate?: (
    draft: CustomAssignmentDraft,
    image: File | null,
    requestId: string,
    images?: File[],
  ) => Promise<string | void>;
  catalog?: AssignmentDefinition[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [taskId, setTaskId] = useState("T01"),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const ref = useRef<HTMLDialogElement>(null),
    dirty = useRef(false);
  const [mode, setMode] = useState<"templates" | "new" | "edit">("templates");
  const [editing, setEditing] = useState<{
    task: AssignmentDefinition;
    revision: number;
  }>();
  const discard = () =>
    !dirty.current || window.confirm("作业尚有未保存的修改，确定放弃吗？");
  const close = () => {
    if (busy) return;
    if (
      dirty.current &&
      !window.confirm(
        saveBeforePublish
          ? "作业尚有未保存的修改，确定放弃吗？"
          : "新增作业尚未发布，确定放弃这些内容吗？",
      )
    )
      return;
    setOpen(false);
    setMode("templates");
    dirty.current = false;
  };
  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);
  const task = catalog.find((t) => t.id === taskId) ?? catalog[0];
  return (
    <>
      <button
        className="teacher-primary-action teacher-publish-action"
        disabled={disabled}
        onClick={() => {
          setStatus("");
          setOpen(true);
        }}
      >
        发布作业
      </button>
      {open && (
        <dialog
          className="assignment-mail"
          ref={ref}
          aria-label="发布课堂作业"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <button
            disabled={busy}
            className="mail-close"
            aria-label="关闭发布作业"
            onClick={close}
          >
            ×
          </button>
          <h2>给班级发布一封创作邀请</h2>
          {saveBeforePublish && (
            <p>先保存作业内容，再选择全班或指定学生发布。</p>
          )}
          {onCreate && (
            <nav className="assignment-compose-tabs" aria-label="作业来源">
              <button
                aria-pressed={mode === "templates"}
                disabled={busy}
                onClick={() => {
                  if (discard()) setMode("templates");
                }}
              >
                现有作业
              </button>
              <button
                aria-pressed={mode === "new"}
                disabled={busy}
                onClick={() => {
                  if (mode !== "new" && discard()) setMode("new");
                }}
              >
                ＋ 新增作业
              </button>
            </nav>
          )}
          {mode === "edit" && editing && onEdit ? (
            <NewAssignmentForm
              key={editing.task.id}
              initialTask={editing.task}
              saveOnly
              onDirtyChange={(v) => {
                dirty.current = v;
              }}
              onBack={() => {
                if (discard()) setMode("templates");
              }}
              onCreate={async (
                definition,
                image,
                _requestId,
                extraImages = [],
                keepImageIndices,
              ) => {
                setBusy(true);
                try {
                  await onEdit(
                    editing.task.id,
                    editing.revision,
                    definition,
                    image ? [image, ...extraImages] : [],
                    keepImageIndices,
                  );
                  dirty.current = false;
                  setStatus("草稿修改已保存，可以继续编辑或选择发布对象。");
                  setMode("templates");
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : mode === "new" && onCreate ? (
            <NewAssignmentForm
              saveOnly={saveBeforePublish}
              onDirtyChange={(v) => {
                dirty.current = v;
              }}
              onBack={() => {
                if (
                  !dirty.current ||
                  window.confirm(
                    saveBeforePublish
                      ? "确定放弃尚未保存的新作业吗？"
                      : "确定放弃尚未发布的新作业吗？",
                  )
                )
                  setMode("templates");
              }}
              onCreate={async (definition, image, requestId, images) => {
                setBusy(true);
                try {
                  const createdId = await onCreate(
                    definition,
                    image,
                    requestId,
                    images,
                  );
                  dirty.current = false;
                  setMode("templates");
                  if (saveBeforePublish) {
                    if (createdId) setTaskId(createdId);
                    setStatus(
                      "作业已保存，尚未发布。请选择作业，再确认发布对象。",
                    );
                  } else setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : (
            <>
              {status && <p role="status">{status}</p>}
              <label>
                准备好的教学任务
                <select
                  aria-label="发布的作业"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                >
                  {catalog.map((t) => (
                    <option key={t.id} value={t.id}>
                      {unpublishedTaskIds.includes(t.id) ? "[未发布] " : ""}
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              {onEdit &&
                task.id.startsWith("custom-") &&
                draftRevisions[task.id] != null && (
                  <button
                    type="button"
                    className="assignment-edit-entry"
                    disabled={busy}
                    onClick={() => {
                      setStatus("");
                      setEditing({ task, revision: draftRevisions[task.id] });
                      setMode("edit");
                    }}
                  >
                    编辑草稿
                  </button>
                )}
              <AssignmentBrief task={task} showTitle />
              <button disabled={busy} onClick={() => setOpen(false)}>
                取消
              </button>
              <button
                disabled={busy}
                className="primary"
                onClick={() => {
                  setBusy(true);
                  void onPublish(taskId)
                    .then(() => {
                      setOpen(false);
                    })
                    .catch((e) =>
                      setStatus(
                        e instanceof Error ? e.message : "发布失败，请重试",
                      ),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                {busy
                  ? "正在处理…"
                  : saveBeforePublish
                    ? "选择发布对象"
                    : "一键发布给全班"}
              </button>
            </>
          )}
        </dialog>
      )}
    </>
  );
}
export function ClassroomInbox({
  disabled = false,
  status,
  onRefresh,
  notifications,
  readIds,
  onRead,
  onAssignment,
  onReaction,
  pendingReviewsRequest,
}: {
  disabled?: boolean;
  status?: string;
  onRefresh?: () => void;
  notifications: ClassroomNotification[];
  readIds: string[];
  onRead: (id: string) => void;
  onAssignment: (taskId: string, notification: ClassroomNotification) => void;
  onReaction?: (n: ClassroomNotification) => void;
  pendingReviewsRequest?: number;
}) {
  const [open, setOpen] = useState(false),
    [pendingOnly, setPendingOnly] = useState(false),
    ref = useRef<HTMLDialogElement>(null);
  const scrollPosition = useRef(0);
  const lastPendingRequest = useRef(pendingReviewsRequest);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  useEffect(() => {
    if (pendingReviewsRequest === lastPendingRequest.current) return;
    lastPendingRequest.current = pendingReviewsRequest;
    if (!pendingReviewsRequest) return;
    scrollPosition.current = 0;
    setPendingOnly(true);
    setOpen(true);
    refresh.current?.();
  }, [pendingReviewsRequest]);
  useEffect(() => {
    if (open && ref.current) {
      ref.current.showModal();
      ref.current.scrollTop = scrollPosition.current;
    }
  }, [open]);
  const unread = notifications.filter((n) => !readIds.includes(n.id)).length;
  const visible = pendingOnly
    ? notifications.filter((n) => n.kind === "submission" && n.pending)
    : notifications;
  return (
    <>
      <button
        disabled={disabled}
        title={disabled ? "请先完成当前加载或保存、取消编辑" : "查看信息"}
        className="inbox-entry"
        onClick={() => {
          setPendingOnly(false);
          setOpen(true);
          onRefresh?.();
        }}
      >
        <InterfaceIcon name="bell" /> 消息 {unread > 0 && <b>{unread}</b>}
      </button>
      {open && (
        <dialog
          ref={ref}
          className="classroom-inbox"
          onScroll={(e) => {
            scrollPosition.current = e.currentTarget.scrollTop;
          }}
          aria-label={pendingOnly ? "待评价作品" : "我的信息"}
          onCancel={() => setOpen(false)}
        >
          <button
            className="mail-close"
            aria-label="关闭信息"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <h2>{pendingOnly ? "待评价作品" : "来自这片宇宙的信息"}</h2>
          {status && <p role="status">{status}</p>}
          {onRefresh && <button onClick={onRefresh}>重新读取信息</button>}
          {visible.length === 0
            ? !status && (
                <p>
                  {pendingOnly
                    ? "暂时没有待评价作品。"
                    : "还没有新信息。新的作业、点赞和留言会出现在这里。"}
                </p>
              )
            : visible.map((n) => (
                <button
                  key={n.id}
                  className={`inbox-row ${readIds.includes(n.id) ? "read" : ""}`}
                  onClick={() => {
                    onRead(n.id);
                    setOpen(false);
                    if (n.kind === "assignment" && n.taskId)
                      onAssignment(n.taskId, n);
                    else onReaction?.(n);
                  }}
                >
                  <span>
                    {n.kind === "assignment"
                      ? "✉"
                      : n.kind === "like"
                        ? "♡"
                        : "✦"}
                  </span>
                  <div>
                    <strong>{n.title}</strong>
                    {n.content && <p>{n.content}</p>}
                    {n.kind === "planet-created" && <p>前往星球 →</p>}
                    {n.kind === "submission" && (
                      <p>{n.pending ? "待评价" : "已评价"} · 查看作品 →</p>
                    )}
                    <time>
                      {new Date(n.createdAt).toLocaleString("zh-CN", {
                        hour12: false,
                      })}
                    </time>
                  </div>
                  {!readIds.includes(n.id) && <i />}
                </button>
              ))}
        </dialog>
      )}
    </>
  );
}
