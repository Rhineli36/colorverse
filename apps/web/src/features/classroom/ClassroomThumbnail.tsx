import { useEffect, useRef, useState } from "react";
import { usePrivateImage } from "./CloudPlanetAppearance";
import "./classroom-thumbnail.css";

export function ClassroomThumbnail({
  source,
  identity,
  className = "",
}: {
  source?: string;
  identity: string;
  className?: string;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, [source]);
  const resource = source?.startsWith("private:") ? source.slice(8) : "";
  const thumbnail = resource
    ? resource + (resource.includes("?") ? "&" : "?") + "thumbnail=1"
    : "";
  const image = usePrivateImage(
    thumbnail,
    near && thumbnail ? identity : undefined,
  );
  const src = resource ? image.url : source;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const fallback = !src || failed;
  return (
    <span
      ref={host}
      className={`classroom-thumbnail ${className}`}
      data-fallback={fallback}
      aria-hidden="true"
    >
      {!fallback ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <svg
            className="classroom-thumbnail-default"
            viewBox="0 0 160 110"
            fill="none"
            focusable="false"
          >
            <rect width="160" height="110" rx="9" fill="#17263D" />
            <rect
              x="28"
              y="15"
              width="90"
              height="66"
              rx="8"
              fill="#314460"
              transform="rotate(-8 28 15)"
            />
            <rect x="34" y="18" width="94" height="66" rx="8" fill="#415577" />
            <path
              d="M35 69L63 39L89 61L108 44L128 67V76C128 80.4 124.4 84 120 84H42C38 84 35 81 35 77V69Z"
              fill="#81BFBC"
            />
            <circle cx="91" cy="41" r="16" fill="#C0ACEB" />
            <ellipse
              cx="91"
              cy="41"
              rx="26"
              ry="6"
              transform="rotate(-25 91 41)"
              stroke="#F2D39B"
              strokeWidth="2.5"
            />
            <path
              d="M132 19L134 25L140 27L134 29L132 35L130 29L124 27L130 25L132 19Z"
              fill="#EDD5A7"
            />
            <circle cx="20" cy="57" r="3" fill="#BFA7EC" />
          </svg>
          <small>
            {!source
              ? "暂无示范图"
              : image.error || failed
                ? "图片暂不可用"
                : "正在读取"}
          </small>
        </>
      )}
    </span>
  );
}
