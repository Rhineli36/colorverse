/** Reject accidental personal identities before copying the public competition fixture. */
export function assertAnonymousCompetition(manifest) {
  if (/\b\d{8,}\b/.test(JSON.stringify(manifest)))
    throw Error("COMPETITION_PERSONAL_NUMBER_NOT_ALLOWED");
  const labels = new Set(["默认风格"]);
  for (const [index, student] of manifest.students.entries()) {
    const name = `虚拟学生 ${String(index + 1).padStart(2, "0")}`;
    const number = `DEMO${String(index + 1).padStart(4, "0")}`;
    if (
      student.realName !== name ||
      student.studentNumber !== number ||
      student.display_name !== `${name} · 学号 ${number}`
    )
      throw Error("COMPETITION_VIRTUAL_IDENTITY_REQUIRED");
    labels.add(name);
    labels.add(student.display_name);
  }
  function inspect(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (
        key === "author" &&
        typeof item === "string" &&
        !labels.has(item.replace(/（演示账号）/g, ""))
      )
        throw Error("COMPETITION_VIRTUAL_AUTHOR_REQUIRED");
      inspect(item);
    }
  }
  inspect(manifest);
}
