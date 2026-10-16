# 色彩星球 / COLORVERSE 设计文档

2026-10-16 最新云端发布、七种场景、新增作业与剩余工作请阅读 [57 云端发布和后续清单](57-cloud-release-and-remaining-work.md)。三份作业图文见 [56](56-assignment-images-and-color-experiments.md)，学习页整体改版见 [55](55-color-mystery-redesign.md)，连续拖动等修复见 [54](54-repeat-drag-and-discussion.md)。历史记录中的“仅本地”“尚未上线”以 57 号最新结果更新。

当前参赛版本请优先阅读 [47 参赛运行与打包说明](47-competition-run-and-package.md)。以下阶段规划和验收记录按当时版本理解，不能用旧的“待接入”描述判断现在的实现状态。

版本：0.1 设计基线 · 日期：2026-10-09 · 当前状态：P1a核心已实现、P2作业本机闭环已完成；正式在线课堂、P0实样/设备及P1完整验收待完成。

实施更新：2026-10-09 已开始并完成 P1a 核心闭环实现；以下规划记录作为设计历史保留，当前功能与实际测试结果请读 [10-implementation-progress.md](10-implementation-progress.md)。

本次按用户最新指令完成需求分析、长期架构、数据库、素材协议与开发计划。附件中“立即实现第一阶段”的要求留到下一轮执行。本目录中的接口、目录树、性能指标和排期都是设计，不代表已经存在的程序或测试结果。

## 阅读导航

| 文档                                                                                               | 内容                                                             |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [01-requirements.md](01-requirements.md)                                                           | 完整需求映射、角色、阶段边界、假设与风险                         |
| [02-architecture.md](02-architecture.md)                                                           | 技术选型、模块边界、统一渲染、未来目录结构与演进                 |
| [03-data-model.md](03-data-model.md)                                                               | 实体关系、字段、约束、提交状态、权限与数据生命周期               |
| [04-asset-package-protocol.md](04-asset-package-protocol.md)                                       | 场景文档、素材、ZIP、版本迁移与恢复协议                          |
| [05-services-and-growth.md](05-services-and-growth.md)                                             | Repository / Service、HTTP 草案、AI 生长与事务                   |
| [06-development-plan.md](06-development-plan.md)                                                   | 分阶段任务、依赖、验收、估时与退出条件                           |
| [07-feasibility-deployment-cost.md](07-feasibility-deployment-cost.md)                             | 三阶段可行性、部署、40 人三年容量与费用模型                      |
| [08-quality-and-decisions.md](08-quality-and-decisions.md)                                         | 测试矩阵、性能预算、架构决策与优先风险                           |
| [09-document-validation.md](09-document-validation.md)                                             | 本轮文档和协议草案的实际验证范围与结果                           |
| [10-implementation-progress.md](10-implementation-progress.md)                                     | 第一阶段模块实现、测试结果、限制和下一步                         |
| [11-universe-motion-and-camera.md](11-universe-motion-and-camera.md)                               | 独立轨迹、全景/局部/聚焦镜头、状态边界和24颗验证                 |
| [12-space-exploration-and-layout.md](12-space-exploration-and-layout.md)                           | 深空主视觉、任意区域探索、学生/教师拖拽权限与数据库升级          |
| [13-optional-planet-decorations.md](13-optional-planet-decorations.md)                             | 学生可选粒子/光影/光环/卫星、跟随主体协议、进入内部和测试        |
| [14-planet-motion-controls-plan.md](14-planet-motion-controls-plan.md)                             | 星球静止/慢速/快速、预设轨迹、本人/教师控制的原设计与验收计划    |
| [15-universe-atmosphere.md](15-universe-atmosphere.md)                                             | 星云/黑洞/低频流星、小星星游移、背景同步相机与资源预算           |
| [16-image-editing-and-scene-recovery.md](16-image-editing-and-scene-recovery.md)                   | 图片缩放/拉伸/裁剪、外观蒙版、分区上传、图层删除与独立复位       |
| [17-studio-tools-and-planet-size.md](17-studio-tools-and-planet-size.md)                           | 顶部导入/图层、就近操作、重叠选项卡与0.8–1.2倍展示尺寸           |
| [18-fixed-planet-frame-and-image-fit.md](18-fixed-planet-frame-and-image-fit.md)                   | 固定圆形轮廓、图片自动适应、透明度下限与选项卡配色               |
| [19-student-edit-entry-and-persistent-layers.md](19-student-edit-entry-and-persistent-layers.md)   | 学生欣赏/编辑与演示提交入口、独立常驻图层栏                      |
| [20-gentle-focus-and-artwork-resolution.md](20-gentle-focus-and-artwork-resolution.md)             | 38%适度聚焦、平缓过渡与选中主体按需展示图                        |
| [21-github-deployment-and-handoff.md](21-github-deployment-and-handoff.md)                         | GitHub Pages部署、数据迁移边界和明天接续记录                     |
| [22-course-submission-first-slice.md](22-course-submission-first-slice.md)                         | 作业草稿/不可变提交、教师评阅、本机API、权限与上线边界           |
| [23-showcase-upload-and-growth-direction.md](23-showcase-upload-and-growth-direction.md)           | 自选展示作品的用途调整、预制/模型方案比较与成长交互建议          |
| [24-showcase-growth-first-slice.md](24-showcase-growth-first-slice.md)                             | 自选作品上传、规则成长、事务与ZIP来源验证、约30种/API后续计划    |
| [25-growth-library-and-experience.md](25-growth-library-and-experience.md)                         | 8种成长元素登记、造型/预览保存、上传与分页优化、后续体验优先级   |
| [26-planet-motion-first-slice.md](26-planet-motion-first-slice.md)                                 | 单颗运动入口、四种受控轨迹、布局1.1.0迁移/冲突/备份与测试        |
| [27-visual-direction-and-student-playtest.md](27-visual-direction-and-student-playtest.md)         | 宇宙/星球/工坊视觉参考与提案、学生体验测试、分步美化与验收       |
| [28-element-focused-editor-plan.md](28-element-focused-editor-plan.md)                             | 提交后出现元素、点选专用编辑、元素库/细节/确认分区与画面拖动     |
| [29-automatic-growth-and-element-editor.md](29-automatic-growth-and-element-editor.md)             | 自动小元素、独立编辑会话、拖拽/撤销、动态粒子、权限和测试        |
| [30-default-art-and-student-entry.md](30-default-art-and-student-entry.md)                         | 六颗球面默认素材、单张全景、旧作品安全升级、首次创建和后续编辑   |
| [31-classroom-space-and-boundaries.md](31-classroom-space-and-boundaries.md)                       | 满屏班级星域、外围背景、带轨迹余量的部署边界与旧布局兼容         |
| [32-artwork-first-and-growth-birth.md](32-artwork-first-and-growth-birth.md)                       | 点击元素先欣赏原作、明确编辑入口、约4秒新生动效与验证            |
| [33-upload-login-and-file-readiness.md](33-upload-login-and-file-readiness.md)                     | 文件生命周期、登录/密码现状、正式上线阻塞项与下一轮验证          |
| [34-universe-landmarks.md](34-universe-landmarks.md)                                               | 分散恒星/黑洞、同步世界相机、共享纹理/粒子预算与验证             |
| [35-classroom-interaction-and-daily-stars.md](35-classroom-interaction-and-daily-stars.md)         | 每周展示/全班浏览/互动任务、每日精选、关注与去重统计的待实施建议 |
| [36-cloud-auth-and-cloudflare-pilot.md](36-cloud-auth-and-cloudflare-pilot.md)                     | 邮箱登录/退出、Workers服务端验证、部署配置与正式班级接入边界     |
| [37-cloud-classroom-identity.md](37-cloud-classroom-identity.md)                                   | 私有班级成员表、受限读取角色、Hyperdrive证书连接与真实教师登录   |
| [38-cloud-teacher-dashboard-and-student-pilot.md](38-cloud-teacher-dashboard-and-student-pilot.md) | 云端教师统计、学生私有上传/原图、班级互动与30种成长造型          |
| [schemas/growth-event.schema.json](schemas/growth-event.schema.json)                               | 成长事件 v1 机器可读协议草案                                     |
| [examples/growth-event.accepted.json](examples/growth-event.accepted.json)                         | 学生确认后的模拟成长事件示例                                     |

## 推荐基线

采用 React + TypeScript + Vite 的本地优先模块化应用，PixiJS 负责统一的二维/轻视差渲染，Zustand 管编辑会话，IndexedDB 保存文档和素材 Blob。第一阶段不建设账号、云数据库或真实模型服务。

第二阶段在相同领域接口外增加 TypeScript 模块化后端、PostgreSQL、私有对象存储；第三阶段增加后台任务和可替换模型适配器。先保留清晰边界，不先造微服务、多端协同或通用三维编辑器。

长期不变的约束：原创文件不可变；所有资源通过 ID 引用；编辑文档与渲染库解耦；课程提交版本不可变；公开展览使用经过筛选的快照；AI 只能提出受限预设参数，必须经过学生确认才能应用。

## 本轮交付边界

- 已完成：设计文档、实体字典、协议约定、成长事件 Schema 与示例、成本计算模型。
- 未开展：应用脚手架、运行时实现、数据库迁移、素材制作、真实 AI 调用、部署。
- 验证范围：文档链接、Schema/示例一致性和成本算术；运行效果、跨机 ZIP 还原与性能必须在开发阶段验证。
- 文档中引用的官方资料检索日期为 2026-10-09；依赖精确版本在 P0 建项时确认并锁定。

规划阶段的下一步原为 P0 素材样本和渲染原型；现按最新用户指令执行开发，具体推进状态以 10 为准。开放问题须在对应阶段验收门槛前确认。

39. [学生入口与云端星球外观](39-student-entry-and-cloud-planet-appearance.md)

40. [学生新手任务与设置分类](40-student-guided-tasks.md)

41. [教师入口与恒星视觉区分](41-teacher-navigation-and-emissive-stars.md)

42. [登录续期、未提交内容与云端入口](42-pilot-session-continuity.md)

- [43 · 云端作品管理与生长元素扩充](43-cloud-work-management-and-growth.md)

- [44 · 自由任务引导与可见效果预览](44-optional-guide-and-visible-effects.md)

- [45 · 班级演示与真实云端运行](45-classroom-demo-and-shared-motion.md)

- [46 · 云端教师作品点评与评分](46-cloud-showcase-teacher-reviews.md)

- [47 · 参赛运行方式与打包边界](47-competition-run-and-package.md)

- [48 · 沉浸式星球与情感色卡验收](48-immersive-scenes-and-emotion-colors.md)

- [49 · 统一云端大宇宙与实名案例](49-unified-cloud-universe.md)

- [50 · 参赛展示界面精修与实测](50-presentation-refinement.md)

- [51 · 八色系情感案例与离线身份体验](51-emotion-offline-experience.md)

- [52 · 创建模板、星球拖拽与默认场景](52-planet-templates-and-placement.md)

- [53 · 双场景编辑与课堂信息](53-design-editor-and-classroom-mail.md)

- [54 · 连续拖动与留言区修复](54-repeat-drag-and-discussion.md)

- [55 · 色彩的奥秘改版与验收](55-color-mystery-redesign.md)

- [56 · 作业模板配图与七个色彩体验工具](56-assignment-images-and-color-experiments.md)

- [57 · 云端发布、七种场景、新增作业与剩余工作](57-cloud-release-and-remaining-work.md)

- [58 · 背景星球缩放修复与主宇宙文案](58-distant-planets-and-universe-copy.md)

- [59 · 背景星球疏减与最终封装安排](59-scenery-density-and-final-package-timing.md)

- [60 · 色相与明度样图实装](60-hue-and-lightness-supplied-images.md)
