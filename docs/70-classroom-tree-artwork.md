# 色彩之树：固定底图分区调色

2026-10-29。按用户确认，实验02改为固定构图的底图调色，复用原有四季、同色异境、自由调色、A/B、课堂模式、本机方案和 PNG 导出。仅独立课堂 Worker `colorverse-classroom-next`；不构建或发布比赛、评审、展示及 EXE，不修改数据库。

## 素材与实现

- `apps/web/public/color-lab/tree-artwork.png`：用户提供的第一张完整秋日图，1672×941 RGB，原文件逐字节复制。第二张未使用。
- `apps/web/public/color-lab/tree-regions.png`：内置 image_gen 编辑工具生成的同尺寸语义区域辅助图。红=叶片、绿=枝干根系、蓝=浮岛、黑=背景。原始生成文件 `C:/Users/Administrator/.codex/generated_images/01a11ec4-be3c-7e12-a3e5-37d1c5263833/exec-fb5cca2b-0ba0-4839-8e51-54110aeca47f.png`，逐字节复制；不是人工逐像素标注的精确分层源文件。
- `tree-cover.webp`：同一用户原图的960px网页封面。原图未覆盖修改。
- 无新增外部模型、纹理/CDN请求或依赖；Three.js 延续现有 MIT 许可。底图由用户提供，未加入第三方素材。

渲染器只使用一个平面和两张本地纹理，不再生成三维树和实例化叶片。着色器结合辅助区域图与原图暖色/饱和度细化树冠及枝叶间天空空隙。树干、浮岛与背景独立调色；背景变色保留云层亮部，避免直接增益导致过曝。四季共享原图构图、叶片分布与明暗。默认秋日参数保持原图效果。

画面等比例完整显示；左右对照各自完整容纳同一幅底图，存在正常留边。移除旋转/自动环绕界面，保留旧 JSON schema 的相机与 orbit 字段作兼容，新打开总是暂停且关闭 orbit。画质只影响画布分辨率。默认停止持续 RAF；选择播放微光时仅叠加轻微氛围点，暂停停止调度，页面隐藏也停止。微光不代表真实叶片或枝干运动。

同色异境最后绘制独立不透明教学叶形色片，默认 #D5A84B。保证针对其内部像素，含纹理的树冠叶片不宣称逐像素等于输入 HEX。显示加载状态，素材失败提供封面/重试；上下文丢失重试释放旧纹理、平面、材质和 renderer。

## 验证

`tests/tree-lab-browser.py` 直接运行 Chrome / SwiftShader，输出 `outputs/tree-art/`。11组检查：默认原图与暂停帧数；四季固定构图；实际 PNG 像素检查四区独立；两侧目标18个内部像素精确相等；JSON/本机保存/刷新/带标注 PNG；A/B与课堂抽屉复用；3种桌面尺寸及390×844；播放暂停与两次进出释放；WebGL丢失恢复；素材失败重试；只允许同源请求的冷启动及加载后断网调色、导出。

默认输出与原图等比例缩小参考的平均每通道绝对误差小于7/255，包括 WebGL 与参考缩小采样方式差异；没有宣称不同尺寸的输出逐像素等于源图。目标色片内部18点两侧均为 RGB 213/168/75。

实际命令：

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm classroom:next build
& 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' tests/tree-lab-browser.py
& 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' tests/color-lab-browser.py
```

生产静态预览通过 `COLORVERSE_TEST_URL=http://127.0.0.1:5187`，线上通过独立课堂地址运行同一脚本；证据文件分别带 local/production/online 前缀。三次11组检查均通过，水母13组本地浏览器回归通过。类型检查、lint、构建及 Worker dry-run 均通过。新增兼容用例验证旧三维方案的颜色参数保留，同时关闭旧环绕并暂停。

## 实际发布与线上回归

- 实验室：https://colorverse-classroom-next.2999346.workers.dev/color-mystery/lab
- 工作台：https://colorverse-classroom-next.2999346.workers.dev/color-mystery/lab/color-tree
- 课堂直达：https://colorverse-classroom-next.2999346.workers.dev/color-mystery/lab/color-tree?mode=classroom
- 发布源码：`1249efe`，分支 `codex/classroom-roster-assignments-accounts`；未推送 main。
- 前端 releaseId：`2026-10-29T09:09:52.560Z-1249efe`。
- 最终 Worker 版本：`d9ab24e0-4a8e-40b2-bcd7-3f9e10777eea`，100%流量。

执行 `pnpm classroom:next deploy`。第一次在读取 Cloudflare 服务时网络失败；第二次在 `HTTPS_PROXY/HTTP_PROXY/ALL_PROXY=http://127.0.0.1:7892`、`NODE_USE_ENV_PROXY=0` 下成功上传代码和静态资源，上传版本 `d8fe8f9c-df2b-427b-a093-35f937fc7bd3`；既有脚本的 secret 更新步骤再次遇到网络错误。随后以同一 Cloudflare API、同一独立 Worker、同一已有 secret 值单独重试该步骤（`node work/tree-art-secret-retry.mjs`，`NODE_USE_ENV_PROXY=1`），成功后通过部署 API 核对上述最终版本。未修改凭据内容，未重置账户密码。

线上11组浏览器验收通过，包括18个目标内部像素、分区独立、素材失败重试、上下文恢复、课堂直达、断网后调色导出。正式教师真实登录通过；35人名单包含原29名导入学生，发布作业、星球和通知接口可读取，匿名名单接口401。当前入口 JS/CSS、两张新增 PNG、封面和许可文件与本地生产构建逐字节一致。未创建、删除或改动学生、作品、评分数据；只读回归登录会更新既有登录记录。

比赛 Worker 仍为 `76b2e8b5-3634-456b-b00e-b6a2f68dd210`；默认域名和自定义域名下 `/review/`、`/exhibition/` 共16项HTML/入口资源/release哈希与发布前相同。EXE SHA256仍为 `1b1e7869eec137b4af2df77edb7f3ea4f1c6cc5de10f86745d3ecf6d4a749e3a`，情感案例数据文件也未变。独立课堂仍没有绑定新的自定义域名。

证据：`outputs/tree-art/online-browser.json`、`production-browser.json`、`local-browser.json`、`cloud-regression.json`；线上实拍包括 `online-workbench.png`、四季图、`online-comparison.png`、`online-classroom.png` 和 `online-same-color.png`。隔离前后记录为 `outputs/tree-lab/isolation-before.json`、`isolation-after.json`。所有截图均实际浏览器运行，未用设计稿替代。

## 实际限制

- 原图1672×941，放大不能增加真实细节；没有额外高清源图或真正分层 PSD。
- 语义辅助蒙版与原图颜色细化仍可能在极细枝叶、低饱和叶片和抗锯齿交界处产生少量混色，不能等同人工精修逐叶片蒙版。
- 主/辅/点缀比例用于改变稳定的视觉分布，柔化边界后是近似面积，不是逐叶片计数或精确像素面积统计。
- 冬季仅冷白配色，不新增雪层、落叶和树形变化；固定图不提供三维旋转和重新照明。
- 导入旧方案保留颜色参数，呈现方式随固定底图改变；旧视角和自动环绕不再生效。
- 断网验证指素材已加载后的实验，或本地HTTP服务运行时不依赖外部网络。云端账号、作业与评分仍需网络，不宣称线上整站冷启动离线。

## 蒙版生成提示词

使用内置 image_gen 编辑，输入仅第一张用户秋日图，transparent_background=false。最终提示词如下：

> Edit the provided image into a pixel-aligned semantic segmentation mask for a web recoloring shader. Preserve EXACT original composition, tree shape, canopy silhouette, island outline and positions. Full 16:9 canvas. Output ONLY flat class colors, no text, no lighting or shading: autumn leaves RED #FF0000 (including fine individual leaves, excluding sky holes), wooden trunk branches exposed roots GREEN #00FF00, entire floating rocky island and moss ground BLUE #0000FF, all sky clouds distant mountains and gaps between branches BLACK #000000. Highest priority exact tracing and alignment with input. This is a technical segmentation mask, not a new artwork. Preserve tiny sky holes between leaves as black and branches as green. Do not add or move objects.
