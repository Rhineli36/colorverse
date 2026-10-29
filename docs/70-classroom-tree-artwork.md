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

生产静态预览通过 `COLORVERSE_TEST_URL=http://127.0.0.1:5187`，线上通过独立课堂地址运行同一脚本；证据文件分别带 local/production/online 前缀。水母13组浏览器回归沿用原脚本。发布与隔离核对结果在交付时补记。

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
