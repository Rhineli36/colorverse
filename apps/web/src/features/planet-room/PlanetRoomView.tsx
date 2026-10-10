import type { PlanetDocument, Hotspot } from "@colorverse/contracts";
import type { AssetStore } from "@colorverse/application";
import { SceneCanvas } from "../../app/SceneCanvas";
interface Props {
  workspace: AssetStore;
  doc: PlanetDocument;
  preview: PlanetDocument;
  back: () => Promise<void>;
  setRoute: (v: "studio") => void;
  setModal: (h: Hotspot) => void;
  showGrowthSource: (id: string) => void;
  canEdit: boolean;
}

export function PlanetRoomView({
  workspace,
  doc,
  preview,
  back,
  setRoute,
  setModal,
  showGrowthSource,
  canEdit,
}: Props) {
  return (
    <main className="room-main">
      <SceneCanvas
        assets={workspace}
        planet={preview}
        scene={preview.interior}
        options={{ onHotspot: setModal, onGrowth: showGrowthSource }}
      />
      <div className="room-title">
        <button className="outline small" onClick={() => void back()}>
          ← 返回宇宙
        </button>
        <p className="eyebrow">欣赏模式 · INSIDE THE PLANET</p>
        <h1>{doc.metadata.name}</h1>
        <p>{doc.metadata.description}</p>
        <div className="tags">
          {doc.metadata.emotionTags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
      <div className="room-caption">
        <span>✦ {doc.metadata.monologue}</span>
        {canEdit && (
          <button className="primary" onClick={() => setRoute("studio")}>
            编辑这颗星球 ↗
          </button>
        )}
      </div>
      <div className="archive-buttons">
        {doc.archiveEntries
          .filter((a) => a.sourceType === "student")
          .map((a) => (
            <button
              className="outline small"
              key={a.id}
              onClick={() =>
                setModal({
                  id: a.id,
                  sceneId: doc.interior.id,
                  anchorLayerId: null,
                  geometry: { type: "circle", x: 0, y: 0, radius: 1 },
                  accessibleLabel: a.title,
                  action: { type: "openArchive", archiveEntryId: a.id },
                })
              }
            >
              {a.title} ↗
            </button>
          ))}
        {doc.interior.hotspots.map((h) => (
          <button
            className="outline small"
            key={h.id}
            onClick={() => setModal(h)}
          >
            {h.accessibleLabel} ↗
          </button>
        ))}
      </div>
    </main>
  );
}
