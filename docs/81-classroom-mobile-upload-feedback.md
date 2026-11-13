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

## 11 月 13 日首次发布尝试（历史记录）

代码与验证版本为 `c8e71e4`，已推送 `codex/annual-laureate-preview`。本轮尚未发布成功：配置内的 `pnpm classroom:next deploy` 经代理两次、直连一次均在上传程序版本时收到 Cloudflare HTTP 500／10013。使用临时 Wrangler 4.161.0 及现有 Wrangler 的兼容 PUT 上传流程也收到相同错误；没有修改项目的依赖锁定版本或部署配置。静态文件上传成功不代表新程序已上线。

失败后线上健康检查仍返回 200，课堂实际版本保持 `2026-11-13T09:40:54.900Z-970045d`，Worker 版本为 `6a9f779b-2ceb-4bfa-8368-39336f741237`；因此新上限与反馈修复尚未在公网生效。`/review/`、`/exhibition/` 的 8 项页面与资源、冻结 Worker、EXE 校验未变。

部署接口恢复后，继续执行 `pnpm classroom:next deploy`，成功后核对公网 `release.json` 的 `sourceRevision` 与实际构建提交，并重新执行浏览器验收和 `node work/gradebook-isolation.mjs`。目前不能将本地浏览器夹具验收标为线上真实学生上传成功。

## 11 月 14 日发布完成

北京时间 2026-11-14 01:04，通过既有 `pnpm classroom:next deploy` 成功发布，程序、静态资源及后端密钥配置均完成。

- 实际发布：`2026-11-13T17:04:06.745Z-7e6f611`；`sourceRevision=7e6f611`。
- 最终 Worker 版本（含密钥更新）：`3e400f2f-b994-4903-872b-5654c4cd2a4a`。
- 自定义域名 https://colorverse.de5.net/ 与 Workers 默认地址的健康检查和版本均一致，返回 200。
- 对已发布前端执行学生作业浏览器脚本和教师代交浏览器脚本，均通过：390 px 下缺填定位、就地提示、失败保留与重试、提交关联及教师代交无脚本异常。接口继续使用隔离夹具，不写入真实学生作业。
- 再次完成冻结比对：比赛 Worker、`/review/` 与 `/exhibition/` 的 8 项页面资源、EXE 和教学情感内容校验均未变化。无需数据库迁移。
