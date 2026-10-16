import { useEffect, useState } from "react";
import type { AssignmentDefinition } from "@colorverse/contracts";
import { classroomRequest } from "./cloud-request";
import "./classroom-mail.css";

/** Shared by teacher previews, assignment mail and the submission form. */
export function AssignmentBrief({
  task,
  showTitle = false,
}: {
  task: AssignmentDefinition;
  showTitle?: boolean;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [privateUrl, setPrivateUrl] = useState("");
  const isPrivate = task.image.startsWith("private:");
  useEffect(() => {
    if (!isPrivate) {
      setPrivateUrl("");
      return;
    }
    let active = true,
      url = "";
    const controller = new AbortController();
    setPrivateUrl("");
    void classroomRequest(task.image.slice(8), { signal: controller.signal })
      .then((r) => r.blob())
      .then((b) => {
        if (active) {
          url = URL.createObjectURL(b);
          setPrivateUrl(url);
        }
      })
      .catch(() => {
        if (active) setFailedImage(task.image);
      });
    return () => {
      active = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [task.image, isPrivate, attempt]);
  const Heading = showTitle ? "h4" : "h3";
  return (
    <div className="assignment-brief" data-task-id={task.id}>
      {showTitle && <h3>{task.title}</h3>}
      <p>{task.description}</p>
      <Heading>创作步骤</Heading>
      <ol>
        {task.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      <Heading>提交内容</Heading>
      <p>{task.deliverables}</p>
      {task.inspiration && (
        <>
          <Heading>灵感入口</Heading>
          <p>{task.inspiration}</p>
        </>
      )}
      {(task.image || task.exampleObservation) && (
        <figure>
          {failedImage === task.image ? (
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
          ) : task.image && (!isPrivate || privateUrl) ? (
            <img
              src={
                isPrivate
                  ? privateUrl
                  : /^(blob:|data:)/.test(task.image)
                    ? task.image
                    : `${import.meta.env.BASE_URL}${task.image}${attempt ? "?retry=" + attempt : ""}`
              }
              alt={task.imageAlt}
              decoding="async"
              onError={() => setFailedImage(task.image)}
            />
          ) : isPrivate ? (
            <p role="status">正在读取示范图片…</p>
          ) : null}
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
