import type { PlanetDocument, Hotspot } from "@colorverse/contracts";
import type { AssetStore } from "@colorverse/application";
import { SceneCanvas } from "../../app/SceneCanvas";
import { GrowthPresets } from "@colorverse/contracts";
import { useEffect, useState } from "react";
interface Props {
  workspace: AssetStore;
  doc: PlanetDocument;
  preview: PlanetDocument;
  back: () => Promise<void>;
  setRoute: (v: "studio") => void;
  setModal: (h: Hotspot) => void;
  showGrowthSource: (id: string) => void;
  canEdit: boolean;
  birthLayerId: string | null;
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
  birthLayerId,
}: Props) {
  const [showBirthNotice, setShowBirthNotice] = useState(false);
  useEffect(() => {
    setShowBirthNotice(Boolean(birthLayerId));
    if (!birthLayerId) return;
    const timer = setTimeout(() => setShowBirthNotice(false), 6000);
    return () => clearTimeout(timer);
  }, [birthLayerId]);
  return (
    <main className="room-main">
      <SceneCanvas
        assets={workspace}
        planet={preview}
        scene={preview.interior}
        birthLayerId={birthLayerId}
        options={{
          onHotspot: setModal,
          onGrowth: showGrowthSource,
        }}
      />
      {showBirthNotice && (
        <div className="room-birth-notice" role="status">
          <strong>✦ 作品已提交，新元素正在生长</strong>
          <span>点击它查看这次作业，在展示窗口中可以编辑元素。</span>
        </div>
      )}
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
        {doc.growthEvents
          .filter((e) => e.status === "accepted")
          .flatMap((e) => e.elements)
          .map((el) => {
            const source = doc.interior.layers.find(
              (l) => l.id === el.layerId,
            )?.source;
            const presetId =
              source && "presetId" in source && source.presetId !== "sphere"
                ? source.presetId
                : el.presetId;
            return (
              <button
                className="outline small"
                key={el.layerId}
                onClick={() => showGrowthSource(el.layerId)}
              >
                查看作业 · {GrowthPresets[presetId].name}
              </button>
            );
          })}
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
