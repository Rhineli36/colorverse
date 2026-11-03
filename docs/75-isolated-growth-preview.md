# 星球成长：独立云端测试预览

2026-11-03。按用户要求将效果预览发布到 `https://colorverse.de5.net/growth-preview/`，正式课堂保持当前版本。

## 隔离方式

- 独立分支：`codex/growth-preview`。
- 独立 Worker：`colorverse-growth-preview`，只有静态 `ASSETS` 绑定，没有 Supabase、数据库、课堂服务、图片上传或账号密钥。
- 专用构建：`apps/web/growth-preview.vite.config.ts`，只构建预览 HTML，不构建课堂/参赛入口。只复制预览实际使用的 4 张现有图片；不复制名单、作品清单、账号或其他课堂数据。
- `/growth-preview` 自动转到 `/growth-preview/`；JS、CSS、图片和版本文件都使用此路径前缀。主域名网关新增 `GROWTH_PREVIEW` 服务绑定，仅对精确前缀转发；现有 CLASSROOM、COMPETITION 及评审账号分流保持原样。
- `/growth-preview/api/*` 返回 404，非 GET/HEAD 返回 405。静态请求去掉 Authorization/Cookie，再交给资产绑定。没有课堂写入途径。
- 首页 HTML 与版本文件不缓存，哈希 JS/CSS 使用 immutable，图片短缓存。缺失资源返回真实 404，不返回课堂 SPA。
- 默认锁定/试戴为视觉预览，未配置真实任务奖励。拖动与配色等调整只保留在当前页面会话；刷新复位。本地上传只创建 Blob URL，不发送文件到服务器。

## 预览内容

7 套边框与配套浮饰（银饰、鎏金、蓝宝、翡翠、彩窗、繁花、立冬霜柿），5 套星环/外观（含轻量 SVG 水母环绕），全部默认锁定。保留高饱和/浅色背景及本机图片试用、直接拖动、键盘微调、三档幅度、复位、减少动态效果、静态缩略图及粒子开关。

## 构建与部署命令

1. `pnpm growth:preview build`：独立生产构建和 Worker dry-run，输出 `work/growth-preview-site` 及 `work/wrangler.growth-preview.json`。
2. `pnpm growth:preview deploy`：只发布预览 Worker。
3. 首次接通路径执行 `pnpm classroom:domain deploy --growth-preview`：只更新域名网关，为前缀增加绑定；不发布课堂 Worker。后续网关部署脚本会保留已存在的预览绑定。

凭据沿用本机忽略文件，未提交仓库。正式课堂/比赛/EXE 的构建发布命令不在此次流程内。

## 验证

- 类型检查、相关 ESLint、网关与静态预览测试。
- 使用专用构建的浏览器验证：`tests/growth-preview-themes-browser.py` 和 `tests/growth-preview-drag-browser.py`，先验证本地产物，再验证正式测试 URL。
- 发布前保存正式课堂与比赛 Worker 版本、正式课堂两域名 10 项资源指纹；发布后逐项一致比较。另比较 review/exhibition 的 16 项资源指纹与原 EXE 哈希。
- 云端检查 6 项预览 JS/CSS/图片字节与本地构建匹配，验证预览 API/POST 不可用，浏览器没有课堂 API 请求或 workers.dev 请求。
- 证据目录：`outputs/growth-cloud/`。实际发布版本与检查结果在发布完成后追加。
