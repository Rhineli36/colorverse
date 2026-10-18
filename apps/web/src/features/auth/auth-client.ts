import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface AuthConfig {
  enabled: boolean;
  url: string;
  publishableKey: string;
  useProxy?: true;
}
export function readAuthConfig(
  env: Record<string, unknown>,
): AuthConfig | null {
  if (env.VITE_ENABLE_CLOUD_AUTH !== "true") return null;
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (
    typeof url !== "string" ||
    !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) ||
    typeof key !== "string" ||
    !key.startsWith("sb_publishable_")
  )
    return null;
  return {
    enabled: true,
    url,
    publishableKey: key,
    ...(env.VITE_USE_AUTH_PROXY === "true" ? { useProxy: true as const } : {}),
  };
}
let client: SupabaseClient | null = null;
export function getAuthClient() {
  const config = readAuthConfig(import.meta.env);
  if (!config) return null;
  client ??= createClient(
    config.useProxy
      ? new URL("/api/supabase", location.origin).href
      : config.url,
    config.publishableKey,
    {
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)])
              : AbortSignal.timeout(10000),
          }),
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: `colorverse.auth.${new URL(config.url).hostname}`,
      },
    },
  );
  return client;
}
export function loginError(status?: number, code?: string) {
  if (status === 429 || code === "over_request_rate_limit")
    return "尝试次数较多，请稍后再登录";
  if (code === "email_not_confirmed") return "请先完成邮箱验证";
  if (status === 400 || status === 401 || code === "invalid_credentials")
    return "账号尚未激活或账号、密码不正确，请核对后重试";
  return "登录服务暂时无法连接，请稍后再试";
}
