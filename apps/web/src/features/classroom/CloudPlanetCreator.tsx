import { useEffect, useRef, useState } from "react";
import { cloudPlanetFromPreset, type EmotionCase } from "@colorverse/contracts";
import { PlanetDesignEditor } from "./PlanetDesignEditor";
import { planetAppearancePayload } from "./planet-appearance-payload";
import { classroomRequest } from "./cloud-request";

export function CloudPlanetCreator({
  classId,
  initialColor,
  onSaved,
  onClose,
  onPendingChange,
}: {
  classId: string;
  initialColor?: EmotionCase;
  onSaved: (id: string) => Promise<unknown>;
  onClose: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => {
    const d = cloudPlanetFromPreset(0);
    if (initialColor) {
      d.color = initialColor.hex;
      d.learningIntent = {
        ...d.learningIntent!,
        referenceCaseId: initialColor.id,
      };
    }
    return d;
  });
  const original = useRef(JSON.stringify(draft));
  const [files, setFiles] = useState<
    Partial<Record<"exterior" | "interior", File>>
  >({});
  const [urls, setUrls] = useState<
    Partial<Record<"exterior" | "interior", string>>
  >({});
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const checkpoint = useRef<{ id: string; revision: number } | undefined>(
    undefined,
  );
  const dirty =
    JSON.stringify(draft) !== original.current || Object.keys(files).length > 0;
  useEffect(() => {
    onPendingChange?.(busy || dirty);
  }, [busy, dirty, onPendingChange]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);
  useEffect(() => {
    const next: typeof urls = {};
    for (const kind of ["exterior", "interior"] as const)
      if (files[kind]) next[kind] = URL.createObjectURL(files[kind]);
    setUrls(next);
    return () => Object.values(next).forEach(URL.revokeObjectURL);
  }, [files]);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      if (!checkpoint.current) {
        const r = await (
          await classroomRequest(`classes/${classId}/planets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(planetAppearancePayload(draft)),
          })
        ).json();
        if (!r.created) {
          await onSaved(r.id);
          return;
        }
        checkpoint.current = { id: r.id, revision: 0 };
      }
      const state = checkpoint.current;
      await classroomRequest(
        `classes/${classId}/planets/${state.id}/appearance`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...planetAppearancePayload(draft),
            revision: state.revision,
          }),
        },
      );
      state.revision++;
      for (const kind of ["exterior", "interior"] as const) {
        const file = files[kind];
        if (!file) continue;
        await classroomRequest(
          `classes/${classId}/planets/${state.id}/${kind}?requestId=${crypto.randomUUID()}&revision=${state.revision}`,
          {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          },
        );
        state.revision++;
        setFiles((v) => {
          const n = { ...v };
          delete n[kind];
          return n;
        });
      }
      await onSaved(state.id);
    } catch (e) {
      setStatus(
        (checkpoint.current ? "星球已创建，未完成的设置仍保留。" : "") +
          (e instanceof Error ? e.message : "创建失败，请重试。"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlanetDesignEditor
      document={draft}
      onChange={setDraft}
      exterior={
        urls.exterior ??
        `${import.meta.env.BASE_URL}demo/v2/body-${draft.skin}.webp`
      }
      interior={
        urls.interior ??
        `${import.meta.env.BASE_URL}demo/room-${draft.skin}.png`
      }
      onFile={(kind, file) => {
        if (!/image\/(png|jpeg|webp)/.test(file.type) || file.size > 8388608) {
          setStatus("请选择 8 MB 以内的 PNG、JPEG 或 WebP 图片。");
          return;
        }
        setFiles((v) => ({ ...v, [kind]: file }));
        setDraft((d) => ({
          ...d,
          imagePlacement: {
            ...d.imagePlacement,
            [kind]: { x: 0, y: 0, scale: 1 },
          },
        }));
        if (kind === "exterior")
          setDraft((d) => ({ ...d, useDefaultExterior: false }));
      }}
      onTemplate={(skin) => {
        setDraft((d) => ({
          ...d,
          ...cloudPlanetFromPreset(skin),
          metadata: d.metadata,
          imagePlacement: { ...d.imagePlacement, exterior: undefined },
        }));
        setFiles((v) => {
          const next = { ...v };
          delete next.exterior;
          return next;
        });
      }}
      onSave={() => void save()}
      onClose={() => {
        if (checkpoint.current) void onSaved(checkpoint.current.id);
        else onClose();
      }}
      busy={busy}
      dirty={dirty}
      status={status}
    />
  );
}
