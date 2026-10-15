/** Presentation-only cleanup; account identities and provenance remain unchanged. */
export function presentationName(value: string) {
  return value
    .replace(/[（(](?:演示|展示)账号[）)]/gu, "")
    .replace(/\s*[·｜|]\s*(?:作品)?风格案例\s*$/u, "")
    .trim();
}
