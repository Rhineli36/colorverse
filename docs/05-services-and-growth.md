# 05 · 应用接口与 AI 生长协议

## 1. Repository / Service 边界

以下是接口草案，不是可运行 SDK。异步接口同时适用于本地和 HTTP 适配器；返回值使用领域 DTO，不暴露数据库行、临时 URL、SDK 对象或渲染对象。

```ts
interface PlanetRepository {
  get(id: string): Promise<PlanetDocument>;
  list(query: PlanetQuery): Promise<Page<PlanetSummary>>;
  save(doc: PlanetDocument, expectedRevision: number): Promise<SavedRevision>;
}
interface AssetStore {
  putOriginal(file: Blob, metadata: AssetMetadata): Promise<AssetRecord>;
  read(assetId: string, variant: 'original' | 'display' | 'thumbnail'): Promise<Blob>;
  resolve(assetId: string, variant: string): Promise<DisposableResource>;
}
interface PackageService {
  inspect(file: Blob): Promise<ImportReport>;
  import(reportId: string, mode: 'copy' | 'update'): Promise<ImportResult>;
  exportPlanet(id: string, mode: 'backup' | 'exhibition'): Promise<ExportResult>;
  exportUniverse(id: string): Promise<ExportResult>;
}
interface GrowthService {
  propose(input: GrowthTrigger, key: string): Promise<GrowthProposal>;
  preview(eventId: string, draft: GrowthProposal): Promise<SceneOverlay>;
  accept(eventId: string, expectedPlanetRevision: number, key: string): Promise<AppliedGrowth>;
  reject(eventId: string, key: string): Promise<void>;
  revert(eventId: string, expectedPlanetRevision: number, key: string): Promise<RevertResult>;
}
```

补充 ports：ArchiveRepository、UniverseRepository、SubmissionRepository、PublicationRepository、GrowthEventRepository、ModelProvider、Clock、IdGenerator、UnitOfWork。只在用例真正需要时引入，不为所有表生成通用 CRUD。UnitOfWork 包含具体多实体用例（commitImport、submitWork、acceptGrowth），HTTP 客户端调用对应服务器原子端点，不尝试跨 HTTP 请求复刻本地事务。

Service 负责参数校验、状态机、权限上下文和原子用例；Repository 负责加载/保存、条件写入；AssetResolver 负责加载与释放。云端授权必须在服务器重做，P1 模拟 ActorContext 不能原样作为云端安全策略。

统一错误：VALIDATION_FAILED、UNSUPPORTED_VERSION、MISSING_ASSET、HASH_MISMATCH、QUOTA_EXCEEDED、REVISION_CONFLICT、FORBIDDEN、NOT_FOUND、BUDGET_EXCEEDED、RETRYABLE_FAILURE。错误包含 requestId、可定位字段、可重试标志和对学生可理解的文案，不泄露 SQL、供应商密钥或私人对象路径。

## 2. P2 HTTP API 草案

前缀 `/api/v1`，分页使用 cursor/limit（默认 20、上限 100），UTC ISO 8601 时间；成功 DTO 与错误结构版本化。写入使用 session 鉴权、资源授权与适用的 CSRF 保护。携带 If-Match/revision 的写入冲突返回 409；请求格式错误 400/422，未登录 401，无权 403 或按隐藏存在性策略 404。

| 接口 | 用途与必要约束 |
| --- | --- |
| GET /me；GET /classes | 会话身份和本人可访问班级，角色由服务器返回 |
| POST /courses；POST /courses/:id/classes；POST /classes/:id/enrollments | 教师建立课程/班级；成员变更需班级管理权限 |
| GET/POST /classes/:id/assignments；PATCH /assignments/:id | 布置作业、截止政策；教师授权、revision 控制 |
| GET /assignments/:id/submissions；PUT /submissions/:id/draft | 教师读全班提交；学生只编辑自己的草稿 |
| POST /submissions/:id/submit | body{expectedRevision} + Idempotency-Key；返回不可变版本和 archiveEntryId |
| POST /submission-versions/:id/reviews | 分数/评语/退回决定；教师身份与班级匹配 |
| POST /assets/upload-intents；POST /assets/:id/complete | 限额和 MIME、hash 申报→私有直传→服务端核验→ready；pending 不可用于提交 |
| GET /assets/:id/access?variant=display | 授权后短时地址，不返回永久存储密钥 |
| GET/PUT /planets/:id；GET /planets/:id/archive | 文档读取与条件保存，作品档案按权限返回 |
| POST /planets/:id/publications；DELETE /publications/:id | 生成安全快照或撤回；不直接改变私人原文 |
| GET /public/universes/:id；GET /public/planets/:publicationId | 仅安全 DTO，可缓存；不可遍历内网 API 或私人 ID |
| POST /classes/:id/exports；GET /exports/:id | 按快照批量归档、后台任务、下载过期时间、教师授权 |
| POST /growth-jobs；GET /growth-events/:id | P3 提交任务与查看建议；202 返回 jobId，轮询退避 |
| POST /growth-events/:id/accept 或 /reject 或 /revert | 有效身份、expectedRevision、Idempotency-Key |

上传意图绑定用户、对象 key、大小和过期时间；complete 不能只相信客户端上传成功。对象存储复制/缩略图生成是异步阶段，只有校验通过后资产标为 ready。导出任务先冻结数据版本，再流式读取素材，不阻塞 Web 请求。

## 3. AI 可行性与供应商边界

模型只输出提案，不直接编辑星球。多模态 API 可用于颜色和视觉描述，再转成预设参数；结构化能力依模型与输入方式而异。例如检索到的百炼文档说明多模态输入在部分接口会退回 JSON object，不能将“支持 JSON”视为 Schema 保证。无论供应商是否提供约束输出，都在本地/服务端做独立严格校验。[官方结构化输出说明](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen-structured-output)

ModelProvider：`analyze({images, statement, colorTags, sceneSummary, allowedPresets, schema, requestId}, signal) → {proposal, usage, providerRequestId}`。配置 endpoint/model/timeout/预算，密钥仅由服务器密钥管理读取。提供 MockProvider 与未来供应商 adapter，业务服务不感知特定 SDK 的消息格式。验证多模态、JSON 能力、图像大小、地区可用性后才选择正式型号。

只发送经授权的展示图与必要说明，不发送整班名单、分数、评语或原始元数据。图片/学生文字是被分析的数据，不能成为运行指令。模型不得返回 URL、代码、shader、SQL、系统提示或任意资产；只允许服务端登记的 presetId/version 和有限参数。情绪字段描述作品表达，不能输出对学生心理状态的诊断；不参与自动打分。

## 4. GrowthProposal 与 GrowthEvent

Proposal 是模型返回内容：schemaVersion、summary、elements。单次最多 3 个元素，允许 glow-flower 或 crystal；后续花、树、雾、河流、光束、岛屿等通过新增预设及能力版本扩展。字段错误、未知 preset 或超范围输出整体拒绝，不把无限密度简单截断后继续执行。必要的“修复调用”也占重试预算。

Event 是应用生成的可信外壳：eventId、planetId、trigger、baseRevision、status、elements（应用分配稳定 layerId）、createdAt、acceptedAt、appliedRevision、revertedAt、revertedRevision、provider、policyVersion。模型不能指定 eventId、owner、状态、revision 或幂等键。

本轮草案 [growth-event.schema.json](schemas/growth-event.schema.json) 描述单次元素的归一化坐标、颜色、缩放与光效上限。元素的 x/y 为场景宽高的 0..1 比例；应用时转换到 SceneDocument 的设计像素。scale 是预设定义的基础尺寸倍数；外观/内部 sceneKind 必须一致。学生可在预览中修改参数，确认后的事件记录保存最终参数及来源 proposal 的摘要/hash（原始提案可留审计记录）。

Schema 只验证形状和状态必填关系；引用存在、唯一图层 ID、触发唯一性、所属班级、预设版本可用、目标 revision 与预算必须由 Service 再验证。Zod 可导出 JSON Schema，但自定义转换与跨字段约束需显式保留运行时检查，不能以“导出成功”替代验证。[Zod JSON Schema](https://zod.dev/json-schema?id=target)

## 5. 状态、幂等、事务和撤销

```text
任务：queued → running → succeeded
                   ├→ retry_wait → running
                   └→ failed / cancelled
提案：proposed → accepted → reverted
           └→ rejected
```

建议没有生成成功之前只存在 job，不伪造 proposed 事件。启用教师审核时，单独存 reviewState(not_required/pending/approved/rejected)；接受要求 approved 或 not_required。学生改动已审核提案后恢复 pending。

- 默认唯一触发键由应用生成 `planetId + submissionVersionId` 的稳定摘要；模拟触发用 `planetId + mockSubmissionId`。同一次作业版本反复点击得到同一事件，不因 provider/promptVersion 改动再生长。
- 暂定每份作业最多接受 2 次不同提交版本的成长、每颗星球每学期 24 次，教师可调；防止通过不断生成新提交版本绕开版本去重。
- 任务尝试最多 3 次（首次+2次重试），指数退避加随机抖动；429 按 Retry-After，明确认证/额度错误不重试。超时结果未知时记录状态并按 providerRequestId 尝试核对，不能保证供应商不重复计费；本地应用去重仍保证只长一次。
- Worker 用租约与条件状态更新领取任务。全局/班级/学生每日次数和月费用有硬上限，调用前预留最坏预算，结束后按 usage 结算，租约失败释放或进入核对状态。
- 接受事务锁定 event 与 planet，检查状态/expectedRevision/预算，生成稳定 layerId，把新图层写入新 PlanetRevision，写 actions，再更新 event accepted。全部成功或全部回滚。
- 相同 accept 请求重放返回首次结果。并发 accept 唯一约束/条件更新只允许一次成功；不同幂等键也不能重复接受同一个 event。
- proposed 期间星球被改动：返回 409，基于新 revision 重做预览、检查碰撞和图层额度，再接受；不能无提示把建议套到旧坐标。
- 撤销已接受成长是一次补偿事务，只隐藏/移除该事件添加的图层并记录 tombstone/action，保留 event 和历史 revision，增加当前 revision。不得恢复整个旧星球覆盖其他手工修改。
- 已被手动改动的成长图层，撤销前提示哪些图层受影响；外部热点/其他元素引用这些图层时先解除绑定或阻止并说明。已撤销事件重复 revert 幂等，无自动重接受；重新创作走新命令或显式复制。
- 普通编辑器 undo/redo 只适用于未提交的本地编辑命令；涉及已确认成长时调用 revert 语义，不能仅撤掉画面而留下 accepted 数据。

## 6. 第一阶段无付费演示的验收脚本（待实现）

1. 创建固定 mockSubmissionId 并绑定一个现存示例 archiveEntryId，点击“模拟提交作业”。MockProvider 以该 ID 生成确定性花朵或晶体参数；mock trigger 同时保存 archiveEntryId，供成长元素打开示例档案。真实 trigger 则由 submissionVersionId 查找归属星球的档案条目。
2. 严格验证提案→显示 preview overlay；此时刷新不能把预览当成已接受图层。
3. 学生调整颜色/位置后接受→在同一本地事务保存 event、action、独立 layer 和 revision。
4. 关闭并重新打开页面，读取持久文档，元素及来源档案仍在；不重新调用模型或反复把事件叠加到文档。
5. 连续双击/重复触发只得到一个 event、一组 layer；拒绝不添加图层。
6. 点击成长元素打开触发的示例档案；撤销只移除对应元素；ZIP 导出到另一浏览器后仍能查看成长历史。

本轮仅交付协议与示例，不把这份脚本描述为已经运行的演示。
