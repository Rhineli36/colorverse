import type { ReactNode } from "react";
import { BackgroundMusic } from "./BackgroundMusic";
import "./experience-navigation.css";

export type ExperienceDestination =
  "universe" | "room" | "edit" | "knowledge" | "teacher";
export function ExperienceHeader({
  role,
  onNavigate,
  account,
  disabled = false,
  pendingCount = 0,
  modeLabel,
  current = "universe",
}: {
  role: "guest" | "student" | "teacher";
  onNavigate: (destination: ExperienceDestination) => void;
  account: ReactNode;
  disabled?: boolean;
  pendingCount?: number;
  modeLabel?: string;
  current?: ExperienceDestination;
}) {
  const activeDestination =
    role !== "student" && (current === "room" || current === "edit")
      ? "universe"
      : current;
  return (
    <header className="competition-header">
      <button
        className="competition-brand"
        disabled={disabled}
        onClick={() => onNavigate("universe")}
      >
        <svg
          className="competition-brand-mark"
          viewBox="0 0 56 56"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="27"
            cy="29"
            r="22"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.8"
          />
          <ellipse
            cx="27"
            cy="29"
            rx="19"
            ry="23"
            transform="rotate(30 27 29)"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.65"
          />
          <circle cx="27" cy="29" r="11" fill="currentColor" />
          <circle
            cx="46"
            cy="15"
            r="4.5"
            fill="currentColor"
            stroke="#07121e"
            strokeWidth="2"
          />
        </svg>
        <span className="competition-brand-wordmark">
          <span className="competition-brand-english">COLORVERSE</span>
          <span className="competition-brand-chinese" lang="zh-CN">
            色彩星球
          </span>
        </span>
      </button>
      <nav aria-label="主导航">
        <button
          aria-current={activeDestination === "universe" ? "page" : undefined}
          disabled={disabled}
          onClick={() => onNavigate("universe")}
        >
          探索宇宙
        </button>
        {role === "student" && (
          <>
            <button
              aria-current={activeDestination === "room" ? "page" : undefined}
              disabled={disabled}
              onClick={() => onNavigate("room")}
            >
              我的星球
            </button>
            <button
              aria-current={activeDestination === "edit" ? "page" : undefined}
              disabled={disabled}
              onClick={() => onNavigate("edit")}
            >
              编辑星球
            </button>
          </>
        )}
        <button
          aria-current={activeDestination === "knowledge" ? "page" : undefined}
          disabled={disabled}
          onClick={() => onNavigate("knowledge")}
        >
          色彩的奥秘
        </button>
        {role === "teacher" && (
          <button
            aria-current={activeDestination === "teacher" ? "page" : undefined}
            disabled={disabled}
            onClick={() => onNavigate("teacher")}
          >
            教师管理{" "}
            {pendingCount > 0 && <b className="inbox-count">{pendingCount}</b>}
          </button>
        )}
      </nav>
      <div className="offline-account-controls">
        {modeLabel && (
          <span className="experience-mode-badge">{modeLabel}</span>
        )}
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
