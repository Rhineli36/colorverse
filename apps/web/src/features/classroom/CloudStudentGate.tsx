import { useEffect, useState, type ReactNode } from "react";
import { type StudentIdentity } from "@colorverse/contracts";
import { classroomRequest } from "./cloud-request";
import { StudentIdentityForm } from "./StudentIdentityForm";
export function CloudStudentGate({
  classId,
  children,
  enabled = true,
}: {
  classId: string;
  children: ReactNode;
  enabled?: boolean;
}) {
  const [profile, setProfile] = useState<StudentIdentity | null>(),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setProfile(undefined);
    setError("");
    void classroomRequest(`classes/${classId}/profile`)
      .then((r) => r.json())
      .then((r) => {
        if (active) setProfile(r.profile);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [classId, retry, enabled]);
  if (!enabled) return children;
  if (error)
    return (
      <p role="alert">
        {error}
        <button onClick={() => setRetry((n) => n + 1)}>重新读取身份</button>
      </p>
    );
  if (profile === undefined) return <p role="status">正在读取创作者资料…</p>;
  if (profile === null)
    return (
      <StudentIdentityForm
        onSave={async (p) => {
          const r = await classroomRequest(`classes/${classId}/profile`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p),
          });
          setProfile((await r.json()).profile);
        }}
      />
    );
  return children;
}
