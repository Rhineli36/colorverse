import { createContext, useEffect, useState } from "react";
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export const STUDY_PATH = base + "/color-mystery";
export const LAB_PATH = STUDY_PATH + "/lab";
export const JELLYFISH_PATH = LAB_PATH + "/jellyfish";
export const TREE_PATH = LAB_PATH + "/color-tree";
export const ColorLabEnabled = createContext(false);
export function labNavigate(path: string, replace = false) {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  window.dispatchEvent(new Event("colorverse:navigate"));
}
export function useLabLocation() {
  const read = () => location.pathname + location.search;
  const [value, setValue] = useState(read);
  useEffect(() => {
    const update = () => setValue(read());
    window.addEventListener("popstate", update);
    window.addEventListener("colorverse:navigate", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("colorverse:navigate", update);
    };
  }, []);
  const url = new URL(value, location.origin);
  return {
    value,
    study: [STUDY_PATH, LAB_PATH].includes(url.pathname.replace(/\/$/, "")),
    experiment: [JELLYFISH_PATH, TREE_PATH].includes(
      url.pathname.replace(/\/$/, ""),
    ),
    tree: url.pathname.replace(/\/$/, "") === TREE_PATH,
    classroom: url.searchParams.get("mode") === "classroom",
    tab:
      url.pathname.replace(/\/$/, "") === LAB_PATH
        ? "lab"
        : url.searchParams.get("tab") === "emotion"
          ? "emotion"
          : "knowledge",
  };
}
