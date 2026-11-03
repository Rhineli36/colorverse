export const previewAsset = (path: string) =>
  import.meta.env.BASE_URL + path.replace(/^\/+/, "");
export const previewHome =
  import.meta.env.BASE_URL === "/"
    ? "/growth-preview.html"
    : import.meta.env.BASE_URL;
