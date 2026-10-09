# 09 · 本轮文档验证记录

日期：2026-10-09。验证对象为 docs/ 内设计文档和 JSON 草案；没有产品运行时。

## 结果

本轮通过 27 项文档检查：

- 5 项有效数据检查：accepted 示例、proposed/rejected/reverted 状态、真实提交 trigger 的结构。
- 10 项无效数据拒绝检查：坐标越界、未知预设、额外 URL、接受时间缺失、状态与 revision 冲突、撤销信息缺失、错误 UUID、元素数量超限、颜色格式错误、模拟档案链接缺失。
- 3 项示例语义检查：revision 顺序、时间顺序、layer ID 唯一。
- 1 项相对链接扫描（扫描当时 11 处相对链接全部存在；增加本报告导航后在最终打包前再次扫描）。
- 8 项容量和费用算术检查：每作业媒体、单/双学期、无复用、大素材量、三年基础设施上下界、AI 假设上界。

JSON 检查使用 PowerShell `Test-Json -SchemaFile`，附加示例的时序/唯一性检查由验证脚本执行。Schema 本身不负责访问权限、数据库事务、引用存在性、实际 preset 可用性或防重复；上述运行时性质尚未验证。

最小复核命令（在项目根目录执行）：

```powershell
Get-Content -LiteralPath 'docs/examples/growth-event.accepted.json' -Raw |
    Test-Json -SchemaFile 'docs/schemas/growth-event.schema.json'
```

## 限制

未创建应用脚手架、数据库或付费 API 调用。未执行画面渲染、跨电脑 ZIP 还原、浏览器性能、云端安全和备份恢复测试。08 中的指标和测试表属于后续验收计划。现有文件是可供开发评审的设计基线，完整 PlanetDocument/ZIP 校验器将在 P0 实现。
