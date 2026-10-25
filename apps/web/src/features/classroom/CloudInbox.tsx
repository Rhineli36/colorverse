import { useState, useEffect, useRef } from "react";
import type {
  CloudSession,
  ClassroomNotification,
  AssignmentDefinition,
} from "@colorverse/contracts";
import { ClassroomInbox, AssignmentMail } from "./ClassroomMail";
import { classroomRequest } from "./cloud-request";
export function CloudInbox({
  session,
  disabled = false,
  onSubmit,
  onReaction,
  onPendingCount,
}: {
  session: CloudSession;
  disabled?: boolean;
  onSubmit: (classId: string, taskId: string, publicationId?: string) => void;
  onReaction: (classId: string, n: ClassroomNotification) => void;
  onPendingCount?: (count: number) => void;
}) {
  const [items, setItems] = useState<
      (ClassroomNotification & { classId: string })[]
    >([]),
    [read, setRead] = useState<string[]>([]),
    [task, setTask] = useState<{
      classId: string;
      taskId: string;
      publicationId?: string;
      definition?: AssignmentDefinition;
    }>();
  const key = `colorverse.inbox.read.${session.identity.id}`;
  const [status, setStatus] = useState("");
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "[]");
      setRead(
        Array.isArray(value)
          ? value.filter((v) => typeof v === "string").slice(-500)
          : [],
      );
    } catch {
      setRead([]);
    }
  }, [key]);
  const signature =
    session.access === "active"
      ? session.memberships.map((m) => m.classId).join("|")
      : "";
  useEffect(() => {
    let active = true;
    let generation = 0;
    const refresh = () => {
      if (document.hidden) return;
      const attempt = ++generation;
      setStatus("正在读取信息…");
      void Promise.all(
        signature
          .split("|")
          .filter(Boolean)
          .map(async (classId) => {
            const r = await classroomRequest(
              `classes/${classId}/notifications`,
            );
            const value = await r.json();
            return {
              readIds: value.readIds ?? [],
              items: value.notifications.map((n: ClassroomNotification) => ({
                ...n,
                classId,
              })),
            };
          }),
      )
        .then((v) => {
          if (!active || attempt !== generation) return;
          if (active)
            setItems(
              v
                .flatMap((r) => r.items)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
            );
          if (active) {
            setRead(v.flatMap((r) => r.readIds));
            onPendingCount?.(
              v
                .flatMap((r) => r.items)
                .filter((n) => n.kind === "submission" && n.pending).length,
            );
          }
          if (active) setStatus("");
        })
        .catch(() => {
          if (active && attempt === generation)
            setStatus("信息暂时未能读取，请重新读取。");
        });
    };
    refreshRef.current = refresh;
    setItems([]);
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("classroom-data-changed", refresh);
    return () => {
      active = false;
      refreshRef.current = () => {};
      window.removeEventListener("focus", refresh);
      window.removeEventListener("classroom-data-changed", refresh);
    };
  }, [signature, session.identity.id]);
  return (
    <>
      <ClassroomInbox
        disabled={disabled}
        status={status}
        onRefresh={() => refreshRef.current()}
        notifications={items}
        readIds={read}
        onRead={(id) => {
          const next = [...new Set([...read, id])].slice(-500);
          setRead(next);
          const item = items.find((n) => n.id === id);
          if (item)
            void classroomRequest(`classes/${item.classId}/notification-read`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id }),
            }).catch(() => setStatus("已读状态未能保存，请重试。"));
          try {
            localStorage.setItem(key, JSON.stringify(next));
          } catch {}
        }}
        onAssignment={(taskId, notification) => {
          const item = items.find((n) => n.id === notification.id);
          if (item)
            setTask({
              classId: item.classId,
              taskId,
              definition: item.assignment,
              publicationId: item.publicationId,
            });
        }}
        onReaction={(n) => {
          const item = items.find((i) => i.id === n.id);
          if (item) onReaction(item.classId, n);
        }}
      />
      {task && (
        <AssignmentMail
          taskId={task.taskId}
          definition={task.definition}
          onClose={() => setTask(undefined)}
          onSubmit={
            session.access === "active" &&
            session.memberships.some(
              (m) => m.classId === task.classId && m.role === "student",
            )
              ? () => {
                  onSubmit(task.classId, task.taskId, task.publicationId);
                  setTask(undefined);
                }
              : undefined
          }
        />
      )}
    </>
  );
}
