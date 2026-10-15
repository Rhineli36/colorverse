# 沉浸式星球与情感色卡：实施及验收记录

检查日期：2026-10-15。本文记录实际代码与浏览器结果，不代表正式课堂效果或赛事合规认证。此前诊断报告保留为当时快照；当前实现与运行边界以本记录和 [47](47-competition-run-and-package.md) 为准。

## 本次完成的体验

宇宙中选择学生星球，先进入该学生的内部背景场景；作品由已有生长元素承载，点击后打开详情，关闭后保留场景视角。作品目录作为辅助入口收起，未用作品卡片列表代替场景。两种入口分别是：

- 真实云端课堂：<https://colorverse-dev.2999346.workers.dev/>。真实账号、班级权限、私有图片、上传、评分与留言均依赖后端。
- 静态参赛展示：<https://colorverse-dev.2999346.workers.dev/exhibition/>；本机预览 <http://127.0.0.1:5193/>。五个匿名案例、五个默认风格、二十五幅作品为静态快照。其点评、互动记录和即时点赞均有演示标识，不能代替真实教学数据的验收。

主要代码：

| 实现 | 位置 |
| --- | --- |
| 云端背景、作品元素、详情及互动 | `apps/web/src/features/classroom/CloudGallery.tsx` |
| 静态星球场景、作品目录与只读详情 | `apps/web/src/features/competition/CompetitionView.tsx` |
| 场景缩放、拖动、键盘与关闭详情后的视角保留 | `apps/web/src/features/classroom/PlanetExplorer.tsx` |
| 卡片实际选色、HEX 微调、氛围输入 | `apps/web/src/features/classroom/ColorCardPicker.tsx` |
| 云端保存及本机编辑 | `CloudPlanetAppearance.tsx`、`apps/web/src/features/studio/StudioView.tsx` |
| 同一份知识与色卡内容 | `packages/contracts/src/learning-content.json`、`LearningPanels.tsx` |
| 生长坐标选取与真实上传 | `packages/domain/src/growth-placement.ts`、`apps/worker/src/showcase-cloud.ts` |
| 图片资源缓存、解码、重试 | `private-image-resource.ts`、`CloudPlanetAppearance.tsx` |
| 对比度、元素高亮、移动布局 | `apps/web/src/features/classroom/exploration.css` |

## 十二项验收

| 要求 | 当前结果及验证边界 |
| --- | --- |
| 1. 点击星球进入作者背景 | 已完成、已验证。静态两名学生不同背景；真实云端读取登录学生的私有内部背景。 |
| 2. 作者、作品和元素不串数据 | 已完成、已验证。元素使用唯一 workId；独立学生作品集合不交叉；真实教师和两名学生分别读回对应作品。 |
| 3. 元素可发现、电脑和手机可操作 | 已完成。高亮、呼吸、标题提示和键盘入口；390px 浏览器视口验证触摸点击及至少 44px 点击范围。未做实体 iOS/Android 设备验收。 |
| 4. 元素打开正确作品及反馈 | 已完成、已验证。云端私有图片、教师 89 分与文字评价、第二名学生留言均从后端读取；作者没有教师评分控件。 |
| 5. 关闭详情保留场景状态 | 已完成、已验证。关闭后同一场景组件保留缩放、平移及页面位置。元素位置保存后可跨刷新恢复；相机视角不作为服务器持久数据。 |
| 6. 色卡真正设置主色调 | 已完成、已验证。选择红色立即设置 #E85D5D，再调为 #6F91D2；本机也验证紫色到自定义 HEX。 |
| 7. 色卡有说明与思考问题 | 已完成、已验证。八种指定色卡沿用所给文案，并保留原有四种中性色。完整知识页与即时解释复用数据。 |
| 8. 微调颜色与氛围保存 | 已完成、已验证。云端刷新及全新密码登录后读回；本机 IndexedDB 保存刷新后读回。色调作用于外观、环境强调及装饰，不用整层染色覆盖上传背景。 |
| 9. 统一“色彩的奥秘” | 已完成、已验证。新导航、知识面板及两段指定说明采用共同内容源。知识并非强制前置步骤。 |
| 10. 深色界面文字清晰 | 已修复、已验证。教师评语显式浅色文字和独立背景，浏览器计算对比度约 13.88:1；原生 dialog 默认黑字也已覆盖。详情滚动时关闭按钮保持可见。 |
| 11. 图片失败可重试 | 已完成、已验证。静态背景和作品受控 503 后显示重试并恢复；真实私有图片首屏、失败重试和缓存复用另有浏览器记录，见下文。不是所有网络故障的保证。 |
| 12. 评分、评价、互动保存后端 | 已完成、已验证。独立教师及两名学生通过真实 Auth/Worker/PostgreSQL 接口保存、刷新、重新登录读取，未用临时前端状态替代。静态展示仍明确只读。 |

## 新作品与内部编辑

真实测试在独立演示班新增一件已授权示例作品，关联 T01、氛围及配色理由。提交成功后直接回到内部场景，出现 4.5 秒生长动画。新坐标在上传事务中选取并写入既有 element_params，保持在归一化范围内，优先远离既有元素；刷新后坐标、workId、原图及说明一致，旧元素没有被移动。浏览器降低动画偏好仍受到尊重。

旧作品已保存的坐标不被批量改写；历史重叠可以由作者编辑位置解决。当前算法不承诺无限作品仍无重叠，作品非常多时应使用目录辅助查找。

本机内部空间不再提供整体星球运行、星环、卫星、外缘光等新增控件；外部星球仍保留对应选项。云端光晕移至“外貌”，粒子氛围只编辑实际内部效果。没有删除历史文档中的图层。

色卡复测曾出现一次快速切换后 HEX 草稿未反映到预览。已去掉延迟 effect 覆盖输入草稿的路径：卡片/调色器显式重置草稿，合法 HEX 立即更新主色，失焦时再次提交合法值或恢复实际颜色。修复后再次执行云端与本机检查；不把此前一次失败隐去。

## 真实教学演示路线

1. 使用独立演示学生进入自己的星球，展开可随时关闭的引导或直接上传。
2. 上传窗口选择 T01/T02/T03 轻量模板，按需展开知识提示，选择图片，填写希望表达的氛围和配色理由。
3. 提交并点亮星球，欣赏生长动画；点击元素读取作品和作者说明。
4. 独立演示教师从班级统计进入学生星球，打开同一作品，保存评分与评语。
5. 第二名学生访问该星球，在“点赞、表情与留言”直接留言；也可展开可选的“感受、画面依据、建议”观察反馈。
6. 原作者刷新或重新登录，读取教师与同伴反馈；调整自己的星球设置或另交比较版本。

真实云端的轻量模板、作品关联和反馈已接通后端。本机正式课程的发布、退回重交、不可变版本历史仍是独立模块；没有因此把它们算作云端主演示的完整闭环。规则成长不是模型生成，也不等同于已经验证学习成效。

## 执行记录与证据

| 检查 | 实际结果 | 本机证据 |
| --- | --- | --- |
| `pnpm lint` | 通过 | ESLint 无错误 |
| `pnpm test` | 28 个文件、216 个测试通过 | Vitest；含真实 PGlite 接口测试与成长位置测试 |
| TypeScript、前端和静态构建 | 通过 | `pnpm cloud:deploy` 内执行两种 `tsc --noEmit` 与 Vite 构建 |
| `tests/exploration_static_browser.py` | 6 项通过，无 pageerror | `outputs/exploration-static-acceptance.json` |
| `tests/exploration_cloud_browser.py` | 7 项通过，真实隔离云端班级，无 pageerror | `outputs/exploration-cloud-acceptance.json` |
| `tests/exploration_upload_browser.py` | 真实上传、生长、位置保存及作品说明读回通过 | `outputs/exploration-upload-acceptance.json` |
| `tests/exploration_local_editor_browser.py` | 本机选色、保存、刷新、内部控件检查通过 | `outputs/exploration-local-editor-acceptance.json` |
| `tests/color_card_tuning_browser.py` | 8 轮快速选色/HEX 微调及不完整输入失焦检查通过 | `outputs/color-card-tuning-acceptance.json` |
| `tests/competition_package_browser.py` | 从实际 ZIP 解压，无依赖安装，阻断非本机请求后浏览通过；无外部请求 | `outputs/competition-package-acceptance.json` |
| Canvas 初始化失败及快速切页 | 前一轮已通过；本轮不冒充重新验收 | `tests/renderer_lifecycle_browser.py`、`outputs/renderer-lifecycle-after.json` |
| 私有图片首屏、并发复用及受控失败 | 前一轮已通过；本轮正常真实云端图片再次读到 | `tests/private_images_cloud_browser.py`、对应 outputs 记录 |

构建存在第三方 Zod PURE 注释警告和主应用大 chunk 提示；构建成功，未将警告表述为失败。浏览器使用 Windows Chrome、软件 WebGL；云端测试经本机代理访问，这不是中国大陆普通网络或大并发性能证明。没有宣称旧的全部 Python 浏览器脚本在新布局下均重新跑通。

截图位于本机忽略目录，不随源代码公开：

- `outputs/exploration-static-scene.png`：背景主体、作品元素。
- `outputs/exploration-cloud-color.png`：色卡、文字解释、HEX 与主色预览。
- `outputs/exploration-cloud-community.png`：教师反馈、同学点赞/表情/留言。
- `outputs/exploration-cloud-feedback-mobile.png`：手机宽度下的评语。
- `outputs/exploration-cloud-upload-growth.png`：真实上传后的生长瞬间。

测试只向受控独立演示班写入。原试用学生的历史快照比较发现新增 `learning_context=null` 这一迁移结构差异；去除该新增空列后，原字段、原星球、原作品和互动与原快照逐值相同。未通过恢复旧库覆盖数据。

真实云端本轮最终发布版本：`4d3deb90-0b09-4e85-850f-11a33428142a`。新布局的云端七项检查在此版本再次通过。静态构建同步放在 `/exhibition/`。

## 已有素材、未完成和交付边界

- 历史作业预览由负责人授权使用；已匿名化公开说明，演示解释不自动归为原作者意图。公开快照中的时间明确标为“演示入库时间”。
- 星球外观与内部环境含 AI 辅助生成素材；教学内容有 AI 辅助整理。没有接入运行时大模型 API；示例点评不能当真实教师成绩。
- 静态互动记录来自管理演示账户的快照；即时点赞仅当前页演示。真实课堂留言和评分才保存后端。
- 仍待负责人核实公开参赛素材授权、署名和贡献归属。没有自动认定学生原创比例，也没有新增未经核实的比赛要求。
- 实体手机、校园/评审现场网络、真实班级负载、Docker 新机器完整部署尚未验收。workers.dev 国内访问问题仍需另行处理；本轮没有购买服务器。
- 源码包约 7.6 MB、静态展示包约 5.5 MB，已实际生成在 `outputs/competition-delivery/`；包含文件数和 SHA256 见同目录 `打包校验.json`。两个包经过已配置密钥与受控演示密码的内容检查及私有路径排除检查；该检查不能代替人工公开发布审核。
- 静态包已从 ZIP 解压，在不安装依赖、阻断所有非本机浏览请求的情况下启动，浏览十颗星球、两个不同场景及作品详情，无外部请求或页面异常。预装 Node.js 和现代浏览器仍是前提。该测试不是断开操作系统网络，也不是在全新电脑上的验收。
- 源码包的新电脑安装依赖、配置外部 Supabase 后全流程运行尚未独立验收；不宣称离线完整课堂或跨新电脑一键运行已经通过。真实云端不会随静态包一起离线运行。
