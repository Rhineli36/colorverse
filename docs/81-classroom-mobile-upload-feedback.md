# 课堂板绘图片上限与移动端提交反馈（2026-11-13）

仅发布 `colorverse-classroom-next`，入口 https://colorverse.de5.net/ 。比赛 `/review/`、`/exhibition/`、成长预览和 EXE 不发布、不修改数据。

## 本轮修复

- 课堂图片单张像素上限从 1600 万提高到 3200 万，单边仍为 8192；学生作品每次最多 6 张、合计 15 MiB。服务器覆盖星球外貌、内部背景、作品主图和附图；教师参考图片沿用其既有 8 MiB 文件总量限制，只提高像素上限。
- PNG、JPEG、WebP 在提交前读取编码尺寸，不在手机上解码整张位图；前后端均校验。原图保留，展示图仍优化到最长 2048 像素。旧环境维持 1600 万像素。
- 提交录像中的配色理由为空，原必填提示位于长弹窗顶部，底部用户看不到。本轮将提交状态与失败原因放到按钮附近，必填项明确标注；漏填时聚焦并滚动到对应输入项，显示就地提示，空白字符不算填写。
- 失败保留所选图片、文字和请求标识；再次提交沿用现有幂等机制。自由提交维持说明可选。

## 已执行验证

- `pnpm typecheck`、修改文件 ESLint、Prettier 及 `git diff --check`。
- `pnpm exec vitest run tests/upload-reliability.test.ts tests/classroom.test.ts tests/classroom-management.test.ts tests/student-assignments.test.ts`：73 项通过。包含三种格式 3000/3200 万像素通过、超过 3200 万或 8192 单边拒绝、损坏 JPEG、合计 15 MiB、旧版限制，以及服务器在存储前拦截。
- `pnpm classroom:next build`：前端构建、独立 Worker dry-run 通过。
- Python Playwright `tests/student-assignments-browser.py`：390 px 窗口复现缺填、定位、补填成功、服务失败保留内容并重试；作业关联、编辑、撤回和零分锁定回归通过，无页面脚本异常。
- `tests/teacher-submit-browser.py`：教师代交、失败保留、同请求标识重试、390 px 界面通过。
- 浏览器上传验收使用隔离 HTTP 夹具，不在真实学生记录中创建验收作品。未使用实体 iPhone/Safari；录像不能证明此前所有上传失败均由此引起。

本轮不需要数据库迁移，不重置已有账号、作品、评分或班级成员状态。发布版本及冻结资源比对保存在 `outputs/gradebook/isolation-after.json`。
