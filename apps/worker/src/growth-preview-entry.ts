interface GrowthPreviewEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
}
const prefix = "/growth-preview/";
export async function growthPreviewRequest(
  request: Request,
  env: GrowthPreviewEnvironment,
) {
  const url = new URL(request.url);
  if (url.pathname === "/" || url.pathname === "/growth-preview") {
    url.pathname = prefix;
    return Response.redirect(url.href, 308);
  }
  if (!url.pathname.startsWith(prefix))
    return new Response("Not found", { status: 404 });
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Static preview only", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  const assetPath = url.pathname.slice(prefix.length);
  if (/(^|\/)(api|src)(\/|$)/.test(assetPath))
    return new Response("Not found", { status: 404 });
  url.pathname = assetPath ? "/" + assetPath : "/index.html";
  const headers = new Headers(request.headers);
  headers.delete("Authorization");
  headers.delete("Cookie");
  const response = await env.ASSETS.fetch(
    new Request(url, { method: request.method, headers }),
  );
  const output = new Response(response.body, response);
  output.headers.set("X-Content-Type-Options", "nosniff");
  output.headers.set("Referrer-Policy", "same-origin");
  output.headers.set("X-COLORVERSE-Mode", "isolated-growth-preview");
  output.headers.set(
    "Cache-Control",
    response.status !== 200
      ? "no-store"
      : assetPath.startsWith("assets/")
        ? "public, max-age=31536000, immutable"
        : /\.(webp|png|svg)$/.test(assetPath)
          ? "public, max-age=300"
          : "no-store",
  );
  return output;
}
export default { fetch: growthPreviewRequest };
