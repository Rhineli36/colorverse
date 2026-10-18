import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  imageGeometry,
  resetImagePlacement,
  type ImagePlacement,
} from "@colorverse/contracts";
import "./framed-image.css";
export async function placedImageBlob(
  blob: Blob,
  placement: ImagePlacement,
  color: string,
) {
  const image = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1024, 1024);
    const r = imageGeometry(image.width, image.height, 1024, 1024, placement);
    ctx.drawImage(image, r.left, r.top, r.width, r.height);
    return await new Promise<Blob>((ok, bad) =>
      canvas.toBlob(
        (b) => (b ? ok(b) : bad(Error("图片调整失败"))),
        "image/webp",
        0.94,
      ),
    );
  } finally {
    image.close();
  }
}
export function FramedImage({
  src,
  alt,
  placement,
  onChange,
  editing = false,
  round = false,
  color = "#102030",
  style,
  className = "",
  onError,
}: {
  src: string;
  alt: string;
  placement?: ImagePlacement;
  onChange?: (p: ImagePlacement) => void;
  editing?: boolean;
  round?: boolean;
  color?: string;
  style?: CSSProperties;
  className?: string;
  onError?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    [size, setSize] = useState({ width: 1, height: 1 }),
    [natural, setNatural] = useState({ width: 1, height: 1 }),
    [selected, setSelected] = useState(false);
  const value = placement ?? resetImagePlacement();
  const drag = useRef<
    { x: number; y: number; value: ImagePlacement; corner?: number } | undefined
  >(undefined);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setSelected(editing);
  }, [src, editing]);
  useEffect(() => {
    if (!editing) return;
    const close = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) setSelected(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [editing]);
  const ratio = round ? 1 : 1.6,
    fw = placement ? Math.min(size.width, size.height * ratio) : size.width,
    fh = placement ? fw / ratio : size.height;
  const frame = {
    width: fw,
    height: fh,
    left: (size.width - fw) / 2,
    top: (size.height - fh) / 2,
  };
  const r = imageGeometry(natural.width, natural.height, fw, fh, value);
  return (
    <div
      ref={host}
      className={`framed-image ${round ? "round" : ""} ${className} ${editing ? "adjustable" : ""}`}
      style={{ ...style, "--image-base": color } as CSSProperties}
      onPointerDown={(e) => {
        if (!editing) return;
        e.stopPropagation();
        e.preventDefault();
        const corner = (e.target as HTMLElement).dataset.corner;
        const bounds = e.currentTarget.getBoundingClientRect(),
          x = e.clientX - bounds.left - frame.left,
          y = e.clientY - bounds.top - frame.top;
        if (
          corner === undefined &&
          (x < 0 ||
            x > fw ||
            y < 0 ||
            y > fh ||
            (round && Math.hypot(x - fw / 2, y - fh / 2) > fw / 2) ||
            (placement &&
              (x < r.left ||
                x > r.left + r.width ||
                y < r.top ||
                y > r.top + r.height)))
        ) {
          setSelected(false);
          return;
        }
        setSelected(true);
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          value: { ...value },
          corner: corner === undefined ? undefined : Number(corner),
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !editing) return;
        e.stopPropagation();
        const dx = (e.clientX - d.x) / Math.max(1, fw),
          dy = (e.clientY - d.y) / Math.max(1, fh);
        if (d.corner !== undefined) {
          const sx = d.corner % 2 === 0 ? -1 : 1,
            sy = d.corner < 2 ? -1 : 1;
          onChange?.({
            ...d.value,
            scale: Math.max(
              0.1,
              Math.min(8, d.value.scale + (dx * sx + dy * sy)),
            ),
          });
        } else
          onChange?.({
            ...d.value,
            x: Math.max(-8, Math.min(8, d.value.x + dx)),
            y: Math.max(-8, Math.min(8, d.value.y + dy)),
          });
      }}
      onPointerUp={(e) => {
        drag.current = undefined;
        e.stopPropagation();
      }}
      onPointerCancel={() => {
        drag.current = undefined;
      }}
    >
      <div className="framed-image-clip" style={frame}>
        <img
          src={src}
          alt={alt}
          draggable={false}
          onError={onError}
          onLoad={(e) =>
            setNatural({
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            })
          }
          style={
            placement
              ? {
                  position: "absolute",
                  width: r.width,
                  height: r.height,
                  left: r.left,
                  top: r.top,
                  maxWidth: "none",
                  objectFit: "fill",
                }
              : {
                  width: "100%",
                  height: "100%",
                  objectFit: style?.objectFit ?? (round ? "cover" : "contain"),
                }
          }
        />
      </div>
      {editing && selected && (
        <div
          className="image-adjust-border"
          style={{ ...frame, right: "auto", bottom: "auto" }}
          aria-label="图片调整边框"
        >
          {[0, 1, 2, 3].map((i) => (
            <button
              key={i}
              type="button"
              data-corner={i}
              aria-label={`图片缩放控制点 ${i + 1}`}
              className={`image-corner corner-${i}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
