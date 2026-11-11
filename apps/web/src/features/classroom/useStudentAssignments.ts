import { useCallback, useEffect, useState } from "react";
import {
  StudentAssignmentsSchema,
  type CloudSession,
  type StudentAssignments,
} from "@colorverse/contracts";
import { classroomRequest } from "./cloud-request";

export type StudentAssignmentClass = StudentAssignments & {
  classId: string;
  classTitle: string;
  timezone: string;
};
export function useStudentAssignments(
  session: CloudSession | null,
  enabled: boolean,
) {
  const memberships =
    session?.access === "active"
      ? session.memberships.filter((m) => m.role === "student")
      : [];
  const signature = JSON.stringify(
    memberships.map((m) => [m.classId, m.title, m.timezone]),
  );
  const key = enabled ? `${session?.identity.id}:${signature}` : "";
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  const [state, setState] = useState<{
    key: string;
    classes: StudentAssignmentClass[];
    loading: boolean;
    errors: string[];
  }>({ key: "", classes: [], loading: false, errors: [] });
  useEffect(() => {
    if (!key) return;
    const abort = new AbortController();
    const classes = JSON.parse(signature) as [string, string, string][];
    setState((s) => ({
      key,
      classes: s.key === key ? s.classes : [],
      loading: true,
      errors: [],
    }));
    void Promise.allSettled(
      classes.map(async ([classId, classTitle, timezone]) => {
        const response = await classroomRequest(
          `classes/${classId}/management/my-assignments`,
          { signal: abort.signal },
        );
        return {
          ...StudentAssignmentsSchema.parse(await response.json()),
          classId,
          classTitle,
          timezone,
        };
      }),
    ).then((results) => {
      if (abort.signal.aborted) return;
      setState((previous) => ({
        key,
        loading: false,
        classes: results.flatMap((r, i) =>
          r.status === "fulfilled"
            ? [r.value]
            : previous.key === key
              ? previous.classes.filter((c) => c.classId === classes[i][0])
              : [],
        ),
        errors: results.flatMap((r, i) =>
          r.status === "rejected"
            ? [
                `${classes[i][1]}：${r.reason instanceof Error ? r.reason.message : "作业暂时无法读取"}`,
              ]
            : [],
        ),
      }));
    });
    return () => abort.abort();
  }, [key, signature, revision]);
  useEffect(() => {
    if (!key) return;
    window.addEventListener("classroom-data-changed", refresh);
    return () => window.removeEventListener("classroom-data-changed", refresh);
  }, [key, refresh]);
  const current =
    key && state.key === key
      ? state
      : { classes: [], loading: Boolean(key), errors: [] };
  return {
    ...current,
    refresh,
    pendingCount:
      current.errors.length || current.loading
        ? undefined
        : current.classes.reduce(
            (n, c) => n + c.assignments.filter((a) => !a.latestWorkId).length,
            0,
          ),
  };
}
