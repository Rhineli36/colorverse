# 浏览器验证说明

browser_smoke.py 使用全新浏览器上下文，并在第二个独立上下文导入 ZIP。该检查证明作品包不依赖原上下文的 IndexedDB；它不是实际两台电脑、两种 GPU 或同一用户浏览器上的测试。

脚本会校验控制台错误、上传/调色/历史、内部热点、成长、防重复、刷新、教师管理、便携恢复和移动视口。失败时不会更新 outputs/browser-test-report.json，旧报告不能作为最新代码通过的证据；必须以最后一次成功执行和进度记录为准。

2026-10-11：element_editor_browser.py验证自动小元素与专用编辑，showcase_browser.py已按自动流程更新。growth_library_browser.py使用真实上传及隔离存储中的v2提案样本测试旧预览兼容、固定上传操作和分页；其中兼容样本不是用户数据。测试与边界见[29](../docs/29-automatic-growth-and-element-editor.md)。
