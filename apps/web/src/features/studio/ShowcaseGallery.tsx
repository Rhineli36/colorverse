import type { PlanetDocument } from "@colorverse/contracts";
import type { AssetStore } from "@colorverse/application";
import { AssetImage } from "../../app/AssetImage";
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
        {[...works].reverse().map((work) => {
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
    </section>
  );
}
