import { useEffect, useRef, useState } from "react";
import { cloudPlanetFromPreset, type EmotionCase } from "@colorverse/contracts";
import { PlanetDesignEditor } from "../classroom/PlanetDesignEditor";
import { prepareImage } from "../../adapters/local/images";
import { blankIntent } from "../classroom/LearningPanels";
import type { ExperiencePlanetData } from "./competition-model";
export async function importOfflineImage(file: File) {
  const prepared = await prepareImage(file, "本机创作者");
  const path =
    prepared.record.variants.find((v) => v.kind === "display")?.path ??
    prepared.record.original.path;
  return {
    key: "local:" + prepared.record.assetId,
    blob: prepared.files.get(path)!,
    original: file,
  };
}
export function OfflinePlanetEditor({
  planet,
  initialCase,
  onSave,
  onClose,
  busy,
  resolveImage,
  onDirtyChange,
}: {
  planet: ExperiencePlanetData | null;
  initialCase?: EmotionCase;
  onSave: (p: ExperiencePlanetData, m: Map<string, Blob>) => Promise<void>;
  onClose: () => void;
  busy: boolean;
  resolveImage?: (key: string) => string | undefined;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const original = useRef(planet),
    [draft, setDraft] = useState<ExperiencePlanetData>(() =>
      structuredClone(
        planet ?? {
          id: "my-offline-planet",
          display_name: "我的创作",
          document: cloudPlanetFromPreset(0),
          sent: 0,
          received: 0,
          works: [],
          visible: true,
        },
      ),
    );
  const [media, setMedia] = useState(new Map<string, Blob>()),
    [urls, setUrls] = useState(new Map<string, string>()),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (initialCase)
      setDraft((d) => ({
        ...d,
        document: {
          ...d.document,
          color: initialCase.hex,
          learningIntent: {
            ...(d.document.learningIntent ?? blankIntent()),
            referenceCaseId: initialCase.id,
          },
        },
      }));
  }, [initialCase?.id]);
  useEffect(() => {
    const next = new Map(
      Array.from(media, ([key, blob]) => [key, URL.createObjectURL(blob)]),
    );
    setUrls(next);
    return () => {
      for (const url of next.values()) URL.revokeObjectURL(url);
    };
  }, [media]);
  const upload = async (kind: "exterior" | "interior", file?: File) => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const result = await importOfflineImage(file);
      setMedia((m) =>
        new Map(m)
          .set(result.key, result.blob)
          .set(result.key + "-original", result.original),
      );
      setDraft((d) => ({
        ...d,
        [kind]: result.key,
        document: {
          ...d.document,
          ...(kind === "exterior" ? { useDefaultExterior: false } : {}),
          revision: d.document.revision + 1,
          imagePlacement: {
            ...d.document.imagePlacement,
            [kind]: { x: 0, y: 0, scale: 1 },
          },
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片读取失败");
    } finally {
      setLoading(false);
    }
  };
  const changed =
    JSON.stringify(original.current) !== JSON.stringify(draft) ||
    media.size > 0;
  useEffect(() => {
    onDirtyChange?.(changed);
  }, [changed, onDirtyChange]);
  return (
    <PlanetDesignEditor
      document={draft.document}
      onChange={(document) => setDraft((d) => ({ ...d, document }))}
      exterior={
        draft.exterior
          ? (urls.get(draft.exterior) ??
            resolveImage?.(draft.exterior) ??
            `${import.meta.env.BASE_URL}competition/${draft.exterior}`)
          : `${import.meta.env.BASE_URL}demo/v2/body-${draft.document.skin}.webp`
      }
      interior={
        draft.interior
          ? (urls.get(draft.interior) ??
            resolveImage?.(draft.interior) ??
            `${import.meta.env.BASE_URL}competition/${draft.interior}`)
          : `${import.meta.env.BASE_URL}demo/room-${draft.document.skin}.png`
      }
      elements={draft.works}
      onElementChange={(element) =>
        setDraft((d) => ({
          ...d,
          works: d.works.map((w) =>
            w.id === element.id ? { ...w, ...element } : w,
          ),
        }))
      }
      onFile={(kind, file) => void upload(kind, file)}
      onTemplate={(skin) =>
        setDraft((d) => ({
          ...d,
          exterior: undefined,
          document: planet
            ? {
                ...d.document,
                skin,
                useDefaultExterior: true,
                imagePlacement: {
                  ...d.document.imagePlacement,
                  exterior: undefined,
                },
              }
            : {
                ...d.document,
                ...cloudPlanetFromPreset(skin),
                metadata: d.document.metadata,
                imagePlacement: {
                  ...d.document.imagePlacement,
                  exterior: undefined,
                },
              },
        }))
      }
      onSave={() => void onSave(draft, media)}
      onClose={onClose}
      busy={busy || loading}
      dirty={changed}
      status={error}
    />
  );
}
