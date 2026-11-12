import { requestDeadline } from "../auth/request-deadline";
export function classroomRequestTimeout(init: RequestInit) {
  return init.body instanceof Blob || init.body instanceof FormData
    ? 120000
    : 25000;
}
export async function classroomRequest(path: string, init: RequestInit = {}) {
  const { getAuthClient } = await import("../auth/auth-client");
  const client = getAuthClient();
  const session = (await client?.auth.getSession())?.data.session;
  if (!session) throw new Error("请先登录课堂账户");
  const signal = requestDeadline(classroomRequestTimeout(init), init.signal);
  let response: Response;
  try {
    response = await fetch(`/api/v1/cloud/${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (
      (signal.aborted && signal.reason?.name === "TimeoutError") ||
      (error instanceof Error && error.name === "TimeoutError")
    )
      throw new Error(
        init.body instanceof FormData || init.body instanceof Blob
          ? "上传等待超时，请保持浏览器在前台并检查网络；保留当前图片和文字，直接重试本次提交，不会重复创建作品。"
          : "读取云端信息超时，请稍后重试。",
      );
    if (error instanceof TypeError)
      throw new Error(
        init.body instanceof FormData || init.body instanceof Blob
          ? "上传连接中断，请检查网络并保持浏览器在前台；当前图片和文字已保留，可以重试本次提交。"
          : "暂时无法连接课堂服务，请检查网络后重试。",
      );
    throw error;
  }
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
