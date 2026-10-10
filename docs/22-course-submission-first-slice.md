# 22 · 作业提交系统第一增量

日期：2026-10-10。按用户要求提前启动P2，沿用02/03/05/06的领域边界和PostgreSQL关系模型。当前完成的是**本机课程后端与师生页面闭环**，不是正式在线课堂。GitHub Pages继续提供静态创作演示。

## 已实现的课堂路径

教师布置作业（教学模块、要求、班级时区截止时间、可选补交期限、满分）→学生上传最终作品及过程图、保存私人草稿→提交不可变版本→教师查看、评分或退回→学生查看反馈、修改重交→保留所有提交和评阅历史。

- 学生草稿与提交版本分离；上传/保存草稿不代表交给老师。
- 最多3张PNG/JPEG/WebP，每张20MiB；最长边8192、4000万像素。至少一张最终作品才能提交。音频/文档附件留待后续。
- 同一作业每个学生仅有一条Submission；重交增加版本号，原描述、关键词、图片顺序/用途和hash不可改写。
- 评分后默认需要教师退回才能重交；Assignment的allowResubmission策略由后端执行。
- 提交版本与ArchiveEntry在同一事务落库。不自动发布到宇宙、不触发模拟成长、不调用AI。
- 顶部和编辑器“提交课程作业”打开独立课堂；“模拟提交作业”仍是明确标注的本地成长演示。
- 切换作业、班级、退出课堂和主导航前检查未保存草稿；刷新/关闭浏览器使用beforeunload提示。已保存草稿和会话可重新读取；无离线作业提交队列。

## 模块和存储边界

| 层 | 实现 |
| --- | --- |
| contracts | AssignmentInput、SubmissionDraft、ReviewInput的严格Zod契约，以及课堂DTO |
| domain | 班级成员权限、revision冲突、截止/迟交、IANA时区转换；不存在/歧义的夏令时拒绝 |
| application | SubmissionService + CourseUnitOfWork/CourseTransaction端口；事务内归属、快照、幂等与评阅历史 |
| apps/api | TypeScript HTTP接口、PostgreSQL Repository、迁移、会话、私有图片适配器 |
| apps/web/features/course | 学生草稿/版本/反馈、教师布置/提交列表/批改/退回；不把服务器角色写进P1编辑器 |

`apps/api/migrations/001-course.sql`创建users、courses、classes、enrollments、assignments、submissions、assets、submission_versions、submission_version_assets、planets、archive_entries、reviews、idempotency_records、sessions。跨班关联用组合外键约束；一学生一作业、版本序号、评阅后继均有唯一约束。版本、版本附件、评阅及原始素材元数据有不可变触发器。

planets目前仅保存课程归属，用于档案关联；不是完整PlanetRevision或共享宇宙实现。P1本地SceneDocument、IndexedDB、ownership与ZIP协议保持原有版本。课堂资产、成绩、会话和评语不进入本地作品ZIP；服务端认领/导入和档案热点展示尚未接入。

迁移事务记录SQL的SHA-256并拒绝改写已应用迁移；后续迁移应增加编号文件并扩展迁移运行器，不能直接修改001。课程数据库与私有文件夹是一个联合备份单元，当前尚未完成备份恢复操作界面及正式演练。

开发默认使用PGlite在磁盘运行嵌入式PostgreSQL，无需额外安装数据库；配置DATABASE_URL则使用node-postgres连接独立PostgreSQL。两者执行同一迁移和Repository SQL。PGlite仅作本机开发便利，单连接不能替代正式多连接并发验证。CI另设PostgreSQL18服务运行同一20项课程测试。

## 事务和权限

服务端从会话用户查询active班级成员；学生只改自己的作业，同班teacher才可查看已提交版本和评阅。老师看不到私人草稿；其他学生、其他班老师、匿名/伪造角色不能越权。公开静态演示的本地角色选择不授予课堂权限。

提交锁定Submission、作业和相关成员/素材，检查expectedRevision、发布状态、归属及ready状态；同一事务固定新版本、附件、档案、当前版本指针和幂等回执。异常整体回滚。Idempotency-Key按用户/操作隔离；同key同请求重放原回执，同key不同revision冲突。教师评阅锁定Submission、指定版本，追加记录并用supersedesId链接更正；评阅历史版本不覆盖当前版本状态。

服务器UTC时间判断截止/补交，版本保存dueAtSnapshot和isLate；前端按班级IANA时区显示。HTTP409提供重新载入入口，未自动合并多端草稿。提交网络失败在当前页面保留幂等键供重试；关闭页面后的幂等恢复界面尚待补齐。

本机测试登录只接受固定合成账户；随机会话token仅在HttpOnly/SameSite=Lax cookie，数据库存hash，8小时有效，退出使会话失效。写入必须来自允许Origin且携带会话CSRF token。账户角色不取自请求体、署名或客户端header。正式OIDC、Secure cookie/HTTPS、限流和审计属于上线前下一增量；当前start入口拒绝NODE_ENV=production，且仅绑定127.0.0.1。

图片必须通过文件头、hash、实际解码、尺寸/像素上限后才标ready；原始字节私有保存，展示WebP另生成并去元数据。媒体接口逐次鉴权，返回no-store，不返回磁盘路径或永久公开URL。开发使用私有磁盘目录，正式S3签名上传/访问、扫描及孤立文件清理仍待实现。

## 第一增量HTTP

统一前缀`/api/v1`；以下身份来自会话。

| 方法/路径 | 用途 |
| --- | --- |
| GET /me；POST /logout | 会话读取/注销 |
| GET /classes | 仅当前用户的有效班级 |
| GET/POST /classes/:classId/assignments | 作业列表/教师发布 |
| POST /assignments/:assignmentId/submissions | 学生打开唯一作业草稿 |
| GET /assignments/:assignmentId/submissions | 本班教师查看已提交列表 |
| GET /submissions/:submissionId | 自己的完整草稿/历史；教师只获提交历史 |
| PUT /submissions/:submissionId/draft | expectedRevision + 私人草稿 |
| POST /submissions/:submissionId/submit | expectedRevision + Idempotency-Key |
| POST /submissions/:submissionId/versions/:versionId/reviews | 教师评分/退回，expectedRevision |
| POST /assets | 本机二进制图片上传，X-Content-Sha256 |
| GET /assets/:assetId/display | 经权限校验的私有展示图 |

嵌套reviews路径具体化05的“评阅明确版本”，不是改变模型。当前assets二进制接口是开发适配器；正式对象存储上传意向/完成校验按05后续接入。`/health`返回开发状态；`/dev/accounts`和`/dev/login`只供合成测试登录，不是上线账号功能。

## 本机体验

```sh
pnpm install --frozen-lockfile
pnpm dev:api
```

另开终端`pnpm dev`，访问`http://127.0.0.1:5173/`→课程作业。依次用“测试教师 · 色彩老师”和“测试学生 · 林同学”测试，退出课堂可切换；要同时对照，使用独立浏览器配置/隐私窗口，两个普通同源标签共享会话。其他学生/其他班老师是权限测试账户，不代表已注册真实学生。

默认持久数据在`work/course-server/postgres`和`work/course-server/private-media`，不进入Git。DATABASE_URL可连接自行管理的PostgreSQL；COURSE_DATA_DIR改变数据根，COURSE_API_PORT默认3001，COURSE_WEB_ORIGINS列出允许的前端Origin。开发前端默认代理/api/v1；COURSE_PROXY_TARGET可改变代理目标。

生产构建默认不连接课程API，Pages显示“在线课堂即将开放”；不会用测试账户假装在线提交。仅本机预览可在构建时设置`VITE_COURSE_API_URL=/api/v1`，再`pnpm build`、`pnpm preview`（5174）；保持本机API运行。不要把此开发配置当作正式发布配置。

## 验证记录

- 全量82项模块测试通过，其中本增量20项：契约/时区4、真实SQL事务/权限9、HTTP/私有图片/会话/磁盘重启7。
- 课程浏览器12项通过：教师发布、草稿离开保护、教师不可见草稿、刷新恢复、首版提交、私密修改不覆盖、退回、重交/旧版留存、评分策略、更正留史、390px布局、注销。
- 回归学生入口6项、38%聚焦6项、核心闭环14项；部署完成后的远端结果追加到21。
- 浏览器使用独立合成课堂数据根`work/course-browser-isolated`、API3002、前端5176，未改用户日常草稿。报告写入outputs。另修复StudioResizeObserver在卸载后读取空ref的偶发错误。
- TypeScript、ESLint、生产构建通过；既有第三方Zod注释和包体积提示仍存在，机房性能门槛未替代。

## 后续顺序

1. 正式身份提供者与班级邀请/成员维护，独立PostgreSQL、私有对象存储和HTTPS后端部署；联合备份恢复演练后灰度开放一个班级。
2. 作业编辑/关闭、迟交策略UI、教师筛选/批量处理、学生跨页面提交重试恢复、操作审计与文件清理。
3. 本地作品主动认领/迁移，档案热点和课程星球关联；公开展览只使用经过筛选的快照。
4. 保留P0真实素材/设备、P1b性能/LOD，以及14运动选择的未完成门槛。AI仍须可靠提交/隐私边界完成后单独推进。

实现参考：[node-postgres事务](https://node-postgres.com/features/transactions)、[PostgreSQL显式锁](https://www.postgresql.org/docs/current/explicit-locking.html)、[PGlite开发文档](https://pglite.dev/docs/)。核对2026-10-10。
