/** UI navigation preferences only; never stores planet drafts or changes a creation. */
export function readStudyPreference(key: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem("colorverse.study." + key) ?? "{}",
    );
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
export function saveStudyPreference(key: string, value: unknown) {
  try {
    sessionStorage.setItem("colorverse.study." + key, JSON.stringify(value));
  } catch {
    /* Browsing also works when session storage is unavailable. */
  }
}
