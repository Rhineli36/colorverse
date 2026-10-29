# 实验02：色彩之树

> 本文记录最初的程序化三维实现。2026-10-29 后续已按用户确认改为固定底图分区调色；当前实现、素材来源与验证以 [70 · 固定底图色彩之树](70-classroom-tree-artwork.md) 为准。

2026-10-29，独立云端课堂功能。只发布 `colorverse-classroom-next`，不修改原比赛 Worker、`/review/`、`/exhibition/`、比赛数据及 EXE。不执行通用 cloud:deploy、比赛构建、离线封装或数据库迁移。

## 入口

- 实验室：https://colorverse-classroom-next.2999346.workers.dev/color-mystery/lab
- 色彩之树：https://colorverse-classroom-next.2999346.workers.dev/color-mystery/lab/color-tree
- 课堂直达：https://colorverse-classroom-next.2999346.workers.dev/color-mystery/lab/color-tree?mode=classroom

复用原实验注册、课堂上下文门控、主导航、工作台 CSS、课堂设置抽屉与深链接机制。原实验01保留原路由和参数。入口显示两张同结构卡片，树封面来自运行场景导出的真实 PNG，而非参考图。只在进入实验后加载三维代码，Three.js 与水母共用同一依赖。

## 三维与教学

程序化弯曲树干、递归分级枝条、外露根系、15,795 个固定 ID 的定向实例化叶片、少量草、合批岩石浮岛和简化远景。随机种子 20261029，纯本地生成。叶片 GPU 微风具有位置相关相位；树干和枝条本版保持固定。使用柔和主光和半球填充，无自动曝光、Bloom、环境贴图或外部模型下载。

四季模式默认秋日流金。换季仅变颜色和指定背景，使用线性色彩插值过渡；暂停仍可换色。配色比例按稳定叶片排序分配，不重新随机。A/B 共享场景、几何、相机、风场时钟、灯光及曝光，独立编辑两侧配色；退出保留 A。三档质量只改变渲染分辨率，不改变叶片数量与分布，对照期间禁用质量切换。

同色异境使用同一树冠位置的**扁平叶形教学色片**，界面明确标注。色片使用不受光、无雾、无色调映射、全不透明、独立最后绘制材质，避免背景改变目标输出。默认暂停微风、禁止旋转和缩放、禁用自动环绕。可切冷暖/深浅背景、改变周围树冠、修改目标色、揭示相同 HEX、提取到中性背景并返回。默认目标实际输出已按导出 PNG 内部像素验证为两侧 RGB 213/168/75。

自由调色可设置树冠三色、归一化比例、枝干、地面和背景；命名第五季、保存与加载本机方案、导入/导出带 schemaVersion=1 的 JSON，使用 Zod 验证版本、HEX、比例、参数范围。实时最近参数与显式保存方案分开保存。PNG 支持纯画面或带方案名称、色标与参数，截取真实当帧画布，不含操作面板。

课堂模式和浏览器全屏独立；设置抽屉、模式切换不重建 renderer。窄屏使用设置抽屉。页面隐藏时停止 RAF；退出释放几何、材质、实例资源、监听、观察器与 renderer。WebGL 失败提供本地封面和中文重试，上下文丢失重试替换 canvas。

## 文件与许可

新增 `apps/web/src/features/color-lab/tree-state.ts`、`tree-renderer.ts`、`TreeLab.tsx`、`apps/web/public/color-lab/tree-cover.webp`，以及 `tests/tree-lab.test.ts`、`tests/tree-lab-browser.py`。修改实验注册、入口卡片、课堂导航、CloudExperienceView 和模块 CSS；原水母渲染器未改动。更新水母浏览器脚本使其在两张卡片中准确选择水母。

树几何、草、岩石、叶片与背景全部由本项目代码程序化生成，无第三方模型、贴图和字体授权缺项。Three.js 沿用项目 0.180.0 与现有 `THREE-LICENSE.txt`（MIT）。参考 AI 图片仅作设计方向，不作为页面素材。

## 实际检查和命令

已执行 `pnpm typecheck`、`pnpm lint`、`pnpm test`（42 文件、280 项通过）以及 `pnpm classroom:next build`（Vite 构建和 Worker dry-run）。本轮没有安装新依赖。

本机 PowerShell 启动：

```powershell
$env:VITE_ENABLE_CLOUD_AUTH='true'
$env:VITE_CLASSROOM_NEXT='true'
$env:VITE_EXHIBITION_MODE='false'
pnpm dev --port 5186
```

实际浏览器命令：

```powershell
& 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' tests/tree-lab-browser.py
& 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' tests/color-lab-browser.py
```

检查四季几何/叶片/光照/镜头/暂停时间不变、目标内部像素、自由方案 JSON 往返、本机显式保存、A/B、课堂抽屉、三个桌面尺寸及390×844、两次进出释放、真实 PNG。记录存于 `outputs/tree-lab/`。软件环境为 Windows Chrome headless / SwiftShader，1280×720 三档约6–8 FPS；另一次真实硬件渲染补测为 ANGLE NVIDIA RTX 3070 / D3D11，中档1280×720，4秒区间约119.77 FPS。短测结果不代表普通集成显卡或所有课堂机器的性能。

离线运行仅指：依赖安装且本地 HTTP 服务运行后，树实验素材和代码不依赖外网；账号、提交与批改继续需要云端。不要双击 file:// HTML。构建产物在 `work/classroom-next-site`；本轮不更新比赛展示资源，也不制作新 EXE。

## 已知限制

这是风格化、程序生成的实时三维场景，非参考图的照片级重建。远山简化为几何层，枝干固定，微风作用于叶片。本版只开放受控比较，未提供艺术演绎、季节落叶/积雪、独立提交或评分。没有宣称材质 HEX 等于受光叶片最终显示值；像素一致性保证针对明确标记的教学目标色片内部。自动化测试不能代替教室设备的持续性能检查。

## 实际发布结果

已执行 `pnpm classroom:next deploy`，发布源码为 `7551214`，独立课堂 Worker 最终版本 `20c4d360-1c69-4854-9ad3-6a57c294abf5`（100% 流量），前端 releaseId 为 `2026-10-29T04:49:32.618Z-7551214`。发布日志首次上传 ID 为 `58e34682-4fdd-4fef-8a91-f5cbd5832b9d`，既有脚本更新 secret 后以部署 API 返回的最终版本为准。源码已推送课堂分支 `codex/classroom-roster-assignments-accounts`；未推送 main。

生产静态预览启动命令为：

```powershell
pnpm exec vite preview --config apps/web/vite.config.ts --outDir C:/Users/Administrator/Documents/Codex/2026-10-09/new-chat/work/classroom-next-site --port 5187 --host 127.0.0.1
```

树浏览器脚本分别对开发 5186、生产预览 5187 和正式 Workers 地址运行，使用 `COLORVERSE_TEST_URL` 与 `COLORVERSE_TEST_LABEL` 区分。生产预览和线上均通过 8 组验收（含 WebGL 丢失重试和阻断外部请求的冷启动），页面脚本异常为零。目标在 A/B 各取中心及相邻内部 9 个点，均为 RGB 213/168/75；原水母 13 组浏览器回归通过。

线上只读课堂回归通过：教师实际登录、正式班级 35 人、点名册 29 人各保留一条、作业列表/星球/通知可读、匿名教师名单请求拒绝，入口 JS/CSS、树封面和许可与构建产物逐字节一致。

隔离前后对比通过：比赛 Worker 仍为 `76b2e8b5-3634-456b-b00e-b6a2f68dd210`；原自定义域名和 Workers 域名下 `/review/`、`/exhibition/` 共16项 HTML/JS/CSS/release 哈希不变；EXE 哈希仍为 `1b1e7869eec137b4af2df77edb7f3ea4f1c6cc5de10f86745d3ecf6d4a749e3a`。真实证据在 `outputs/tree-lab/isolation-before.json`、`isolation-after.json`、`cloud-regression.json`、`production-browser.json`、`online-browser.json`、`hardware.json`。

线上截图：`online-workbench.png`、`online-春日初醒.png`、`online-盛夏浓荫.png`、`online-秋日流金.png`、`online-冬日静谧.png`、`online-same-color.png`、`online-extracted.png`、`online-comparison.png`、`online-classroom.png`。均由实际三维画布与 React 工作台截取，非参考图拼贴。
