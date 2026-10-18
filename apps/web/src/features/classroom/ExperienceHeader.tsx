import type { ReactNode } from "react";
import { BackgroundMusic } from "./BackgroundMusic";

export type ExperienceDestination =
  "universe" | "room" | "edit" | "knowledge" | "teacher";
export function ExperienceHeader({
  role,
  onNavigate,
  account,
  disabled = false,
  pendingCount = 0,
}: {
  role: "guest" | "student" | "teacher";
  onNavigate: (destination: ExperienceDestination) => void;
  account: ReactNode;
  disabled?: boolean;
  pendingCount?: number;
}) {
  return (
    <header className="competition-header">
      <button
        className="competition-brand"
        disabled={disabled}
        onClick={() => onNavigate("universe")}
      >
        ◉ COLORVERSE <span>色 彩 星 球</span>
      </button>
      <nav aria-label="主导航">
        <button disabled={disabled} onClick={() => onNavigate("universe")}>
          探索宇宙
        </button>
        {role === "student" && (
          <>
            <button disabled={disabled} onClick={() => onNavigate("room")}>
              我的星球
            </button>
            <button disabled={disabled} onClick={() => onNavigate("edit")}>
              编辑星球
            </button>
          </>
        )}
        <button disabled={disabled} onClick={() => onNavigate("knowledge")}>
          色彩的奥秘
        </button>
        {role === "teacher" && (
          <button disabled={disabled} onClick={() => onNavigate("teacher")}>
            教师管理{" "}
            {pendingCount > 0 && <b className="inbox-count">{pendingCount}</b>}
          </button>
        )}
      </nav>
      <div className="offline-account-controls">
        <BackgroundMusic />
        {account}
      </div>
    </header>
  );
}

export function RoleChoices({
  onChoose,
}: {
  onChoose: (role: "student" | "teacher") => void;
}) {
  return (
    <div className="offline-role-choices">
      <button onClick={() => onChoose("student")}>
        <span>01 / CREATE</span>
        <strong>学生登录</strong>
        <small>创造我的星球</small>
      </button>
      <button onClick={() => onChoose("teacher")}>
        <span>02 / GUIDE</span>
        <strong>教师登录</strong>
        <small>看见每一次生长</small>
      </button>
    </div>
  );
}
