import { PlanetDesignEditor, type DesignElement } from "./PlanetDesignEditor";
import { blankIntent } from "./LearningPanels";
import { planetAppearancePayload } from "./planet-appearance-payload";
import { useEffect, useState, useRef } from "react";
import { z } from "zod";
import { CloudPlanetDocumentSchema } from "@colorverse/contracts";
import { classroomRequest } from "./cloud-request";
import {
  acquirePrivateImage,
  clearPrivateImages,
} from "./private-image-resource";

let imageActor = "",
  authWatch = false;
export function retryPlanetImages() {
  window.dispatchEvent(new Event("colorverse:retry-private-images"));
}

type PlanetDocument = z.infer<typeof CloudPlanetDocumentSchema>;
export function usePlanetImage(
  classId: string,
  planetId: string,
  kind: "exterior" | "interior",
  mediaId?: string,
) {
  return usePrivateImage(
    `classes/${classId}/planets/${planetId}/${kind}`,
    mediaId,
  );
}
export function usePrivateImage(resource: string, mediaId?: string) {
  const [image, setImage] = useState({
    url: "",
    error: false,
    loading: Boolean(mediaId),
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const retry = () => setAttempt((n) => n + 1);
    window.addEventListener("colorverse:retry-private-images", retry);
    return () =>
      window.removeEventListener("colorverse:retry-private-images", retry);
  }, []);
  useEffect(() => {
    let active = true,
      release: (() => void) | undefined;
    setImage({ url: "", error: false, loading: Boolean(mediaId) });
    if (mediaId)
      void import("../auth/auth-client")
        .then(async ({ getAuthClient }) => {
          const client = getAuthClient();
          if (!authWatch && client) {
            authWatch = true;
            client.auth.onAuthStateChange((event, session) => {
              const actor = session?.user.id ?? "";
              if (event === "SIGNED_OUT" || actor !== imageActor)
                clearPrivateImages();
              imageActor = actor;
            });
          }
          const actor = (await client?.auth.getSession())?.data.session?.user
            .id;
          if (!active) return;
          if (!actor) throw new Error("登录身份已失效");
          if (actor !== imageActor) {
            clearPrivateImages();
            imageActor = actor;
          }
          const lease = acquirePrivateImage(
            `${actor}/${resource}/${mediaId}`,
            (signal) =>
              classroomRequest(resource, { signal }).then((r) => r.blob()),
          );
          release = lease.release;
          const url = await lease.ready;
          if (active) setImage({ url, error: false, loading: false });
        })
        .catch(() => {
          if (active) setImage({ url: "", error: true, loading: false });
        });
    return () => {
      active = false;
      release?.();
    };
  }, [resource, mediaId, attempt]);
  return image;
}
export function CloudPlanetOrb({
  classId,
  id,
  document,
  previewImage,
}: {
  classId: string;
  id: string;
  document: PlanetDocument;
  previewImage?: string;
}) {
  const image = usePlanetImage(
    classId,
    id,
    "exterior",
    document.useDefaultExterior ? undefined : document.media.exterior?.id,
  );
  return (
    <span
      className={`cloud-orb-frame halo-${document.halo}`}
      style={
        {
          "--halo-color": document.color,
          opacity: 1,
          filter: `drop-shadow(0 0 ${document.haloIntensity * 24}px ${document.color})`,
        } as React.CSSProperties
      }
    >
      <img
        className="student-orb cloud-planet-orb"
        alt="星球外貌"
        src={
          previewImage ||
          image.url ||
          `${import.meta.env.BASE_URL}demo/v2/body-${document.skin}.webp`
        }
      />
      {!previewImage && image.loading && (
        <small className="cloud-orb-status">正在读取外貌</small>
      )}
      {!previewImage && image.error && (
        <small className="cloud-orb-status" role="status">
          外貌读取失败
        </small>
      )}
    </span>
  );
}

export type AppearanceSection =
  "exterior" | "atmosphere" | "interior" | "tone" | "summary" | "motion";
export function CloudPlanetAppearance({
  classId,
  id,
  document,
  works = [],
  busy,
  run,
  onSaved,
  onClose,
  onDirtyChange,
  initialSection = "exterior",
  initialColorCase,
}: {
  classId: string;
  id: string;
  document: PlanetDocument;
  works?: DesignElement[];
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  onSaved: () => Promise<unknown>;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  initialSection?: AppearanceSection;
  initialColorCase?: import("@colorverse/contracts").EmotionCase;
}) {
  const [draft, setDraft] = useState(() => ({
      ...document,
      ...(initialColorCase
        ? {
            color: initialColorCase.hex,
            learningIntent: {
              ...(document.learningIntent ?? blankIntent()),
              referenceCaseId: initialColorCase.id,
            },
          }
        : {}),
    })),
    [elements, setElements] = useState(works),
    [files, setFiles] = useState<
      Partial<Record<"exterior" | "interior", File>>
    >({}),
    [urls, setUrls] = useState<
      Partial<Record<"exterior" | "interior", string>>
    >({}),
    [status, setStatus] = useState("");
  const revision = useRef(document.revision);
  const savedElements = useRef(new Map(works.map((w) => [w.id, w])));
  const exterior = usePlanetImage(
      classId,
      id,
      "exterior",
      document.media.exterior?.id,
    ),
    interior = usePlanetImage(
      classId,
      id,
      "interior",
      document.media.interior?.id,
    );
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(document) ||
    Object.keys(files).length > 0 ||
    JSON.stringify(elements) !== JSON.stringify(works);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    const next: Partial<Record<"exterior" | "interior", string>> = {};
    for (const kind of ["exterior", "interior"] as const)
      if (files[kind]) next[kind] = URL.createObjectURL(files[kind]);
    setUrls(next);
    return () => Object.values(next).forEach(URL.revokeObjectURL);
  }, [files]);
  const save = () =>
    void run(async () => {
      setStatus("");
      let partial = false;
      try {
        await classroomRequest(`classes/${classId}/planets/${id}/appearance`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...planetAppearancePayload(draft),
            revision: revision.current,
          }),
        });
        revision.current++;
        partial = true;
        for (const kind of ["exterior", "interior"] as const) {
          const file = files[kind];
          if (!file) continue;
          await classroomRequest(
            `classes/${classId}/planets/${id}/${kind}?requestId=${crypto.randomUUID()}&revision=${revision.current}`,
            {
              method: "POST",
              headers: { "Content-Type": file.type },
              body: file,
            },
          );
          revision.current++;
          setFiles((v) => {
            const n = { ...v };
            delete n[kind];
            return n;
          });
        }
        for (const e of elements) {
          const old = savedElements.current.get(e.id);
          if (
            !old ||
            JSON.stringify({ ...old, revision: undefined }) ===
              JSON.stringify({ ...e, revision: undefined })
          )
            continue;
          await classroomRequest(`classes/${classId}/works/${e.id}/element`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              presetId: e.presetId,
              color: e.color ?? draft.color,
              ...e.params,
              revision: old.revision,
            }),
          });
          savedElements.current.set(e.id, {
            ...e,
            revision: (old.revision ?? 0) + 1,
          });
        }
        await onSaved();
        onClose();
      } catch (e) {
        setStatus(
          (partial ? "部分设置已保存；未完成的修改仍保留。" : "") +
            (e instanceof Error ? e.message : "保存失败，请重试。"),
        );
      }
    });
  return (
    <PlanetDesignEditor
      document={draft}
      onChange={setDraft}
      elements={elements}
      onElementChange={(e) =>
        setElements((v) => v.map((w) => (w.id === e.id ? e : w)))
      }
      exterior={
        urls.exterior ||
        (!draft.useDefaultExterior && exterior.url) ||
        `${import.meta.env.BASE_URL}demo/v2/body-${draft.skin}.webp`
      }
      interior={
        urls.interior ||
        interior.url ||
        `${import.meta.env.BASE_URL}demo/room-${draft.skin}.png`
      }
      onFile={(kind, file) => {
        if (file.size > 8388608) {
          setStatus("图片最多 8 MB");
          return;
        }
        setFiles((v) => ({ ...v, [kind]: file }));
        if (kind === "exterior")
          setDraft((d) => ({ ...d, useDefaultExterior: false }));
      }}
      onTemplate={(skin) => {
        setDraft((d) => ({ ...d, skin, useDefaultExterior: true }));
        setFiles((v) => {
          const n = { ...v };
          delete n.exterior;
          return n;
        });
      }}
      onSave={save}
      onClose={onClose}
      busy={busy}
      dirty={dirty}
      status={status}
      initialTab={
        initialSection === "interior" || initialSection === "atmosphere"
          ? "interior"
          : "exterior"
      }
    />
  );
}
