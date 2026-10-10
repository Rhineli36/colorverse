import { useEffect, useState } from "react";
import type { AssetRecord } from "@colorverse/contracts";
import type { AssetStore } from "@colorverse/application";
export function AssetImage({
  record,
  assets,
  alt,
  className = "",
  variant = "thumbnail",
}: {
  record?: AssetRecord;
  assets: AssetStore;
  alt: string;
  className?: string;
  variant?: "thumbnail" | "display";
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false,
      url = "";
    if (record)
      assets
        .resolve(record, variant)
        .then((blob) => {
          url = URL.createObjectURL(blob);
          if (!cancelled) setSrc(url);
          else URL.revokeObjectURL(url);
        })
        .catch(() => {
          if (!cancelled) setSrc("");
        });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [record, assets, variant]);
  return src ? (
    <img className={className} src={src} alt={alt} />
  ) : (
    <span className={`image-placeholder ${className}`}>{alt}</span>
  );
}
