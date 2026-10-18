import { useEffect, useState } from "react";
import { AssignmentPublisher } from "./ClassroomMail";
import {
  LearningTaskSettingSchema,
  AssignmentCatalog,
  ClassroomOverviewSchema,
  type ClassroomOverview,
  type CloudSession,
  type AssignmentDefinition,
} from "@colorverse/contracts";
import { Gallery, CloudGallery } from "./CloudGallery";
import type { z } from "zod";
import { TeacherDashboard } from "./TeacherDashboard";
import { classroomRequest } from "./cloud-request";
import { presentationName } from "./presentation-name";
import "./classroom.css";
export { classroomRequest } from "./cloud-request";
export function CloudClassroomView({
  session,
  initialClassId,
  onPendingChange,
  onPlanetAction,
}: {
  session: CloudSession | null;
  initialClassId?: string;
  onPendingChange?: (pending: boolean) => void;
  onPlanetAction?: (
    id: string,
    action: "room" | "edit",
    classId: string,
  ) => void;
}) {
  const memberships =
    session?.access === "active"
      ? session.memberships.filter(
          (m) => m.role === "teacher" || m.role === "assistant",
        )
      : [];
  const [classId, setClassId] = useState(
    memberships.find((m) => m.classId === initialClassId)?.classId ??
      memberships[0]?.classId ??
      "",
  );
  const [data, setData] = useState<ClassroomOverview | null>(null),
    [gallery, setGallery] = useState<z.infer<typeof Gallery> | null>(null);
  const [catalog, setCatalog] =
    useState<AssignmentDefinition[]>(AssignmentCatalog);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const [target, setTarget] = useState<{
    id: string;
    action: "room" | "edit";
  }>();
  useEffect(() => {
    if (memberships.some((m) => m.classId === initialClassId))
      setClassId(initialClassId!);
  }, [initialClassId]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setData(null);
    setGallery(null);
    setError("");
    if (!classId) {
      setBusy(false);
      return;
    }
    void Promise.all([
      classroomRequest(`classes/${classId}/overview`)
        .then((r) => r.json())
        .then((v) => ClassroomOverviewSchema.parse(v)),
      classroomRequest(`classes/${classId}/planets`)
        .then((r) => r.json())
        .then((v) => Gallery.parse(v)),
      classroomRequest(`classes/${classId}/learning-tasks`).then((r) =>
        r.json(),
      ),
    ])
      .then(([overview, planets, tasks]) => {
        if (active) {
          setData(overview);
          setGallery(planets);
          setCatalog([
            ...AssignmentCatalog,
            ...tasks.tasks
              .map((t: unknown) => LearningTaskSettingSchema.parse(t))
              .flatMap((t: { definition?: AssignmentDefinition }) =>
                t.definition ? [t.definition] : [],
              ),
          ]);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [classId, revision, session?.identity.id]);
  const open = (id: string, action: "room" | "edit") =>
    onPlanetAction
      ? onPlanetAction(id, action, classId)
      : setTarget({ id, action });
  if (!memberships.length)
    return <p className="experience-error">请登录教师账户后查看班级。</p>;
  if (target && session)
    return (
      <CloudGallery
        session={session}
        initialClassId={classId}
        initialPlanetId={target.id}
        navigation={{ action: target.action, planetId: target.id, sequence: 1 }}
        experience
        onPendingChange={onPendingChange}
        onBack={() => {
          setTarget(undefined);
          setRevision((n) => n + 1);
        }}
      />
    );
  return (
    <>
      {error && (
        <p role="alert" className="experience-error">
          {error}
          <button onClick={() => setRevision((n) => n + 1)}>
            重新读取班级
          </button>
        </p>
      )}
      <TeacherDashboard
        busy={busy}
        rows={(data?.students ?? []).map((s) => {
          const p = gallery?.planets.find(
            (p) => p.owner_enrollment_id === s.enrollment_id,
          );
          return {
            id: p?.id ?? s.enrollment_id,
            name: p?.document.metadata.name ?? "等待创建星球",
            author: presentationName(s.display_name),
            works: s.showcase_count,
            sent: s.sent_count,
            received: s.received_count,
            reviewed: s.reviewed_showcase_count,
            hasPlanet: Boolean(p),
            visible: p?.document.visible ?? true,
            stationary: p?.document.motion.mode === "stationary",
          };
        })}
        tools={
          <>
            {memberships.length > 1 && (
              <select
                aria-label="管理班级"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                {memberships.map((m) => (
                  <option key={m.classId} value={m.classId}>
                    {m.title}
                  </option>
                ))}
              </select>
            )}
            <button disabled={busy} onClick={() => setRevision((n) => n + 1)}>
              刷新统计
            </button>
          </>
        }
        onEnter={(id) => open(id, "room")}
        onEdit={(id) => open(id, "edit")}
        onVisibility={async (id, visible) => {
          const p = gallery?.planets.find((p) => p.id === id);
          if (!p) throw Error("星球暂不可用，请刷新。");
          setBusy(true);
          try {
            await classroomRequest(
              `classes/${classId}/planets/${id}/visibility`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  visible,
                  revision: p.document.revision,
                }),
              },
            );
            setRevision((n) => n + 1);
          } finally {
            setBusy(false);
          }
        }}
        publisher={
          <AssignmentPublisher
            catalog={catalog}
            disabled={busy}
            onCreate={async (definition, image, requestId) => {
              const body = new FormData();
              body.set("metadata", JSON.stringify({ requestId, definition }));
              if (image) body.set("image", image);
              await classroomRequest(`classes/${classId}/learning-tasks`, {
                method: "POST",
                body,
              });
              setRevision((n) => n + 1);
            }}
            onPublish={async (taskId) => {
              const value = await (
                await classroomRequest(`classes/${classId}/learning-tasks`)
              ).json();
              const task = value.tasks
                .map((t: unknown) => LearningTaskSettingSchema.parse(t))
                .find((t: { taskId: string }) => t.taskId === taskId);
              if (!task) throw Error("作业暂不可用，请刷新。");
              await classroomRequest(`classes/${classId}/learning-tasks`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...task, published: true }),
              });
              setRevision((n) => n + 1);
            }}
          />
        }
      />
    </>
  );
}
