import { useRef, type ReactNode } from "react";

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
}: {
  story: Story;
  author: string;
  works: { id: string; title: string; createdAt?: string | null }[];
  children: ReactNode;
}) {
  const scene = useRef<HTMLDivElement>(null);
  return (
    <div className="immersive-layout">
      <aside className="planet-story" aria-label="星球创作手记">
        <p className="eyebrow">A WORLD IN MY COLORS</p>
        <h2>{story.name}</h2>
        <small>{author}</small>
        {story.demoWriting && <p className="story-demo-label">演示创作手记</p>}
        <section>
          <h3>写给这颗星球</h3>
          <p>
            {story.summary || "这里还没有写下寄语，先去看看微光里的作品吧。"}
          </p>
        </section>
        {story.reflection && (
          <section>
            <h3>创作碎碎念</h3>
            <p>{story.reflection}</p>
          </section>
        )}
        {story.courseNotes && (
          <section>
            <h3>关于这堂色彩课</h3>
            <p>{story.courseNotes}</p>
          </section>
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
                  <time dateTime={w.createdAt ?? undefined}>
                    {w.createdAt
                      ? new Date(w.createdAt).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                      : "未记录提交时间"}
                  </time>
                </div>
                <b>↗</b>
              </button>
            </li>
          ))}
        </ol>
        <small>定位后点击发光元素，欣赏完整作品。</small>
      </aside>
    </div>
  );
}
