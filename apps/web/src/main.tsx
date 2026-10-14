import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import "./style.css";
const View =
  import.meta.env.VITE_EXHIBITION_MODE === "true"
    ? lazy(() =>
        import("./features/competition/CompetitionView").then((m) => ({
          default: m.CompetitionView,
        })),
      )
    : lazy(() => import("./app/App").then((m) => ({ default: m.App })));
createRoot(document.getElementById("root")!).render(
  <Suspense fallback={<p role="status">正在展开色彩宇宙…</p>}>
    <View />
  </Suspense>,
);
