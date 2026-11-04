import { useEffect, useState } from "react";
import { Gallery } from "./CloudGallery";
import { classroomRequest } from "./cloud-request";
import { usePlanetImage, retryPlanetImages } from "./CloudPlanetAppearance";
import { FramedImage } from "./FramedImage";
import { GrowthPreview } from "../growth-preview/GrowthPreview";

export default function ClassroomWardrobe({
  classId,
  onBack,
}: {
  classId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<ReturnType<typeof Gallery.parse>>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError("");
    classroomRequest(`classes/${classId}/planets`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((v) => {
        if (!controller.signal.aborted) setData(Gallery.parse(v));
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "星球读取失败");
      });
    return () => controller.abort();
  }, [classId, attempt]);
  const own = data?.planets.find((p) => p.owner_enrollment_id === data.actorId);
  const exterior = usePlanetImage(
    classId,
    own?.id ?? "",
    "exterior",
    own?.document.useDefaultExterior
      ? undefined
      : own?.document.media.exterior?.id,
  );
  const interior = usePlanetImage(
    classId,
    own?.id ?? "",
    "interior",
    own?.document.media.interior?.id,
  );
  if (error || exterior.error || interior.error)
    return (
      <section className="classroom-board" role="alert">
        <h1>装扮星球</h1>
        <p>{error || "星球图片读取失败，请重新读取。"}</p>
        <button
          onClick={() => {
            retryPlanetImages();
            setAttempt((n) => n + 1);
          }}
        >
          重新读取
        </button>
        <button onClick={onBack}>返回星球</button>
      </section>
    );
  if (!data || exterior.loading || interior.loading)
    return <p role="status">正在读取你的星球…</p>;
  if (!own)
    return (
      <section className="classroom-board">
        <h1>装扮星球</h1>
        <p>创建星球后，可以在这里试戴边框、浮饰和星环。</p>
        <button onClick={onBack}>返回创建星球</button>
      </section>
    );
  const d = own.document;
  const exteriorSrc =
    exterior.url || `${import.meta.env.BASE_URL}demo/v2/body-${d.skin}.webp`;
  const interiorSrc =
    interior.url || `${import.meta.env.BASE_URL}demo/room-${d.skin}.png`;
  return (
    <GrowthPreview
      key={own.id}
      onBack={onBack}
      classroomPlanet={{
        name: d.metadata.name,
        interiorSrc,
        exteriorSrc,
        exterior: (
          <FramedImage
            round
            className="gp-planet-body"
            src={exteriorSrc}
            alt="我的星球外观"
            color={d.color}
            placement={
              d.useDefaultExterior ? undefined : d.imagePlacement.exterior
            }
          />
        ),
        interior: (
          <FramedImage
            className="gp-room-art"
            src={interiorSrc}
            alt="我的星球内部背景"
            color={d.color}
            placement={d.imagePlacement.interior}
            style={{
              filter: `brightness(${d.interiorView.brightness}) saturate(${d.interiorView.saturation})`,
            }}
          />
        ),
      }}
    />
  );
}
