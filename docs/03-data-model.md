# 03 · 数据库与领域模型

## 1. 建模原则

P1 的可移植 PlanetDocument 是编辑交换格式；P2 的关系模型管理身份、授权、提交历史与审计。不是每个视觉参数都拆成 SQL 列：场景文档放 JSONB，需检索/授权/关联的字段规范化。二进制只在 IndexedDB Blob 或对象存储，关系库保存元数据及引用。

云端主键使用 UUID，时间为 UTC timestamptz，显示由客户端时区转换；截止日期使用班级 IANA 时区录入后存 UTC。表通用字段为 id、created_at、updated_at；软删除的业务实体增加 deleted_at，历史版本/审计按追加记录处理。下面标为“可空”之外的关键字段为必填。

## 2. 关系总览

```text
Courses 1─N Classes 1─N Assignments
Users N─N Classes（Enrollments，角色附着于班级）
Enrollments 1─0..1 Planets
Assignments 1─N Submissions N─1 Enrollments
Submissions 1─N SubmissionVersions 1─N SubmissionVersionAssets
SubmissionVersions 1─N Reviews
Planets 1─N PlanetRevisions 1─N PlanetHotspots（版本投影）
Planets 1─N PlanetAssets N─1 Assets 1─N AssetVariants
Planets 1─N ArchiveEntries N─0..1 SubmissionVersions
Planets 1─N PlanetGrowthEvents N─0..1 SubmissionVersions
Planets 1─N Publications → 冻结的 PlanetRevision + 白名单档案/媒体
Universes 1─N UniverseEntries → Publication 或 P1 local Planet
```

## 3. 核心实体字典

| 实体 | 主要字段（类型） | 外键与约束 / 用途 |
| --- | --- | --- |
| Users | id UUID；auth_issuer text；auth_subject text；display_name text；status enum | UNIQUE(issuer,subject)；学生号等内部信息另存私密 profile，不进作品包；不自建明文密码 |
| Courses | id；title text；description text；created_by UUID | created_by→Users；课程模板与每学期班级分开 |
| Classes | id；course_id UUID；term text；title text；timezone text；archived_at 可空 | course_id→Courses；一个班级对应一个课程学期实例 |
| Enrollments | id；class_id UUID；user_id UUID；role student/teacher/assistant；status active/inactive | UNIQUE(class_id,user_id)；FK Classes/Users；助教批改是否开放由策略控制 |
| Assignments | id；class_id UUID；title；instructions text；module text；due_at；late_until 可空；max_score numeric；status draft/published/closed | FK Classes；max_score>0；late_until≥due_at；要求改变记录 audit，不追溯修改已提交版本 |
| Submissions | id；assignment_id；enrollment_id；state；draft JSONB；current_version_id 可空；revision int | UNIQUE(assignment_id,enrollment_id)；必须同班且为 student；current_version 必须属于本提交；draft 只能本人改 |
| SubmissionVersions | id；submission_id；version_no int；description text；color_tags JSONB；submitted_at；due_at_snapshot；is_late bool；content_hash text | UNIQUE(submission_id,version_no)；不可变；is_late 按服务器提交时间与当时 due_at 决定；附件在连接表 |
| SubmissionVersionAssets | version_id；asset_id；role final/process/audio；ordinal int | 复合 PK(version_id,asset_id,role)；排序唯一(version_id,role,ordinal)；禁止跨所有者未授权引用 |
| Reviews | id；submission_version_id；reviewer_enrollment_id；score numeric 可空；comment text；decision graded/returned；supersedes_id 可空 | 明确指向版本；分数在 0..assignment.max_score；改评追加新记录；仅本班教师/授权助教 |
| Planets | id；owner_enrollment_id 可空；name；summary JSONB；current_revision int；status draft/archived | P2 学生星球 owner 必填且 UNIQUE(owner_enrollment_id)；P1 演示可空；隐藏在 UniverseEntry，不代表删除 |
| PlanetRevisions | id；planet_id；revision int；schema_version text；document JSONB；document_hash；created_by 可空 | UNIQUE(planet_id,revision)；已保存版本不可变；Planets 指针只在事务内更新 |
| Assets | id；owner_user_id 可空；sha256 char(64)；mime_type；byte_size bigint；storage_key text；width/height/duration 可空；status pending/ready/quarantined/deleted；rights JSONB | 原始文件不可变；storage_key 唯一；存储路径非可访问 URL；同用户可按 hash 去重，跨用户去重不泄露存在性 |
| AssetVariants | id；asset_id；kind thumbnail/display；recipe_version；sha256；mime_type；byte_size；storage_key；width/height | UNIQUE(asset_id,kind,recipe_version)；FK Assets；变体可重建，原图不可覆盖 |
| PlanetAssets | planet_id；asset_id；usage body/background/layer/audio/archive；created_at | 复合 PK(planet_id,asset_id,usage)；明确资源闭包，用于清理、授权和导出 |
| PlanetHotspots | planet_revision_id；hotspot_id UUID；scene_id UUID；layer_id 可空；target_kind；archive_entry_id 可空；shape JSONB；payload JSONB | 复合 PK(revision_id,hotspot_id)；归属必须同星球；作为该 revision.document 的只读投影，禁止独立修改 |
| ArchiveEntries | id；planet_id；source_type sample/submission；submission_version_id 可空；title；created_on date；module；description；color_tags；sample_asset_ids 可空 | submission 类型必须绑定确切版本，UNIQUE(planet_id,submission_version_id)；示例可以可编辑，真实提交正文来自不可变版本 |
| PlanetGrowthEvents | id；planet_id；submission_version_id 可空；trigger_key text；status proposed/accepted/rejected/reverted；payload JSONB；base_revision；applied_revision 可空；accepted_at 可空 | UNIQUE(planet_id,trigger_key)；payload 遵循 GrowthEvent Schema；已接受 payload 冻结；撤销记录保留 |

跨表约束不能全部靠 CHECK 表达：同班提交、引用所属、current_version 归属、角色、评分上限需在服务事务中验证，关键关系可辅以组合外键和触发器。迁移评审时明确哪些由 DB 强制、哪些由服务强制，不能用“JSONB 灵活”跳过校验。

## 4. 后续必需的支撑实体

| 实体 | 关键字段与用途 |
| --- | --- |
| Universes / UniverseEntries | universe: id/class_id/title/layout_version；entry: universe_id/planet_id/publication_id 可空、visible、position、scale、sort_order；UNIQUE(universe_id,planet_id)。云端访客只能指向 publication，P1 演示可指 localPlanetId |
| Publications | id/planet_id/source_revision_id/audience(class或public)/published_by/published_at/revoked_at/payload JSONB；payload 是安全 DTO，白名单复制公开档案与公开媒体，不能直接暴露源 document |
| PublicationAssets | publication_id/source_asset_id/public_storage_key/hash；为发布快照建立独立资源白名单和派生文件访问范围 |
| GrowthJobs | id/event_id/attempt/state/lease_until/next_run_at/provider/model/prompt_version/input_hash/usage/cost/error_code；UNIQUE(event_id,attempt)；超时接管、调用计量 |
| GrowthEventActions | id/event_id/actor_id/action/payload/created_at；接受、拒绝、修改建议、教师决定和补偿历史；已发生的动作不可覆盖 |
| IdempotencyRecords | actor_id/operation/key/request_hash/response/status/expires_at；UNIQUE(actor_id,operation,key)；相同 key 不同 body 报冲突 |
| ExportJobs / AuditLogs | 前者跟踪学期归档快照和过期下载；后者记 actor/action/resource/requestId，不包含原图、密钥或完整私人评语 |

后续运动控制：UniverseEntry拟新增motion配置与layoutRevision，作为宇宙展示布局，不改变PlanetRevision或原图；参考 [14-planet-motion-controls-plan.md](14-planet-motion-controls-plan.md)。当前运行时尚未提供这些字段，需伴随布局协议迁移。

P1 不创建这些 SQL 表，只模拟真实需要的本地实体。P2 在引入权限时建 Users 至 Publication 系列；P3 才建真实模型任务与用量。

## 5. 提交状态与版本

```text
draft ─提交→ submitted ─教师评阅→ graded
                         └退回→ returned ─再次提交新版本→ submitted
```

`is_late` 是每次 SubmissionVersion 的独立属性，不是互斥工作流状态，因此一个迟交作业也可已批改。graded 后是否允许补交由作业策略决定；允许时创建新版本，旧版与旧评语保留。退回后编辑 draft 不修改已提交版本。closed 作业拒绝新提交，除非教师显式开放。

提交事务：锁定 submission / 检查 revision 与班级成员→验证全部媒体 ready→插入 version 与附件→切 current_version、state→追加 ArchiveEntry→提交。相同幂等键重复请求返回同一 version，不产生第二份档案。若启用 P3，事务同时写可消费任务，Worker 只在事务成功后运行。

热点指向稳定 ArchiveEntry ID；提交改版不会静默替换旧热点看到的作品版本。学生可显式重新绑定新条目。在线查询再次检查访问权限，无法授权时返回占位卡，不能因知道 ID 读取私人媒体。

## 6. 本地文档与关系库的单一事实来源

- PlanetRevision.document 是该版本视觉数据的事实来源。PlanetHotspots/PlanetAssets/summary 是服务在同一保存事务中生成的投影；不能开放绕过文档的热点写接口。
- 课程作业与 Review 以关系库为准；公开副本由 Publication 固化。编辑器中的 archiveRef 是引用，不复制内部评语。
- P1 本地事务 stores：planets、planetRevisions、assets、assetVariants、universes、archiveEntries、growthEvents、growthActions、importStaging。IndexedDB 结构版本独立于作品 schemaVersion。
- P2 JSONB 在服务器重复校验，客户端校验只为体验。未来查询热点投影可重建，历史原始文档需保留。

## 7. 权限矩阵与公开发布

| 资源/动作 | 学生本人 | 同班其他学生 | 本班教师 | 匿名访客 |
| --- | --- | --- | --- | --- |
| 草稿/未公开原图 | 读写 | 禁止 | 默认不可读个人未交草稿 | 禁止 |
| 已提交作品版本 | 读；后续提交新版本 | 默认禁止 | 读/批阅 | 禁止 |
| 分数/评语 | 读自己的已发布评阅 | 禁止 | 读写本班评阅 | 禁止 |
| 星球编辑文档 | 读写本人 | 禁止 | 默认只读已分享/提交内容，不能改画 | 禁止 |
| 星球运动模式/轨迹（后续） | 设置本人 | 不得修改他人 | 设置本班全部星球 | 不得修改 |
| 宇宙中的星球位置 | 移动本人星球 | 不得移动他人 | 移动本班全部星球 | 不得移动 |
| 班级展示快照 | 班级成员读 | 班级成员读 | 发布/撤回 | 禁止 |
| 公开展览快照 | 读；申请发布 | 读 | 审核/发布/撤回 | 只读 |
| AI 提案 | 预览/改/接受/拒绝自己的 | 禁止 | 按课程策略审核 | 禁止 |

服务端从登录会话与 Enrollments 判断权限，不能信任客户端 role 或 ZIP 作者字段。不同班级教师不得互读。数据库可加 RLS 作为纵深控制，但运行账户不应是绕过策略的所有者；应用授权仍必须执行。[PostgreSQL 行安全文档](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)

公开发布递归遍历背景、图层、热点、档案、音频、生长来源；只复制明确同意公开的内容。私人作业引用替换为公开作品卡或“来源未公开”，分数、评语、邮箱、学号、外部身份 ID、任务日志均剔除。公开媒体使用独立派生对象，默认去除 EXIF 等元数据，私有原图继续保留。

撤回 publication 立即使 API 不再返回，清理 CDN 缓存；已下载文件无法追回。私有媒体用短时授权 URL 或鉴权代理，公开对象不能与私有原图共用永久公开链接。

## 8. 索引、清理与恢复

2026-10-09 P1实施补充：IndexedDB结构版本升级为2，保留原有作品/素材stores，并增加ownership（planetId→本地actorId）与settings（演示布局一次迁移标记）。归属只用于本地身份演示，不放入作者署名或可移植ZIP；未知归属的历史/导入作品仅教师演示可移动。拖拽通过应用服务和存储事务重复验证归属，以expectedPosition拒绝过期移动，只更新UniverseEntry锚点，不增加PlanetRevision或修改原图。云端仍按上方Enrollments与服务器授权建模，详见12。

图片编辑增量：crop 作为图片图层 source 的可选参数存入场景文档，声明 image-crop@1，不增加 Assets 派生原文件或 SQL 列。外观/内部复位从既有 revisions 最早快照恢复当前侧场景，原素材与成长记录保留，支持编辑撤销；不再升级 IndexedDB。协议与实际恢复边界见 [16-image-editing-and-scene-recovery.md](16-image-editing-and-scene-recovery.md)。

主要索引：Enrollments(user_id,status)、Assignments(class_id,due_at)、Submissions(assignment_id,state)、SubmissionVersions(submission_id,version_no DESC)、Planets(owner_enrollment_id)、UniverseEntries(universe_id,visible)、GrowthEvents(planet_id,created_at)、GrowthJobs(state,next_run_at)。名称索引按规模逐步加，300 颗无需搜索集群。

移除宇宙 entry 不删除作品本体；删除星球先软删除，提供恢复窗口（暂定 30 天）。原图清理必须确认草稿、所有保留 revision、提交版本、发布快照、成长历史和导出任务均无引用，再经宽限期回收，不能仅检查当前场景。未完成上传可 24 小时后清理。保留期限与学校政策在 P2 确认，不以技术默认替代业务决定。

DB 与对象存储需一致恢复：备份快照记录对象清单/hash；恢复时先校验对象可用，再恢复发布指针。不能把仅包含 SQL 的备份称为完整作品备份。


## 2026-10-10 实现映射

P2首增量迁移与事务边界见[22](22-course-submission-first-slice.md)。本机已实现账户/班级/成员、作业、私人草稿、不可变提交与附件、追加评阅、幂等回执及自动档案记录；课程planets当前只提供归属关联，完整PlanetRevision/共享宇宙/发布快照仍待实现。P1协议、IndexedDB和ZIP不携带课程成绩/会话或授予服务器归属。
