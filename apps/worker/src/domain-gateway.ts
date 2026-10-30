// Routing only: each bound application still authenticates/authorizes every API request.
export interface DomainGatewayEnvironment {
  CLASSROOM: { fetch(request: Request): Promise<Response> };
  COMPETITION: { fetch(request: Request): Promise<Response> };
  REVIEW_SUBJECTS: string;
  REVIEW_CLASS_IDS: string;
}
const frozenPath = (path: string) => /^\/(review|exhibition)(\/|$)/.test(path);
function subject(request: Request) {
  try {
    const token = request.headers
      .get("Authorization")
      ?.replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).sub as string;
  } catch {
    return null;
  }
}
export async function gatewayRequest(
  request: Request,
  env: DomainGatewayEnvironment,
) {
  const url = new URL(request.url),
    path = url.pathname;
  if (frozenPath(path)) return env.COMPETITION.fetch(request);
  let reviewPage = false;
  try {
    const ref = new URL(request.headers.get("Referer") ?? "");
    reviewPage = ref.origin === url.origin && frozenPath(ref.pathname);
  } catch {
    /* no referer */
  }
  if (
    !path.startsWith("/api/") &&
    reviewPage &&
    /\.(js|css|json|png|jpe?g|webp|svg|wav|mp3|woff2?)$/i.test(path)
  )
    return env.COMPETITION.fetch(request);
  if (path.startsWith("/api/")) {
    const sub = subject(request);
    const reviewSubject =
      sub && (JSON.parse(env.REVIEW_SUBJECTS) as string[]).includes(sub);
    const classId = /^\/api\/v1\/cloud\/classes\/([^/]+)(?:\/|$)/.exec(
      path,
    )?.[1];
    const reviewClass =
      classId &&
      (JSON.parse(env.REVIEW_CLASS_IDS) as string[]).includes(classId);
    // Referer supports unauthenticated review login only; cannot route a formal account to old APIs.
    return (
      reviewSubject ||
      reviewClass ||
      (!request.headers.has("Authorization") && reviewPage)
        ? env.COMPETITION
        : env.CLASSROOM
    ).fetch(request);
  }
  if (path.startsWith("/assets/")) {
    // Both immutable releases use hashed root chunks. SPA fallback is HTML, never a valid asset.
    const response = await env.CLASSROOM.fetch(request);
    if (
      response.status === 404 ||
      (response.headers.get("Content-Type") ?? "").includes("text/html")
    ) {
      return env.COMPETITION.fetch(request);
    }
    return response;
  }
  return env.CLASSROOM.fetch(request);
}
export default { fetch: gatewayRequest };
