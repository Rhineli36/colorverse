import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  readRoster,
  rosterWorkbook,
} from "../apps/web/src/features/classroom/roster-excel";
describe("Excel roster files", () => {
  it("reads a formatted school roll with merged names, title rows and a signature footer", async () => {
    const w = new ExcelJS.Workbook(),
      s = w.addWorksheet("点名册");
    s.mergeCells("A1:D2");
    s.getCell("A1").value = "课程点名册";
    s.getCell("A10").value = "学号";
    s.mergeCells("B10:C10");
    s.getCell("B10").value = "姓名";
    s.getCell("A11").value = "00123";
    s.mergeCells("B11:C11");
    s.getCell("B11").value = "同学甲";
    s.getCell("A12").value = 12;
    s.getCell("A12").numFmt = "00000";
    s.getCell("B12").value = "同学乙";
    s.mergeCells("A14:B14");
    s.getCell("A14").value = "任课老师签名：";
    const bytes = await w.xlsx.writeBuffer(),
      result = await readRoster(new File([bytes as BlobPart], "点名册.xlsx"));
    expect(result.headerRow).toBe(10);
    expect(result.rows).toEqual([
      { row: 11, studentNumber: "00123", name: "同学甲" },
      { row: 12, studentNumber: "00012", name: "同学乙" },
    ]);
  });
  it("exports text student numbers and result credentials as text cells and marks formula inputs", async () => {
    const bytes = await rosterWorkbook();
    const result = await readRoster(new File([bytes as BlobPart], "模板.xlsx"));
    expect(result.rows[0].studentNumber).toBe("001234");
    const w = new ExcelJS.Workbook();
    await w.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const s = w.worksheets[0];
    s.getCell("A2").value = { formula: "1+2", result: 3 };
    const bad = await readRoster(
      new File([(await w.xlsx.writeBuffer()) as BlobPart], "公式.xlsx"),
    );
    expect(bad.rows[0].issue).toContain("公式");
    const resultBytes = await rosterWorkbook([
      {
        row: 2,
        studentNumber: "0012",
        name: "=SUM(A1)",
        loginAccount: "0012-test",
        className: "测试",
        activationCode: "ABCD-EFGH",
        result: "新建",
        message: "测试",
      },
    ]);
    const saved = new ExcelJS.Workbook();
    await saved.xlsx.load(resultBytes as unknown as ExcelJS.Buffer);
    expect(saved.worksheets[0].getCell("C2").type).toBe(
      ExcelJS.ValueType.String,
    );
    expect(saved.worksheets[0].getCell("A2").value).toBe("0012");
  });
});
