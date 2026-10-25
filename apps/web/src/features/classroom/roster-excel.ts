import ExcelJS from "exceljs";
import { unzipSync } from "fflate";
import type { RosterRow, RosterResult } from "@colorverse/contracts";

function cellText(cell: ExcelJS.Cell): { text: string; issue?: string } {
  const v = cell.value;
  if (v === null || v === undefined) return { text: "" };
  if (typeof v === "string") return { text: v.trim() };
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v) || Math.abs(v) >= 1e15)
      return {
        text: String(v),
        issue: "学号数字精度无法保证，请在 Excel 中改为文本后核对",
      };
    const format = cell.numFmt?.split(";")[0];
    return {
      text: /^0+$/.test(format)
        ? String(v).padStart(format.length, "0")
        : String(v),
    };
  }
  if (typeof v === "object" && "richText" in v)
    return {
      text: v.richText
        .map((r) => r.text)
        .join("")
        .trim(),
    };
  return {
    text: cell.text,
    issue: "学号和姓名请使用文本，不要使用公式、日期或链接",
  };
}
export async function readRoster(file: File) {
  if (!/\.xlsx$/i.test(file.name))
    throw Error("请上传 .xlsx 格式的 Excel 文件，旧版 .xls 请另存为 .xlsx");
  if (file.size > 4 * 1024 * 1024)
    throw Error("点名册最多 4 MB，请移除无关图片和工作表");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let expanded = 0,
    entries = 0;
  unzipSync(bytes, {
    filter: (f) => {
      expanded += f.originalSize;
      entries++;
      if (expanded > 12 * 1024 * 1024 || entries > 1000)
        throw Error("点名册内容过大，请使用两列模板");
      return false;
    },
  });
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const header = (s: string) => s.replace(/\s/g, "");
  for (const sheet of book.worksheets) {
    for (let line = 1; line <= Math.min(sheet.rowCount, 50); line++) {
      const cells = sheet.getRow(line);
      let numberColumn = 0,
        nameColumn = 0;
      cells.eachCell((c) => {
        const text = header(cellText(c).text);
        if (text === "学号" && !numberColumn) numberColumn = Number(c.col);
        if (text === "姓名" && !nameColumn) nameColumn = Number(c.col);
      });
      if (!numberColumn || !nameColumn) continue;
      if (sheet.rowCount > 2000)
        throw Error("表格行数过多，请保留学生名单，最多导入 500 人");
      const rows: RosterRow[] = [];
      for (let i = line + 1; i <= sheet.rowCount; i++) {
        const n = cellText(sheet.getCell(i, numberColumn)),
          name = cellText(sheet.getCell(i, nameColumn));
        if (!n.text && !name.text) continue;
        if (/^(任课.*签名|教师.*签名|备注[：:]|合计[：:]?)/.test(n.text)) break;
        rows.push({
          row: i,
          studentNumber: n.text,
          name: name.text,
          ...(n.issue || name.issue ? { issue: n.issue || name.issue } : {}),
        });
      }
      if (!rows.length)
        throw Error("没有找到学生名单，请在表头下方填写学号和姓名");
      if (rows.length > 500) throw Error("每次最多导入 500 人，请拆分名单");
      return { sheet: sheet.name, headerRow: line, rows };
    }
  }
  throw Error("没有找到同一行的“学号”和“姓名”表头，请使用模板或检查点名册");
}
export async function rosterWorkbook(
  results?: RosterResult[],
  firstLogin = false,
) {
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet(results ? "账号清单" : "学生名单");
  sheet.columns = results
    ? [
        { header: "学号", key: "studentNumber", width: 22 },
        { header: "登录账号", key: "loginAccount", width: 38 },
        { header: "姓名", key: "name", width: 18 },
        { header: "班级", key: "className", width: 38 },
        {
          header: firstLogin ? "首次登录方式" : "首次激活码",
          key: "activationCode",
          width: 38,
        },
        { header: "创建结果", key: "result", width: 14 },
        { header: "说明", key: "message", width: 70 },
      ]
    : [
        { header: "学号", key: "studentNumber", width: 24 },
        { header: "姓名", key: "name", width: 20 },
      ];
  for (const column of sheet.columns) column.numFmt = "@";
  if (results)
    for (const row of results)
      sheet.addRow(
        firstLogin
          ? {
              ...row,
              activationCode:
                row.result === "失败"
                  ? "—"
                  : "未激活：学号＋姓名；已激活：学号＋密码",
            }
          : row,
      );
  else {
    sheet.addRow({ studentNumber: "001234", name: "示例同学" });
    sheet.getCell("A2").note =
      "学号请按文本填写；上传前删除示例行并填写真实名单。";
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: "A1",
    to: { row: Math.max(sheet.rowCount, 2), column: sheet.columnCount },
  };
  sheet.getRow(1).height = 26;
  sheet.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF163440" },
    };
  });
  sheet.eachRow((r, i) => {
    if (i > 1) r.height = 24;
    r.eachCell((c) => {
      c.alignment = { vertical: "middle", wrapText: false };
    });
  });
  return new Uint8Array(await book.xlsx.writeBuffer());
}
export async function downloadRoster(
  results?: RosterResult[],
  firstLogin = false,
) {
  const bytes = await rosterWorkbook(results, firstLogin),
    url = URL.createObjectURL(
      new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
  const a = document.createElement("a");
  a.href = url;
  a.download = results ? "学生账号清单.xlsx" : "学生导入模板.xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
