# COLORVERSE · 色彩星球

面向《设计色彩》课程的星球创作与课堂反馈应用。当前图片与云端 / 展示版统一说明见 [本轮交付记录](docs/62-cloud-exhibition-parity.md)。真实云端课堂、本地离线展示和早期本机开发模块使用不同数据服务；下方早期阶段说明保留为迭代记录。最终封装待全部样图与学生试用完成。

## 本机启动

需要 Node.js 22.12+（本次验证为 24.19.0）、pnpm 11.25.0、现代 Chrome 或 Edge，建议开启硬件加速。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 http://127.0.0.1:5173 。首次打开会初始化六颗合成演示星球。无需账号、AI API Key、云数据库或付费服务。项目提交了生成后的演示图片，启动无需 Python。

没有 pnpm 时可通过已安装的 npm 执行 `npm install -g pnpm@11.25.0`，或按 [pnpm 安装文档](https://pnpm.io/installation)配置。依赖安装需要网络；运行和导出不调用外部模型。

## 自选作品与星球成长

进入“编辑你的星球”→“添加展示作品”，上传图片并填写标题/说明/关键词。作品独立保存后返回星球内部，小元素通过约4秒的微光、舒展和光圈消退逐渐出现。点击元素先展示原作，再通过展示窗口下方的“编辑元素”进入专用编辑器：上方选8种造型，画面直接拖动/角点缩放，右侧改颜色、饱和度、自身动态和粒子，底部确定/撤销/重置。取消编辑保留已提交作品和默认元素；编辑不改变环境、原图或出生来源。刷新及ZIP保留最新图层与成长记录，成长失败可在作品列表重试。旧待确认建议仍可继续预览。无需课程服务器或AI API。具体行为见[32](docs/32-artwork-first-and-growth-birth.md)。

最终元素库目标约30种，先逐批校准；学生API定制留到下一步，尚未接入。当前作品仍存此浏览器，跨设备需主动导出/导入ZIP。基础流程见[24](docs/24-showcase-growth-first-slice.md)，本轮登记与体验改进见[25](docs/25-growth-library-and-experience.md)。

## Supabase / Cloudflare 登录测试版

前端workspace已安装`@supabase/supabase-js`，公开配置模板位于[apps/web/.env.example](apps/web/.env.example)，复制为同目录`.env.local`后填写项目URL与Publishable key。模板不包含真实项目配置，`.env.local`由Git忽略。`VITE_*`只用于可公开的前端值，数据库密码、连接字符串与高权限Secret key须另存于后端私密配置。

新增邮箱密码登录、退出和服务端身份验证，配置 `VITE_ENABLE_CLOUD_AUTH=true` 后显示登录入口。当前云端版本从数据库核对班级与角色，支持私有作品上传、教学模板与配色说明、规则成长、教师评分、同伴反馈。上传仅发生在真实云端课堂入口，本机草稿不会自动上传。GitHub Pages 默认保留本机演示、关闭云端登录模块，其 exhibition 子目录是匿名静态快照。

Cloudflare 使用独立 Fetch Worker 与 Static Assets，`pnpm cloud:check` 验证本机帐户配置，`pnpm cloud:dry-run` 构建预检，`pnpm cloud:deploy` 发布测试版。令牌与 Account ID 保存在根目录 Git 忽略的 `.env.cloudflare.local`，不放入 `VITE_*`。真实班级授权、Hyperdrive 与云星球已接入；上传使用 Supabase 私有 Storage，未接入 R2。配置、验证范围与上线门槛见[36](docs/36-cloud-auth-and-cloudflare-pilot.md)。

## 作业提交系统：本机测试（扩建暂缓）

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

本地身份用于第一阶段演示，当前权限策略覆盖布局拖拽和运动设置，不是正式账号系统。P2将从登录会话/班级成员建立授权并在服务器执行；不能信任客户端角色或ZIP署名。布局锚点进入宇宙备份，ownership归属保存在此浏览器私有存储，不随ZIP授予身份。

编辑侧栏「运动」及宇宙聚焦卡「星球运动设置」可选择静止/慢速/快速、圆形/椭圆/八字/往返、三档范围和方向。预览可取消，保存后应用；学生只控制自己的星球，教师控制当前宇宙所有可见星球。原有轨迹在未配置时保持不变；布局首次写入升级为1.1.0，运动/拖拽共享revision防止覆盖。单星球ZIP不含运动布局，完整宇宙备份声明新版本和能力。详见[运动设置](docs/26-planet-motion-first-slice.md)。

默认六颗星球已升级为统一球面光影的系统素材；学生上传图像保留自己的颜色和取景。尚未拥有星球时只显示“创建我的星球”，创建后改为“编辑你的星球”，不再提供重复创建入口；本地演示初始已有本人星球。详见[默认美术与首次入口](docs/30-default-art-and-student-entry.md)。

宇宙背景采用单张完整全景图（约175 KiB），背景范围64000×36000，班级可部署星域40000×22500，约4–5%远景铺满16:9视口，纹理尺寸/显存预算不随世界范围扩大。包含吸积盘黑洞、24颗缓慢游移的小星星和低频流星（随机90–120秒一颗）。星云在所有距离与星球围绕同一鼠标位置同步缩放和拖拽，边缘自然融入持续覆盖视口的深空星点，不重复平铺。柔边只在加载时处理一次，导航不重建纹理；暂停/减少动态效果覆盖宇宙动态。基础预算见[宇宙氛围](docs/15-universe-atmosphere.md)，新版图像和缩放规则见[30](docs/30-default-art-and-student-entry.md)，带运动余量的星球部署边界见[31](docs/31-classroom-space-and-boundaries.md)。学生控制本人星球、教师控制所有星球；拖动时显示边界，已有布局不自动重排。

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
python tests/element_editor_browser.py
python tests/default_art_browser.py
```

脚本默认在 Windows 使用本机 Chrome，无头运行。Linux/无 Chrome 环境请执行 `python -m playwright install chromium`，Windows 可将 COLORVERSE_BROWSER_CHANNEL 设为空字符串改用已安装的 Playwright Chromium。本次记录使用 Windows Chrome/SwiftShader，不能视为普通机房集成显卡性能基准。`COLORVERSE_TEST_URL` 可指定生产预览地址。测试使用独立浏览器上下文，不改用户日常 Chrome 配置；结果和截图写入 outputs/，下载包写入 work/。

CI执行lint、211项模块测试和生产构建，另在PostgreSQL18服务运行课程契约/事务/HTTP测试；浏览器及机房验收暂由上述独立脚本执行。启用云端登录的隔离浏览器检查见 `python tests/cloud_auth_browser.py`，所有 Auth 请求均使用模拟响应。

代码仓库：[Rhineli36/colorverse](https://github.com/Rhineli36/colorverse)。main推送通过检查后部署GitHub Pages，实际状态见[Actions](https://github.com/Rhineli36/colorverse/actions)。本机草稿不会自动同步到在线演示，需导出/导入ZIP；部署与明天接续记录见[21](docs/21-github-deployment-and-handoff.md)。

## 结构与进度

apps/web 的 features 分为 universe、studio、planet-room、teacher-demo 和 course；apps/api实现本机课程HTTP/PostgreSQL/私有图片适配器；packages 分为 contracts、domain、application、renderer、package-io、fixtures。Zod 是运行时契约来源；docs/schemas/generated 是结构 Schema，跨引用/权限/成长状态仍由领域服务验证。

请先读 [设计索引](docs/README.md)、[实现进度](docs/10-implementation-progress.md)、[宇宙轨迹和镜头约定](docs/11-universe-motion-and-camera.md) 与 [空间探索和布局权限](docs/12-space-exploration-and-layout.md)。可选装饰与跟随协议见 [13-optional-planet-decorations.md](docs/13-optional-planet-decorations.md)。旧演示图和内部背景由 scripts/generate-demo-assets.py 生成；新版默认星球和宇宙背景由内置imagegen生成后压缩，素材/提示词登记见[30](docs/30-default-art-and-student-entry.md)。均标记为系统演示素材，不代表学生作品或完整艺术素材交付。

已完成本机课程闭环（见22），尚未完成正式账号/云端课程系统、真实 AI、音频播放与全格式校验、300颗LOD/缓存上限实机验收、完整GPU失效只读模式、展览发布/脱敏和大包分批恢复。预设球体仅有契约与基础渲染支持，Studio 操作入口待补齐。生产构建可能打印第三方 Zod 注释的 Rollup 警告，构建已验证可完成。
# 当前云端试用入口

[Cloudflare 课堂测试版](https://colorverse-dev.2999346.workers.dev/)已接通真实教师/学生身份、班级统计、私有展示作品上传/原图下载、班级互动和 38 种成长造型、展示作品教师点评与评分。教师进入“班级管理”，学生进入“我的星球与作品”。原本完整创作工坊和宇宙布局仍保存在本机，尚未自动同步云端课堂。实际验证及限制见[38](docs/38-cloud-teacher-dashboard-and-student-pilot.md)。GitHub Pages保持本地演示。

学生确认进入、首次随机创建和云端星球外貌/背景设置见 [39](docs/39-student-entry-and-cloud-planet-appearance.md)。已有星球再次进入会选中本人星球。

学生进入后的十项功能任务、自动进度、五类设置和实际云端验收见 [40](docs/40-student-guided-tasks.md)。刷新课堂测试版、确认进入自己的星球即可看到；没有其他学生星球时，拜访和互动任务等待同学加入。

教师演示入口现在仅对服务端验证的教师账户显示；恒星已放大并调整为更透亮的发光外观。说明及验证见 [41](docs/41-teacher-navigation-and-emissive-stars.md)。包含本地教师操作的浏览器脚本需启用云端登录构建，使用隔离教师身份 fixture。

正常登录续期现在保留云端上传表单和编辑内容；有未完成操作时保护导航和退出，星球设置需要保存或明确放弃。云端学生导航收起本地工坊和模拟课程入口，将「我的星球与作品」和「宇宙演示」区分。真实班级宇宙已支持自动排布和保存的运行效果，共同拖放布局尚未迁移；边界与试用前后续事项见 [42](docs/42-pilot-session-continuity.md)。新会话回归为 `python tests/cloud_session_continuity_browser.py`，使用隔离 Auth/API。

作品与元素现在可以一起撤下、恢复；本人互动可撤回，教师可移除班内留言。新增纸鹤、风铃、光帆飞船和风筝，共 34 种造型。撤下仍保留文件并占用配额，详情与验证见 [43](docs/43-cloud-work-management-and-growth.md)。

最新学生引导与效果修复见 [44 · 自由任务引导与可见效果预览](docs/44-optional-guide-and-visible-effects.md)。

班级素材演示、云端运行与教师回放说明见 [45](docs/45-classroom-demo-and-shared-motion.md)。

云端教师作品点评、100 分制评分和演示建议确认见 [46](docs/46-cloud-showcase-teacher-reviews.md)。评分与学生互动分开，展示作品点评不替代正式课程成绩。

比赛公开展示版见 [展示部署说明](deploy/exhibition/README.md) 和 [五组作业风格星球](docs/competition-planet-styles.md)。`pnpm build:competition` 输出不依赖登录/API 的静态站点：5 个真实作业风格案例、25 件压缩预览、5 个默认星球、统计快照和明确标注的演示点评。Cloudflare 与 GitHub Pages 的 `/exhibition/` 是现有镜像；国内比赛入口仍需另部署并进行校园/手机网络实测。真实课堂的通用 Node 服务适配准备在 `deploy/server/`，尚未完成 Linux/Docker 主机验收。
