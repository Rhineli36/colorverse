import type { PlanetDocument } from "@colorverse/contracts";
import type { AssetStore } from "@colorverse/application";
import { AssetImage } from "../../app/AssetImage";
import { useEffect, useState } from "react";
export function ShowcaseGallery({
  doc,
  assets,
  busy,
  onAdd,
  onView,
  onGrow,
}: {
  doc: PlanetDocument;
  assets: AssetStore;
  busy: boolean;
  onAdd: () => void;
  onView: (id: string) => void;
  onGrow: (id: string) => void;
}) {
  const works = doc.archiveEntries.filter((a) => a.sourceType === "student");
  const [page, setPage] = useState(1);
  const latestId = works.at(-1)?.id;
  useEffect(() => {
    setPage(1);
  }, [doc.planetId, latestId]);
  const pageCount = Math.max(1, Math.ceil(works.length / 8));
  const activePage = Math.min(page, pageCount);
  const visible = [...works]
    .reverse()
    .slice((activePage - 1) * 8, activePage * 8);
  return (
    <section className="showcase-gallery" aria-label="我的展示作品">
      <div className="showcase-heading">
        <div>
          <p className="eyebrow">MY SHOWCASE</p>
          <h3>我的展示作品 · {works.length}</h3>
        </div>
        <button className="primary small" disabled={busy} onClick={onAdd}>
          添加展示作品
        </button>
      </div>
      {!works.length && (
        <p className="muted">
          把喜欢的作品放进星球档案，让欣赏者看到你的创作历程。
        </p>
      )}
      <div className="showcase-grid">
        {visible.map((work) => {
          const event = doc.growthEvents.find(
            (e) =>
              e.trigger.kind === "archive" &&
              e.trigger.archiveEntryId === work.id,
          );
          return (
            <article key={work.id} className="showcase-work">
              <AssetImage
                assets={assets}
                record={doc.assetRefs.find(
                  (a) => a.assetId === work.imageAssetIds[0],
                )}
                alt={work.title}
              />
              <div>
                <h4>{work.title}</h4>
                <p className="muted">{work.createdOn} · 自选展示</p>
                <button disabled={busy} onClick={() => onView(work.id)}>
                  查看作品
                </button>
                <button
                  disabled={busy || (!!event && event.status !== "proposed")}
                  onClick={() => onGrow(work.id)}
                >
                  {!event
                    ? "生成成长建议"
                    : event.status === "proposed"
                      ? "继续预览成长"
                      : event.status === "accepted"
                        ? "已接受成长"
                        : event.status === "rejected"
                          ? "已跳过成长"
                          : "成长已撤销"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {pageCount > 1 && (
        <nav className="showcase-pagination" aria-label="展示作品分页">
          <button
            disabled={activePage === 1 || busy}
            onClick={() => setPage(activePage - 1)}
          >
            上一页作品
          </button>
          <span>
            {activePage} / {pageCount}
          </span>
          <button
            disabled={activePage === pageCount || busy}
            onClick={() => setPage(activePage + 1)}
          >
            下一页作品
          </button>
        </nav>
      )}
    </section>
  );
}
