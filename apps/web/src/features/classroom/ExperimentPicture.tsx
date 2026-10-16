import { useId } from "react";
import {
  KnowledgeExampleImages,
  knowledgeImageFilter,
  temperatureMatrix,
} from "./knowledge-example-images";
import type { KnowledgeExperimentId } from "./knowledge-experiment-model";

export function ExperimentPicture({
  id,
  value,
  label,
}: {
  id: KnowledgeExperimentId;
  value: number;
  label: string;
}) {
  const filterId = "temperature-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const image = KnowledgeExampleImages[id];
  if (!image) return null;
  return (
    <div className="experiment-photo-frame">
      {id === "K04" && (
        <svg
          className="experiment-filter-defs"
          width="0"
          height="0"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <filter id={filterId} colorInterpolationFilters="sRGB">
              <feColorMatrix
                type="matrix"
                values={temperatureMatrix(value).join(" ")}
              />
            </filter>
          </defs>
        </svg>
      )}
      <img
        className="experiment-sample-image"
        src={`${import.meta.env.BASE_URL}knowledge-examples/${image.file}.webp`}
        alt={label}
        title={image.description}
        width={1536}
        height={1024}
        decoding="async"
        data-scene-id={id}
        style={{
          filter:
            id === "K04"
              ? `url(#${filterId})`
              : knowledgeImageFilter(id, value),
        }}
      />
    </div>
  );
}
