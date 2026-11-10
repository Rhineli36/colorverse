import { useEffect, useState } from "react";
import type { AssignmentDefinition } from "@colorverse/contracts";
import { classroomRequest } from "./cloud-request";
import "./classroom-mail.css";
import { AssignmentText } from "./AssignmentText";

/** Shared by teacher previews, assignment mail and the submission form. */
export function AssignmentBrief({
  task,
  showTitle = false,
}: {
  task: AssignmentDefinition;
  showTitle?: boolean;
}) {
  const Heading = showTitle ? "h4" : "h3";
  return (
    <div className="assignment-brief" data-task-id={task.id}>
      {showTitle && <h3>{task.title}</h3>}
      <p>
        <AssignmentText
          text={task.description}
          marks={task.formatting?.description}
        />
      </p>
      <Heading>创作步骤</Heading>
      <ol>
        {task.steps.map((step, index) => (
          <li key={index}>
            <AssignmentText
              text={step}
              marks={task.formatting?.steps?.[index]}
            />
          </li>
        ))}
      </ol>
      <Heading>提交内容</Heading>
      <p>
        <AssignmentText
          text={task.deliverables}
          marks={task.formatting?.deliverables}
        />
      </p>
      {task.inspiration && (
        <>
          <Heading>灵感入口</Heading>
          <p>{task.inspiration}</p>
        </>
      )}
      {(task.image || task.images?.length || task.exampleObservation) && (
        <figure>
          {(task.images?.length
            ? task.images
            : task.image
              ? [task.image]
              : []
          ).map((src, index) => (
            <AssignmentImage
              key={src}
              src={src}
              alt={`${task.imageAlt}${index ? " · " + (index + 1) : ""}`}
            />
          ))}
          {task.exampleObservation && (
            <figcaption>
              <Heading>范例观察</Heading>
              <p>{task.exampleObservation}</p>
            </figcaption>
          )}
        </figure>
      )}
    </div>
  );
}

function AssignmentImage({ src, alt }: { src: string; alt: string }) {
  const [failedImage, setFailedImage] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [privateUrl, setPrivateUrl] = useState("");
  const isPrivate = src.startsWith("private:");
  useEffect(() => {
    if (!isPrivate) {
      setPrivateUrl("");
      return;
    }
    let active = true,
      url = "";
    const controller = new AbortController();
    setPrivateUrl("");
    void classroomRequest(src.slice(8), { signal: controller.signal })
      .then((r) => r.blob())
      .then((b) => {
        if (active) {
          url = URL.createObjectURL(b);
          setPrivateUrl(url);
        }
      })
      .catch(() => {
        if (active) setFailedImage(src);
      });
    return () => {
      active = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, isPrivate, attempt]);
  return (
    <>
      {failedImage === src ? (
        <div className="assignment-image-fallback" role="status">
          <p>范例图片暂时无法显示</p>
          <button
            type="button"
            onClick={() => {
              setFailedImage(undefined);
              setAttempt((n) => n + 1);
            }}
          >
            重新加载范例图片
          </button>
        </div>
      ) : src && (!isPrivate || privateUrl) ? (
        <img
          src={
            isPrivate
              ? privateUrl
              : /^(blob:|data:)/.test(src)
                ? src
                : `${import.meta.env.BASE_URL}${src}${attempt ? "?retry=" + attempt : ""}`
          }
          alt={alt}
          decoding="async"
          onError={() => setFailedImage(src)}
        />
      ) : isPrivate ? (
        <p role="status">正在读取示范图片…</p>
      ) : null}
    </>
  );
}
