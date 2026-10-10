# COLORVERSE · 色彩宇宙

面向《设计色彩》课程的本地优先星球创作与展示应用。当前版本完成第一阶段的核心闭环，架构继续遵循 docs/；第一阶段完整验收与机房性能验证仍在推进。

## 本机启动

需要 Node.js 22.12+（本次验证为 24.19.0）、pnpm 11.25.0、现代 Chrome 或 Edge，建议开启硬件加速。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 http://127.0.0.1:5173 。首次打开会初始化六颗合成演示星球。无需账号、AI API Key、云数据库或付费服务。项目提交了生成后的演示图片，启动无需 Python。

没有 pnpm 时可通过已安装的 npm 执行 `npm install -g pnpm@11.25.0`，或按 [pnpm 安装文档](https://pnpm.io/installation)配置。依赖安装需要网络；运行和导出不调用外部模型。

## 作业提交系统：本机测试

先另开终端运行`pnpm dev:api`，保留`pnpm dev`，访问5173→“课程作业”。使用明确标注的合成学生/教师账户，可上传作品和过程图、保存私人草稿、提交固定版本；教师布置、评分或退回，学生重交并保留历史。退出课堂后切换身份，或使用独立浏览器上下文同时对照。

默认课程数据库和私有文件位于`work/course-server/`，不上传到GitHub。无数据库时使用持久PGlite（嵌入式PostgreSQL）；可通过DATABASE_URL连接独立PostgreSQL，现阶段API只监听本机。正式登录/私有云部署仍待完成，线上Pages显示未连接课程服务，不会发送真实作业。完整设计、环境变量与测试见[22](docs/22-course-submission-first-slice.md)。

本机5174预览若要体验课堂，在PowerShell构建前设置`$env:VITE_COURSE_API_URL='/api/v1'`，执行`pnpm build`、`pnpm preview`并保持API运行。Pages工作流不设置此开发配置。

## 已可操作的路径

1. 宇宙总览：占满主视区的深空星野，默认远景保留至少5200×3000的空间背景，星球可聚集或分散并沿独立90–190秒轨迹缓慢运行。拖空白移动视野，滚轮围绕鼠标位置缩放，双击地点或框选区域聚焦；首次点击星球聚焦，再次点击同一颗进入内部空间，也可通过卡片的“进入星球内部”按钮进入；运行轨迹默认隐藏，可单独开启。支持暂停、搜索和筛选。
2. 布置宇宙：左侧可切换学生/教师本地演示身份。学生只可拖拽自己的星球，教师可拖拽全部星球；松开保存位置，刷新仍保留。默认学生拥有“日落收藏家”，新建作品归该本地学生；作者署名不是权限依据。Esc取消拖拽/框选。
3. 编辑你的星球：普通点击进入欣赏模式；导航入口打开自己的作品，教师保留编辑其他作品的入口。导入与自动适应位于左侧顶部，图层独立常驻，隐藏/显示及删除紧接列表下方；下面的彩色选项卡切换星球信息和装饰，滚动装饰仍可看见图层。右侧集中主题色与画面编辑。外观使用固定圆形蒙版，图片可在其中移动、缩放/拉伸、非破坏裁剪；内部图片保持矩形并可自动完整适应画布。透明度放在基础调色，外观图片最低50%，内部可为0。两侧都有可撤销的复位按钮。顶部“提交课程作业”打开独立课堂；本机API运行时可以实际提交给测试老师，公开Pages暂未连接课程后端。可选粒子、光影、光环和1–3颗卫星继续保存/ZIP恢复。
4. 内部空间：背景/渐变、图片与效果图层、轻微动画/视差；编辑热点位置、图层绑定及文字/图片/档案内容。
5. 保存与恢复：800ms 防抖自动保存，也可点“保存”；导出作品 ZIP 包含原始素材与参数，配置 JSON 仅含参数。
6. 教师演示：导入通过校验的作品副本、隐藏/显示/从宇宙移除、下载小型完整宇宙备份。
7. 模拟生长：模拟提交→预览/改颜色和位置→接受或拒绝→保存→刷新；重复提交同一模拟作业不会重复生长；已接受元素可通过成长记录撤销。

本地身份用于第一阶段演示，当前权限策略只覆盖布局拖拽，不是正式账号系统。P2将从登录会话/班级成员建立授权并在服务器执行；不能信任客户端角色或ZIP署名。布局锚点进入宇宙备份，ownership归属保存在此浏览器私有存储，不随ZIP授予身份。

宇宙背景现包含纹理星云、吸积盘黑洞、24颗缓慢游移的小星星和低频流星（随机90–120秒一颗）。背景与星球同步平移和缩放，暂停/减少动态效果覆盖宇宙动态。渲染边界与资源预算见 [宇宙氛围](docs/15-universe-atmosphere.md)。

星球在宇宙中的展示尺寸统一限制为标准大小的0.8–1.2倍。旧布局只在展示时限制，不覆盖原有保存数据；图片局部取景和相机缩放独立。固定蒙版/适应见[18](docs/18-fixed-planet-frame-and-image-fit.md)，学生入口/常驻图层见[19](docs/19-student-edit-entry-and-persistent-layers.md)。尺寸规则见 [17-studio-tools-and-planet-size.md](docs/17-studio-tools-and-planet-size.md)。

点击星球后以38%视角平缓聚焦，约1.25秒完成95%的过渡，保留周边空间；选中主体按需使用最多2048像素的展示图。局部探索与手动缩放仍可进一步近看。定义和测试见[20](docs/20-gentle-focus-and-artwork-resolution.md)。

## 数据位置与备份

IndexedDB 数据库为 `colorverse-v1`，按浏览器配置和网站地址隔离。改端口、协议或浏览器会看到不同本地数据；这是本地草稿，不会自动同步。浏览器清理数据会移除本地作品，应定期导出 ZIP。不要通过双击 index.html 的 file:// 方式运行。

原始图片不可变，调色与裁剪只改参数；展示图和缩略图另生成。复位只恢复当前侧场景，文字、主题色与另一侧场景保留；已接受成长仍从成长记录撤销。复位基线是此浏览器最初保存/导入版本，ZIP 不包含完整本地版本历史。作品包导入默认生成副本并重映射引用；相同 exportId 重复导入无操作。教师“移除”只移除当前宇宙中的条目，原作品与原图仍在本地；当前还没有垃圾回收/回收站 UI。

仅 JSON 导入需要此浏览器已有 hash 一致的全部素材；缺素材时拒绝并提示 ZIP。隔离只读修复模式、展览脱敏包、大宇宙分批备份待实现。小包限制为压缩100MiB、解压200MiB、最多1000条，单图片20MiB、最长边8192、4000万像素。

## 开发与测试

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm schemas
pnpm build
pnpm preview
```

生产文件在 apps/web/dist/；可部署到静态服务器。`VITE_BASE_PATH` 默认 `/`，GitHub Pages工作流自动使用仓库子目录；已验证 `/colorverse/` 下的素材与ZIP Worker。当前不承诺完整 PWA 离线安装。

浏览器检查脚本使用 Python 3.11+ 与 Playwright，另开终端保留 `pnpm dev`：

```sh
python -m pip install -r tests/requirements.txt
python tests/browser_smoke.py
python tests/universe_navigation.py
python tests/spatial_interaction.py
python tests/decorations_browser.py
python tests/atmosphere_browser.py
python tests/background_camera_browser.py
python tests/image_tools_browser.py
python tests/studio_layout_browser.py
python tests/focus_framing_browser.py
```

脚本默认在 Windows 使用本机 Chrome，无头运行。Linux/无 Chrome 环境请执行 `python -m playwright install chromium`，Windows 可将 COLORVERSE_BROWSER_CHANNEL 设为空字符串改用已安装的 Playwright Chromium。本次记录使用 Windows Chrome/SwiftShader，不能视为普通机房集成显卡性能基准。`COLORVERSE_TEST_URL` 可指定生产预览地址。测试使用独立浏览器上下文，不改用户日常 Chrome 配置；结果和截图写入 outputs/，下载包写入 work/。

CI执行lint、82项模块测试和生产构建，另在PostgreSQL18服务运行20项课程契约/事务/HTTP测试；浏览器及机房验收暂由上述独立脚本执行。

代码仓库：[Rhineli36/colorverse](https://github.com/Rhineli36/colorverse)。main推送通过检查后部署GitHub Pages，实际状态见[Actions](https://github.com/Rhineli36/colorverse/actions)。本机草稿不会自动同步到在线演示，需导出/导入ZIP；部署与明天接续记录见[21](docs/21-github-deployment-and-handoff.md)。

## 结构与进度

apps/web 的 features 分为 universe、studio、planet-room、teacher-demo 和 course；apps/api实现本机课程HTTP/PostgreSQL/私有图片适配器；packages 分为 contracts、domain、application、renderer、package-io、fixtures。Zod 是运行时契约来源；docs/schemas/generated 是结构 Schema，跨引用/权限/成长状态仍由领域服务验证。

请先读 [设计索引](docs/README.md)、[实现进度](docs/10-implementation-progress.md)、[宇宙轨迹和镜头约定](docs/11-universe-motion-and-camera.md) 与 [空间探索和布局权限](docs/12-space-exploration-and-layout.md)。可选装饰与跟随协议见 [13-optional-planet-decorations.md](docs/13-optional-planet-decorations.md)。演示图片由 scripts/generate-demo-assets.py 生成，标记为系统合成素材，不代表学生作品或完整艺术素材交付。

已完成本机课程闭环（见22），尚未完成正式账号/云端课程系统、真实 AI、音频播放与全格式校验、300颗LOD/缓存上限实机验收、完整GPU失效只读模式、展览发布/脱敏和大包分批恢复。预设球体仅有契约与基础渲染支持，Studio 操作入口待补齐。生产构建可能打印第三方 Zod 注释的 Rollup 警告，构建已验证可完成。
