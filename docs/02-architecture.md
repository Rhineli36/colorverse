# 02 · 系统架构与目录

## 1. 推荐：本地优先、模块化单体

第一阶段一个静态 Web 应用，领域模块逻辑分离；第二阶段增加一个后端部署单元；第三阶段增加一个任务进程。避免微服务、复杂消息集群、跨设备实时协同和完整三维引擎的维护负担。

```text
React UI：Universe / Studio / PlanetRoom / TeacherDemo
                 ↓ 命令 / 查询
应用服务：Planet / Package / Publication / Coursework / Growth
                 ↓
领域与契约：PlanetDocument / AssetRef / Submission / GrowthEvent
          ↙                           ↘
统一 SceneRenderer                 Repository / AssetStore / UnitOfWork
          ↓                           ↓
PixiJS 适配器              P1 IndexedDB + Blob / MockGrowthProvider
                          P2 HTTP → API → PostgreSQL + ObjectStore
                          P3 API → 任务表/Worker → ModelProvider
```

依赖方向向内：领域和契约不导入 React、PixiJS、IndexedDB、SQL 或模型 SDK；渲染器不直接调用 API；UI 不直接读写数据库。资源解析器将 assetId 解析成当前环境的字节/临时 URL，而不是把供应商 URL 存入场景。

## 2. 选型与取舍

| 层 | 推荐 | 原因与边界 |
| --- | --- | --- |
| UI/构建 | React + TypeScript + Vite | 编辑控件和静态部署；无需为了 P1 引入服务端渲染框架 |
| 视觉 | PixiJS 8 系列 WebGL 渲染器，版本开工锁定 | 多图层、滤镜与粒子统一；不让 React 驱动逐帧更新 |
| 编辑会话 | Zustand + 命令历史 | store 保存选择/工具/临时值，领域文档以命令更新 |
| 本地存储 | IndexedDB，优先轻量 idb 封装 | 文档、素材 Blob、事件在可控事务内提交；localStorage 仅少量偏好 |
| 协议 | Zod 运行时验证；发布 JSON Schema | 未来 TS 契约单一来源；本轮 JSON Schema 是设计草案 |
| 作品包 | JSZip + Worker，导入层另做路径/额度检查 | 小包方便；超大班级备份不在浏览器整包构造 |
| 测试 | Vitest + Playwright | 领域规则、包恢复、浏览器流程和截图 |
| P2 服务 | TypeScript + Fastify + PostgreSQL | 模块化单体；SQL 迁移纳入版本管理，ORM 在 P2 决定 |
| P2 媒体 | ObjectStore 接口 + 私有桶 | 可适配校内 S3 兼容服务、COS/OSS 等，验证各厂商差异 |
| P3 任务 | PostgreSQL 持久任务表 + 独立 Worker | 当前量级无需 Redis/Kafka；后续按实测积压再升级 |

官方文档当前建议 WebGL 用于生产，不能假定 PixiJS 8 自带可用的 Canvas 2D 回退。WebGL 不可用时提供静态图片列表和文本档案阅读，编辑给出设备提示；若必须在禁用 GPU 的机房编辑，再评估受限 Canvas 适配器。[PixiJS Renderers](https://pixijs.com/8.x/guides/components/renderers)

Three.js / React Three Fiber 不进入基线依赖。可选预设球体先用 2D 圆形遮罩、明暗纹理和纹理偏移；若课程明确要求真实球面旋转，再加独立 render-kind 适配器，通用文档保持稳定。通用美术效果不依赖某个渲染库对象的序列化。

## 3. 统一视觉模块

统一接口：`mount(canvas, resolver, quality)`、`load(sceneDocument)`、`update(patch)`、`hitTest(point)`、`setCamera(camera)`、`captureThumbnail()`、`dispose()`。所有参数是普通可序列化数据。渲染输出遵循 04 协议的调色顺序和坐标定义。

- Universe 渲染星球外观的缩略表示；选中后加载外观详情。
- Studio 复用同一渲染器和相同参数，仅叠加选框、控制柄、参考线。
- PlanetRoom 渲染内部场景，热点的文字/图片弹窗由 DOM UI 承载。
- GrowthPreview 把未确认元素加到临时覆盖层；接受后保存成常规独立图层。
- 过场切换只加载目标星球，完成后释放上一场景纹理。返回恢复 camera/filter/selection 会话状态。

第一阶段以效果开关和 LOD 调整质量，不维护两套艺术参数。低质量档减少粒子、关闭重模糊和视差，保留主体图与可操作热点。动画使用 delta time；随机效果保存 seed，预览与重新加载保持风格一致。

2026-10-09 实施补充：总览增加确定性的独立椭圆轨迹、全景/局部/聚焦镜头。轨迹由 layout.seed 与 planetId 派生，entries.position 仍是持久锚点；镜头与暂停属于 UI 会话。镜头更新不触发场景重载。取景、轨迹和新增布局计算放在 domain，PixiJS 只负责表现，详见 [11-universe-motion-and-camera.md](11-universe-motion-and-camera.md)。

## 4. 文档状态与持久化

领域文档、UI 会话、媒体缓存、派生缩略图分开。用户一次连续拖动只形成一个命令；撤销历史只保存变换/引用差异，不能复制大图 Blob。重置是可撤销命令。每次确认编辑立即标记 dirty，500–1000 ms 防抖保存；页面关闭事件只能补救，不能作为主要保存机制。

`revision` 是同一文档的乐观锁版本，`schemaVersion` 是协议格式版本，二者不可混用。保存时比较 expectedRevision；多标签页冲突提示保留副本，不能最后写入覆盖。P2 离线编辑先保存本地 revision，在线显式推送；初版冲突使用选择版本/另存副本，暂不实现自动字段合并或 CRDT。

配额通过 Storage API 估计并捕捉 QuotaExceededError；可请求持久存储，但成功与否受浏览器影响。导出 ZIP 是必要的用户备份路径。[MDN Storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

## 5. 宇宙规模与导航

100–300 颗使用外观缩略图、视口剔除、空间分区、纹理 LRU、聚合点/颜色簇；近景才显示名字和高分辨率图片。搜索在 PlanetSummary 上执行，不加载内部场景。名称采用规范化包含匹配，情绪标签为受控标签+用户自定义，颜色先按色相区间/灰阶类别过滤，后续再加感知色差搜索。

宇宙位置由稳定 seed + 布局版本生成，教师可覆盖位置；保存的是 UniverseEntry 的位置，不改星球作品自身的坐标。没有结果时提供清空筛选。DOM 同步提供列表、键盘选择和返回按钮，支持减少动态效果偏好。

滤镜只在必要对象上启用；静态复杂组合可缓存，但须计入显存预算，编辑时使缓存失效。[PixiJS cacheAsTexture](https://pixijs.com/8.x/guides/components/scene-objects/container/cache-as-texture)

## 6. 未来项目结构（本轮不创建这些代码目录）

```text
apps/
  web/src/
    app/                 # 路由、装配、错误边界
    features/
      universe/ studio/ planet-room/ teacher-demo/
      coursework/        # P2 才创建
    adapters/local/      # IndexedDB、浏览器素材与事务
    adapters/http/       # P2 才创建
  api/src/               # P2：auth、classes、submissions、publication
  worker/src/            # P3：任务消费、预算、模型调用
packages/
  contracts/             # 可序列化类型、Zod、生成 Schema、迁移
  domain/                # 不变量、命令、状态机、服务端无关规则
  application/           # 用例和 ports；禁止绑定存储实现
  renderer/              # 场景编译、Pixi 适配器、效果注册表
  package-io/            # JSON/ZIP 检查、映射、恢复
  fixtures/              # 授权清晰的演示数据、异常测试包
tests/                   # 浏览器、迁移兼容、契约与恢复测试
docs/                    # 当前设计文档
infra/                   # P2 起部署模板与恢复脚本
```

P0 可使用 npm workspaces，只创建实际用到的包；不要提前添加空后端和无用基础设施。图片包在资源目录或对象存储，不嵌入组件源码。

## 7. 云端演进

P1→P2：增加身份映射、HTTP repository、上传服务、服务端授权与审计；迁移用户选定的本地作品，校验 hash，建立 localId→serverId 映射。上传者必须主动选择归属班级，服务器从会话确定 owner，不信包里的 userId。原创引用和渲染协议不变。

P2→P3：增加任务表、模型适配器和教师审核策略，用事务写 growth event + 新图层 + planet revision。数据库负责跨请求一致性；不能只凭前端按钮禁用防重。

这两次升级新增系统能力，仍需要工程工作和迁移测试，但不应重写编辑器或视觉模块。应尽早做“同一契约在内存、IndexedDB、HTTP mock 上运行”的契约测试，避免接口抽象成为空壳。
