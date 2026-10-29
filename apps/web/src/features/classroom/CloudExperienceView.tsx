import { useCallback, useEffect, useState, lazy, Suspense } from "react";
import type { CloudSession, EmotionCase } from "@colorverse/contracts";
import { AuthEntry } from "../auth/AuthEntry";
import { CompetitionView } from "../competition/CompetitionView";
import {
  ExperienceHeader,
  type ExperienceDestination,
} from "./ExperienceHeader";
import { CloudGallery } from "./CloudGallery";
import { CloudStudentGate } from "./CloudStudentGate";
import { TeacherClassroomStudio } from "./TeacherClassroomStudio";
import { CloudClassroomView } from "./CloudClassroomView";
import { CloudInbox } from "./CloudInbox";
import "./classroom.css";
import "../competition/competition.css";
import "../competition/offline-experience.css";
import "./experience.css";
import { ColorMystery } from "./ColorMystery";
import {
  ColorLabEnabled,
  STUDY_PATH,
  labNavigate,
  useLabLocation,
} from "../color-lab/lab-navigation";
import { experiments } from "../color-lab/experiments";
const JellyfishLab = lazy(experiments[0].load);
const TreeLab = lazy(() => import("../color-lab/TreeLab"));
const WeightLab = lazy(() => import("../color-lab/WeightLab"));

export function CloudExperienceView() {
  const labLocation = useLabLocation();
  const labEnabled =
    import.meta.env.VITE_CLASSROOM_NEXT === "true" &&
    !/^\/(review|exhibition)(\/|$)/.test(location.pathname);
  const labOpen = labEnabled && labLocation.experiment;
  const studyOpen = labEnabled && labLocation.study;
  useEffect(() => {
    if (!labOpen) return;
    const header = document.querySelector<HTMLElement>(
      ".cloud-experience > .competition-header",
    );
    if (!header) return;
    const resize = () =>
      document.documentElement.style.setProperty(
        "--lab-header-height",
        header.getBoundingClientRect().height + "px",
      );
    const observer = new ResizeObserver(resize);
    observer.observe(header);
    resize();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--lab-header-height");
    };
  }, [labOpen]);
  const [session, setSession] = useState<CloudSession | null>(null);
  const [reviewWorkId, setReviewWorkId] = useState<string>();
  const [reviewWorkRequest, setReviewWorkRequest] = useState(0);
  const TeacherView =
    import.meta.env.VITE_CLASSROOM_NEXT === "true"
      ? TeacherClassroomStudio
      : CloudClassroomView;
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
    publicationId?: string;
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
    if (labEnabled) {
      if (destination === "knowledge") {
        labNavigate(STUDY_PATH);
        return;
      }
      if (labOpen || studyOpen) labNavigate(import.meta.env.BASE_URL);
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
    data: {
      taskId?: string;
      publicationId?: string;
      planetId?: string;
      workId?: string | null;
    },
  ) => {
    if (pending) return;
    setClassId(targetClass);
    setTeacher(false);
    setNavigation((n) => ({ ...data, action, sequence: n.sequence + 1 }));
  };
  return (
    <ColorLabEnabled.Provider value={labEnabled}>
      <div
        className={`competition-app offline-app cloud-experience ${!labOpen && !studyOpen && screen === "universe" && !teacher ? "universe-active" : ""} ${labOpen ? "lab-open" : ""} ${labOpen && labLocation.classroom ? "lab-classroom" : ""}`}
        data-experience-mode="cloud"
      >
        <ExperienceHeader
          current={
            labOpen || studyOpen
              ? "knowledge"
              : teacher
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
                  onSubmit={(id, taskId, publicationId) =>
                    jump(id, "submit", { taskId, publicationId })
                  }
                  onReaction={(id, n) => {
                    if (
                      import.meta.env.VITE_CLASSROOM_NEXT === "true" &&
                      role === "teacher" &&
                      n.workId
                    ) {
                      setClassId(id);
                      setReviewWorkId(n.workId);
                      setReviewWorkRequest((v) => v + 1);
                      setTeacher(true);
                    } else jump(id, "feedback", n);
                  }}
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
        {labOpen ? (
          <main className="competition-main">
            <Suspense fallback={<p role="status">正在载入色彩实验…</p>}>
              {labLocation.weight ? (
                <WeightLab classroom={labLocation.classroom} />
              ) : labLocation.tree ? (
                <TreeLab classroom={labLocation.classroom} />
              ) : (
                <JellyfishLab classroom={labLocation.classroom} />
              )}
            </Suspense>
          </main>
        ) : studyOpen ? (
          <main className="competition-main">
            <ColorMystery
              routedTab={labLocation.tab}
              onBack={() => navigate("universe")}
              onApplyColor={(c) => {
                setInitialColor(c);
                if (role === "student") navigate("edit");
                else requestLogin(c);
              }}
            />
          </main>
        ) : active && membership ? (
          <main className="competition-main">
            {teacher && role === "teacher" ? (
              <TeacherView
                {...(import.meta.env.VITE_CLASSROOM_NEXT === "true"
                  ? {
                      initialWorkId: reviewWorkId,
                      initialWorkRequest: reviewWorkRequest,
                    }
                  : {})}
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
    </ColorLabEnabled.Provider>
  );
}
