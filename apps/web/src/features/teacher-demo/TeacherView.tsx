import type { RefObject } from "react";
import type { PlanetDocument, UniverseDocument } from "@colorverse/contracts";
import type { WorkspaceRepository, AssetStore } from "@colorverse/application";
import { clone } from "@colorverse/domain";
import { exportPackage } from "@colorverse/package-io";
import { AssetImage } from "../../app/AssetImage";
import { download } from "../../app/download";
interface Props {
  workspace: WorkspaceRepository & AssetStore;
  planets: PlanetDocument[];
  universe: UniverseDocument;
  busy: boolean;
  importInput: RefObject<HTMLInputElement | null>;
  refresh: () => Promise<void>;
  open: (id: string, to: "studio" | "room") => Promise<void>;
  action: (fn: () => Promise<void>) => Promise<void>;
}

export function TeacherView({
  workspace,
  planets,
  universe,
  busy,
  importInput,
  refresh,
  open,
  action,
}: Props) {
  return (
    <main className="teacher-main">
      <p className="eyebrow">TEACHER DEMO · 本地演示管理</p>
      <h1>汇集每一颗独特的星球。</h1>
      <p className="muted">
        本页管理当前浏览器的作品宇宙。正式账号与班级权限将在第二阶段接入。
      </p>
      <div className="teacher-actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() => importInput.current?.click()}
        >
          ＋ 导入学生作品包
        </button>
        <button
          className="outline"
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const docs = await Promise.all(
                universe.entries.map((e) => workspace.get(e.planetId)),
              );
              download(
                await exportPackage(docs, workspace, universe),
                "COLORVERSE-universe-backup.zip",
              );
            })
          }
        >
          导出完整宇宙备份 ↗
        </button>
      </div>
      <div className="teacher-cards">
        {universe.entries.map((entry) => {
          const p = planets.find((p) => p.planetId === entry.planetId);
          return (
            p && (
              <article key={p.planetId}>
                <AssetImage
                  assets={workspace}
                  record={p.assetRefs[0]}
                  alt={p.metadata.name}
                />
                <span className={`visibility ${entry.visible ? "" : "hidden"}`}>
                  {entry.visible ? "展览中" : "已隐藏"}
                </span>
                <h2>{p.metadata.name}</h2>
                <p>{p.metadata.authorDisplayName}</p>
                <div className="tags">
                  {p.metadata.emotionTags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <div className="row-buttons">
                  <button
                    onClick={() =>
                      void action(async () => {
                        const u = clone(universe);
                        u.entries.find(
                          (e) => e.planetId === p.planetId,
                        )!.visible = !entry.visible;
                        await workspace.saveUniverse(u);
                        await refresh();
                      })
                    }
                  >
                    {entry.visible ? "隐藏" : "显示"}
                  </button>
                  <button
                    onClick={() =>
                      void action(async () => open(p.planetId, "studio"))
                    }
                  >
                    编辑
                  </button>
                  <button
                    onClick={() =>
                      void action(async () => {
                        if (
                          !confirm(
                            `从此宇宙移除“${p.metadata.name}”？作品本体仍保留在本地。`,
                          )
                        )
                          return;
                        await workspace.removeFromUniverse(p.planetId);
                        await refresh();
                      })
                    }
                  >
                    移除
                  </button>
                </div>
              </article>
            )
          );
        })}
      </div>
    </main>
  );
}
