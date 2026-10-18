import { useRef, useState, type ReactNode } from "react";
import { reviewStatus } from "@colorverse/contracts";

type Story = {
  name: string;
  summary: string;
  reflection?: string;
  courseNotes?: string;
  demoWriting?: boolean;
};
export function SceneLayout({
  story,
  author,
  works,
  children,
  showReviewStatus = false,
  onOpenWork,
}: {
  story: Story;
  author: string;
  works: {
    id: string;
    title: string;
    createdAt?: string | null;
    exampleDate?: string;
    score?: number | null;
    comment?: string;
  }[];
  children: ReactNode;
  showReviewStatus?: boolean;
  onOpenWork?: (id: string) => void;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div
      className={`immersive-layout story-overlay-layout ${collapsed ? "story-is-collapsed" : ""}`}
    >
      <aside className="planet-story" aria-label="星球创作手记">
        <button
          className="story-collapse"
          aria-label={collapsed ? "展开星球资料" : "收起星球资料"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? "＋ 星球资料" : "‹ 收起"}
        </button>
        {!collapsed && (
          <div className="planet-story-card">
            <p className="eyebrow">A WORLD IN MY COLORS</p>
            <h2>{story.name}</h2>
            <small>{author}</small>
            <section>
              <h3>写给这颗星球</h3>
              <p>
                {story.summary ||
                  "这里还没有写下寄语，先去看看微光里的作品吧。"}
              </p>
            </section>
          </div>
        )}
        {!collapsed && story.reflection && (
          <details>
            <summary>创作碎碎念</summary>
            <p>{story.reflection}</p>
          </details>
        )}
        {!collapsed && story.courseNotes && (
          <details>
            <summary>关于这堂色彩课</summary>
            <p>{story.courseNotes}</p>
          </details>
        )}
      </aside>
      <div className="immersive-center" ref={scene}>
        {children}
      </div>
      <aside className="scene-work-directory" aria-label="元素与作品时间目录">
        <p className="eyebrow">TRACES OF GROWTH</p>
        <h3>
          微光档案 <small>{works.length.toString().padStart(2, "0")}</small>
        </h3>
        <p>点击目录，找到画面中的元素。</p>
        <ol>
          {works.map((w, i) => (
            <li key={w.id}>
              <button
                onClick={() => {
                  if (onOpenWork) {
                    onOpenWork(w.id);
                    return;
                  }
                  const element = Array.from(
                    scene.current?.querySelectorAll<HTMLElement>(
                      "[data-work-id]",
                    ) ?? [],
                  ).find((e) => e.dataset.workId === w.id);
                  element?.scrollIntoView({
                    block: "nearest",
                    inline: "nearest",
                  });
                  element?.focus({ preventScroll: true });
                }}
                aria-label={`定位元素 ${w.title}`}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{w.title}</strong>
                  {showReviewStatus && (
                    <small className="work-review-status">
                      {reviewStatus(w.score, w.comment)}
                    </small>
                  )}
                  <time dateTime={w.exampleDate ?? w.createdAt ?? undefined}>
                    {w.createdAt
                      ? new Date(w.exampleDate ?? w.createdAt).toLocaleString(
                          "zh-CN",
                          {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          },
                        )
                      : "未记录提交时间"}
                  </time>
                </div>
              </button>
            </li>
          ))}
        </ol>
        <small>点击条目高亮元素，点击元素欣赏作品。</small>
      </aside>
    </div>
  );
}
