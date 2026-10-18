export async function classroomRequest(path: string, init: RequestInit = {}) {
  const { getAuthClient } = await import("../auth/auth-client");
  const client = getAuthClient();
  const session = (await client?.auth.getSession())?.data.session;
  if (!session) throw new Error("请先登录课堂账户");
  const response = await fetch(`/api/v1/cloud/${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
    cache: "no-store",
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(25000)])
      : AbortSignal.timeout(25000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message ?? "云端连接失败，请稍后重试");
  }
  if (
    init.method &&
    init.method !== "GET" &&
    !path.endsWith("notification-read")
  )
    window.dispatchEvent(new Event("classroom-data-changed"));
  return response;
}
