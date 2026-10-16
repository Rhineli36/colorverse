import { useState } from "react";
import type { AssignmentCatalog } from "@colorverse/contracts";
import "./classroom-mail.css";

/** Shared by teacher previews, assignment mail and the submission form. */
export function AssignmentBrief({
  task,
  showTitle = false,
}: {
  task: (typeof AssignmentCatalog)[number];
  showTitle?: boolean;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const [attempt, setAttempt] = useState(0);
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
      <Heading>灵感入口</Heading>
      <p>{task.inspiration}</p>
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
        ) : (
          <img
            src={`${import.meta.env.BASE_URL}${task.image}${attempt ? "?retry=" + attempt : ""}`}
            alt={task.imageAlt}
            decoding="async"
            onError={() => setFailedImage(task.image)}
          />
        )}
        <figcaption>
          <Heading>范例观察</Heading>
          <p>{task.exampleObservation}</p>
        </figcaption>
      </figure>
    </div>
  );
}
