import { useCallback, useEffect, useState } from "react";
import type { CloudSession, EmotionCase } from "@colorverse/contracts";
import { AuthEntry } from "../auth/AuthEntry";
import { CompetitionView } from "../competition/CompetitionView";
import {
  ExperienceHeader,
  type ExperienceDestination,
} from "./ExperienceHeader";
import { CloudGallery } from "./CloudGallery";
import { CloudStudentGate } from "./CloudStudentGate";
import { CloudClassroomView } from "./CloudClassroomView";
import { CloudInbox } from "./CloudInbox";
import "./classroom.css";
import "../competition/competition.css";
import "../competition/offline-experience.css";
import "./experience.css";

export function CloudExperienceView() {
  const [session, setSession] = useState<CloudSession | null>(null);
  const [classId, setClassId] = useState("");
  const [screen, setScreen] = useState("universe");
  const [teacher, setTeacher] = useState(false);
  const [pending, setPending] = useState(false);
  const [loginRequest, setLoginRequest] = useState(0);
  const [notice, setNotice] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [initialColor, setInitialColor] = useState<EmotionCase>();
  const [navigation, setNavigation] = useState<{
    action: "universe" | "room" | "edit" | "knowledge" | "submit" | "feedback";
    planetId?: string;
    workId?: string | null;
    taskId?: string;
    sequence: number;
  }>({ action: "universe", sequence: 0 });
  const [guestNavigation, setGuestNavigation] = useState({
    destination: "universe" as ExperienceDestination,
    sequence: 0,
  });
  const active =
    session?.access === "active" && session.cloudWrites ? session : null;
  const membership =
    active?.memberships.find((m) => m.classId === classId) ??
    active?.memberships[0];
  const role = !membership
    ? "guest"
    : membership.role === "student"
      ? "student"
      : "teacher";
  useEffect(() => {
    setPending(false);
    setNotice("");
    setClassId(
      session?.access === "active"
        ? (session.memberships[0]?.classId ?? "")
        : "",
    );
    setTeacher(
      session?.access === "active" &&
        session.memberships[0]?.role !== "student",
    );
    setScreen("universe");
  }, [session?.identity.id]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(t);
  }, [notice]);
  const requestLogin = useCallback((color?: EmotionCase) => {
    setInitialColor(color);
    setLoginRequest((n) => n + 1);
  }, []);
  const navigate = (destination: ExperienceDestination) => {
    if (pending) {
      setNotice("请先保存或取消当前修改。");
      return;
    }
    if (!active) {
      setGuestNavigation((n) => ({ destination, sequence: n.sequence + 1 }));
      return;
    }
    setTeacher(destination === "teacher");
    if (destination !== "teacher")
      setNavigation((n) => ({ action: destination, sequence: n.sequence + 1 }));
  };
  const jump = (
    targetClass: string,
    action: "submit" | "feedback",
    data: { taskId?: string; planetId?: string; workId?: string | null },
  ) => {
    if (pending) return;
    setClassId(targetClass);
    setTeacher(false);
    setNavigation((n) => ({ ...data, action, sequence: n.sequence + 1 }));
  };
  return (
    <div
      className={`competition-app offline-app cloud-experience ${screen === "universe" && !teacher ? "universe-active" : ""}`}
      data-experience-mode="cloud"
    >
      <ExperienceHeader
        current={
          teacher
            ? "teacher"
            : screen === "learning"
              ? "knowledge"
              : screen === "gallery"
                ? "room"
                : screen === "create"
                  ? "edit"
                  : ["room", "edit", "knowledge"].includes(screen)
                    ? (screen as ExperienceDestination)
                    : "universe"
        }
        modeLabel={
          location.pathname.startsWith("/review") ||
          membership?.title.includes("评审体验")
            ? "评审体验 · 演示内容"
            : undefined
        }
        pendingCount={pendingCount}
        role={role}
        disabled={pending}
        onNavigate={navigate}
        account={
          <>
            {active && (
              <CloudInbox
                onPendingCount={setPendingCount}
                session={active}
                disabled={pending}
                onSubmit={(id, taskId) => jump(id, "submit", { taskId })}
                onReaction={(id, n) => jump(id, "feedback", n)}
              />
            )}
            <AuthEntry
              key="cloud-auth"
              compact
              onSession={setSession}
              openRequest={loginRequest}
              hasPendingChanges={pending}
              onEnter={async (m) => {
                if (pending) return false;
                setClassId(m.classId);
                setTeacher(m.role !== "student");
                setNavigation((n) => ({
                  action: "universe",
                  sequence: n.sequence + 1,
                }));
                return true;
              }}
            />
          </>
        }
      />
      {notice && (
        <p role="status" className="offline-notice">
          {notice}
        </p>
      )}
      {active && membership ? (
        <main className="competition-main">
          {teacher && role === "teacher" ? (
            <CloudClassroomView
              session={active}
              initialClassId={membership.classId}
              onPendingChange={setPending}
              onPlanetAction={(id, action, targetClass, workId) => {
                setClassId(targetClass);
                setTeacher(false);
                setNavigation((n) => ({
                  action,
                  planetId: id,
                  workId,
                  sequence: n.sequence + 1,
                }));
              }}
            />
          ) : (
            <CloudStudentGate
              key={`${active.identity.id}:${membership.classId}`}
              enabled={role === "student"}
              classId={membership.classId}
            >
              <CloudGallery
                key={`${active.identity.id}:${membership.classId}`}
                session={active}
                initialClassId={membership.classId}
                initialColorCase={initialColor}
                navigation={navigation}
                experience
                onPendingChange={setPending}
                onViewChange={setScreen}
              />
            </CloudStudentGate>
          )}
        </main>
      ) : (
        <CompetitionView
          readOnly
          hideHeader
          navigation={guestNavigation}
          onRequestLogin={requestLogin}
          onViewChange={setScreen}
        />
      )}
    </div>
  );
}
