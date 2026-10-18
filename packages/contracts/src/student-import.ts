import { z } from "zod";

export const RosterRowSchema = z.strictObject({
  row: z.number().int().min(1).max(10000),
  studentNumber: z.string().trim().max(40),
  name: z.string().trim().max(60),
  issue: z.string().max(150).optional(),
});
export type RosterRow = z.infer<typeof RosterRowSchema>;
export const RosterRowsSchema = z.array(RosterRowSchema).min(1).max(500);
export type RosterPreviewRow = RosterRow & {
  status: "new" | "existing" | "invalid";
  message: string;
};
export type RosterResult = RosterRow & {
  loginAccount: string;
  className: string;
  activationCode: string;
  result: "新建" | "已有" | "失败";
  message: string;
};
export function validateRoster(rows: RosterRow[]): RosterPreviewRow[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const n = r.studentNumber.trim().toLowerCase();
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return rows.map((r) => {
    const studentNumber = r.studentNumber.trim(),
      name = r.name.trim();
    const issue =
      r.issue ||
      (!studentNumber
        ? "学号为空"
        : !name
          ? "姓名为空"
          : !/^[A-Za-z0-9_-]{1,40}$/.test(studentNumber)
            ? "学号仅支持字母、数字、下划线和短横线"
            : counts.get(studentNumber.toLowerCase())! > 1
              ? "名单内学号重复"
              : "");
    return {
      ...r,
      studentNumber,
      name,
      status: issue ? "invalid" : "new",
      message: issue || "将新建账号",
    };
  });
}
