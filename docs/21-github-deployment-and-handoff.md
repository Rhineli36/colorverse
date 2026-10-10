# 21 · GitHub 部署与接续记录

创建：2026-10-09；发布验证：2026-10-10。遵循既有本地优先架构；本次完成代码上传与静态演示，不新增课程后端。

## 仓库与部署

用户指定公开仓库：[Rhineli36/colorverse](https://github.com/Rhineli36/colorverse)。以main为发布分支，GitHub Actions执行安装、lint、62项模块测试和生产构建，再部署到GitHub Pages。目标演示地址为 `https://rhineli36.github.io/colorverse/`；实际发布结果以[Actions](https://github.com/Rhineli36/colorverse/actions)和在线页面为准。

`VITE_BASE_PATH` 默认 `/`，Pages构建从configure-pages元数据取得子目录。演示图路径统一使用Vite的BASE_URL；构建资源和ZIP校验Worker使用Vite输出路径。本机5173/5174保持原入口，部署不需要API Key或新增付费服务。

仓库只包含代码、设计文档、锁文件、合成演示与测试素材。node_modules、dist、本地work/outputs、环境文件、Python缓存不提交。浏览器中的学生作品、上传原图及IndexedDB数据库不会随Git推送上传。

GitHub Pages仅提供静态应用；每位访问者仍有独立的浏览器草稿。原localhost作品不会自动出现在新域名；需在本机导出作品/宇宙ZIP，再到在线演示导入。正式登录、学生共享宇宙、老师集中查看作业和服务端授权继续属于P2。

本轮本地验证：TypeScript、ESLint、62项模块测试、以 `/colorverse/` 构建通过；该子目录上的14项浏览器闭环检查通过，包括素材、编辑/成长/刷新、ZIP及Worker、独立上下文导入和移动端。远端CI与在线验收另记录在发布结果中，不能用本地通过代替。

使用 [GitHub Pages官方工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) 的configure-pages@v5、upload-pages-artifact@v4、deploy-pages@v4；只给部署作业pages/id-token写权限。核对日期2026-10-09。

## 已确认的发布结果 · 2026-10-10

代码首次提交 `f933afb276cac07407d2bcda5e9010520937e154`；140个文件的本地与远端Git树一致。GitHub上的[核心CI](https://github.com/Rhineli36/colorverse/actions/runs/37938857517)成功，完成lint、62项模块测试和生产构建。

首次Pages流程因仓库未启用Pages失败；启用Actions发布源后重新执行，[构建与部署成功](https://github.com/Rhineli36/colorverse/actions/runs/38021614879)。[在线演示](https://rhineli36.github.io/colorverse/)返回HTTP 200，在线实际运行的14项浏览器闭环检查全部通过，无运行时/资源错误；包括ZIP Worker、独立上下文导入、持久保存和移动端。上传/成长/导入等操作只发生在隔离测试上下文，不向GitHub保存这些草稿。

本段及实现进度的后续提交只更新记录，使用 `[skip ci]` 避免重复部署；在线运行的程序对应上述已验证代码提交。

## 下次如何继续

先读[10 · 实现进度](10-implementation-progress.md)、[20 · 聚焦与清晰度](20-gentle-focus-and-artwork-resolution.md)，再按[06 · 原开发计划](06-development-plan.md)推进。此前已完成固定蒙版/自动适应、编辑入口、常驻图层、38%适度聚焦与选中展示图；后续运动速度/轨迹选择仍在[14 · 运动控制计划](14-planet-motion-controls-plan.md)，尚未实现。

下次先检查在线演示的视角、上传/蒙版和浏览器保存体验，收集学生使用反馈。下一模块建议按14加入静止/慢速/快速和受控轨迹预设，沿用学生本人/教师全部权限、领域契约、迁移、并发检查；每个模块验证后更新10。P0真实素材/设备、P1b缓存/LOD/机房性能的门槛继续保留，不能把上线当作验收完成。

本地目录为当前项目根目录；继续在现有仓库工作，先 `git status`、检查main远端状态，避免覆盖新改动。常规启动 `pnpm dev`，验证 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`；浏览器脚本及依赖见README。每次推送main会检查并部署，部署失败先读Actions日志。

接续提示：**“请先阅读docs/10、14、20、21，检查GitHub部署状态，再沿用既有架构继续COLORVERSE；每个模块测试并记录进度。”**
