import { AnnualLaureatePreview } from "./AnnualLaureatePreview";
import { createRoot } from "react-dom/client";
import { GrowthPreview } from "./GrowthPreview";
import "./standalone.css";
createRoot(document.getElementById("root")!).render(
  <GrowthPreview extraFramePreview={<AnnualLaureatePreview />} />,
);
