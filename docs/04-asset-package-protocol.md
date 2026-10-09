# 04 · 场景、素材与作品包协议

本协议是 v1 设计草案。P0 实现时在 contracts 定义 Zod Schema，由其生成 JSON Schema；本轮不宣称完整 PlanetDocument 校验器已经可运行。成长事件的机器可读草案另见 schemas/。

## 1. 版本、身份与文档结构

`schemaVersion: "1.0.0"` 标识文档；`packageVersion: "1.0.0"` 标识包格式；`revision: 7` 标识编辑提交次序；`presetVersion` 标识预设行为。四者独立。ID 使用 UUID，不能由显示名称或文件路径推导。

PlanetDocument 必须包含以下字段，除明确可空或可选者外不省略：

| 字段 | 类型与规则 |
| --- | --- |
| schemaVersion / planetId / revision | semver / UUID / 非负整数 |
| metadata | name(1–80字)、authorDisplayName(1–80)、theme(≤200)、emotionTags(≤12个、每个≤24)、palette{primary,secondary,accent}、description(≤4000)、monologue(≤4000)；颜色 #RRGGBB |
| exterior | mode: artwork/presetSphere；scene: SceneDocument；artwork 模式必须有主体 image 图层 |
| interior | SceneDocument |
| assetRefs | AssetRecord[]，每个被引用 assetId 恰好有一条记录；可包含音频保留资源 |
| archiveEntries | 示例档案或已脱敏的可移植作品卡；在线私人提交引用放受限命名空间，不随公开导出 |
| growthEvents | 成长记录，引用图层必须存在或有明确撤销标记；在线来源在公共包中脱敏 |
| requiredCapabilities / optionalCapabilities | 带版本的字符串列表，如 image-layer@1、audio-reference@1；不支持必需能力则拒绝编辑 |
| extensions | 可选，按命名空间保存 JSON 数据，≤64 KiB；不可包含代码或改变权限 |

单星球 JSON（不含二进制）上限暂定 5 MiB，文档深度≤32、所有文本按长度和编码检查。未知顶层字段报错，未来扩展放 extensions。可选能力可保留并提示“不支持预览”，绝不能保存时默默删除。

## 2. 统一场景协议

SceneDocument：id、width、height、background、layers、hotspots。设计画布默认 1600×900；坐标单位为设计像素、原点左上、x 向右、y 向下，角度以度为单位顺时针。视口按 contain 等比缩放并留边，屏幕点击先经镜头逆变换到设计坐标。外观与内部各有独立画布。

Layer：id、kind(image/preset/effect)、depth(background/middle/foreground)、order、transform、opacity、visible、adjustments、animation、source。transform 包含 x/y、scaleX/Y（0.01–10）、rotationDeg（−180..180）、anchorX/Y（0..1）；统一以 anchor 为定位点。opacity 0..1。排序先 depth，后 order，同值以 id 稳定排序；最多 50 个用户图层和 30 个热点（P0 校准）。

source 采用判别联合：image 使用 assetId，可选 crop{x,y,width,height} 保存原图归一化取景（缺省为完整图片，声明 image-crop@1；x/y 0–0.99，width/height 0.01–1，x+width/y+height≤1）；preset 使用 presetId+presetVersion+params；effect 使用 effectId+effectVersion+params，可选 anchorLayerId 引用同场景图片主体。存在引用时 transform 是主体局部坐标；外观首张主体图片的装饰按固定星球框架解释，其他图片仍按图片变换解释，取景/透明度规则见[18](18-fixed-planet-frame-and-image-fit.md)；要求 decorations@1 能力，禁止循环或引用其他效果。完整装饰与卫星参数见 [13-optional-planet-decorations.md](13-optional-planet-decorations.md)，裁剪与外观蒙版见 [16-image-editing-and-scene-recovery.md](16-image-editing-and-scene-recovery.md)。不保存 Pixi Texture、Shader、DOM 节点或临时 blob URL。图层 id 稳定，动画和成长只引用 id。

background 是 color、linearGradient 或 image 的判别联合；linearGradient 含 angleDeg 和有序 stops[{offset:0..1,color}]；image 含 assetId、fit(contain/cover)、color 底色。粒子/柔光做独立 effect 图层，背景和正文不会被合并烘焙。

### 调色及动画

adjustments 默认 hueDeg=0、saturation=1、brightness=1、contrast=1、temperature=0；分别限定 −180..180、0..2、0..2、0..2、−1..1。透明度统一为 layer.opacity，避免 UI 两套透明度冲突。滤镜顺序固定：色相→饱和度→亮度→对比度→冷暖→图层透明度；在 sRGB 展示空间执行，RGBA 透明边缘处理须做视觉回归。所有参数有限值，拒绝 NaN/Infinity。

animation 为 none、float{amplitudePx≤30,periodSec:1..60}、rotate{degreesPerSec:−30..30}、breathe{minOpacity,maxOpacity,periodSec}；可组合受限动画列表，遵守减少动态效果设置。parallaxFactor 在 −0.1..0.1，只有用户开启才使用；不改变持久 x/y。

### 热点与档案

Hotspot：id、sceneId、anchorLayerId 可空、geometry、accessibleLabel、action。第一版运行时将形状判别放在 geometry.type(rect/circle)，不重复存 shape；绑定图层时 geometry 用该图层局部坐标，随图层变换；否则使用场景坐标。action 仅允许 showText{text}、showImage{assetId,caption}、openArchive{archiveEntryId}；预留 playAudio{assetId} 为可选能力，禁止任意 URL/JS 动作。

示例 ArchiveEntry：id、sourceType=sample、title、createdOn(YYYY-MM-DD)、courseModule、imageAssetIds、description、colorTags。P2 真实条目绑定 submissionVersionId，弹窗只能拿经授权的 ArchiveDTO；公开导出转换成冻结的 portable 作品卡，保留非敏感来源描述。

## 3. 素材协议

AssetRecord：assetId、original{path,sha256,byteSize,mimeType,width/height或durationMs}、variants[]、rights{creator,license,source,consentToPublish}。本地导入 creator 是署名，不是可信所有权。许可证值可为 student-original/CC0/明确第三方许可；未知素材不可默认认定可公开。variants 每项有 kind、path、hash、尺寸、字节、recipeVersion。

- 原图允许静态 PNG/JPEG/WebP，透明背景保留。拒绝 HTML/SVG/脚本和伪装扩展名；动态 WebP/PNG 先提示不支持，不能静默丢帧。
- 音频保留格式先限定 MP3/WAV/OGG，单文件≤20 MiB、时长≤5 分钟；无法解析的音频拒绝，不承诺跨浏览器相同解码效果。
- 单原图≤20 MiB、≤40 百万像素、最长边≤8192；检查头和像素数后再解码，避免小文件超大解码占用。
- 原始字节计算 SHA-256 并不可变保存。编辑只写参数；重编码只生成新派生图，不替换原图。SHA 是完整性证据，不是作者签名。
- thumbnail：最长边 256/512，WebP/PNG；display：最长边 2048，按透明度/细节选择格式；必要时近景 4096，但受预算控制。变体转换失败时可重试，不删除原图。
- 公开派生图去除敏感元数据；私密原始素材保留原始 EXIF/ICC，以便完整还原。
- 相同 hash 的字节可复用，assetId 仍是逻辑身份。不同授权主体不会仅因 hash 相同共享访问权限。

## 4. 单星球 ZIP

```text
manifest.json
planet.json
assets/<assetId>/original.png
assets/<assetId>/display.webp
assets/<assetId>/thumbnail.webp
assets/<audioAssetId>/original.mp3
```

manifest 包含 packageType="planet"、packageVersion、exportMode(backup/exhibition)、documentType(planet/publication)、exportId(UUID)、exportedAt、entrypoint="planet.json"、producer{name,version}、files[{path,sha256,byteSize,mimeType}]、requiredCapabilities。files 必须列出除 manifest 自身以外所有文件；manifest 不自校验，整个包不声称具备数字签名。文件和 JSON 均 UTF-8，路径使用 `/`、区分大小写且规范化后唯一。

P1 图片编辑实施补充：manifest.requiredCapabilities 汇总包内星球的实际必需能力，包含 image-crop@1、decorations@1 等；不能固定写入基础能力而遗漏新参数。裁剪保留原图，导入以文档与能力共同校验。

所有 path 是包根的相对路径，资源引用只用 assetId。禁止绝对路径、盘符、反斜杠、NUL、`.`/`..` 段、符号链接、URL、重复 entry、大小写折叠碰撞；禁止把路径进行二次 URL 解码。不同平台文件名统一为受限 ASCII ID 路径，用户原始中文文件名只在元数据里保存。

backup 模式收齐原图、音频、已选保留历史的引用闭包，恢复到另一台电脑不依赖网络；exhibition 模式只含已发布白名单与派生图，明确不承诺恢复为完整原创工程。文件清单和 hash 支撑传输完整性检查。

P1 默认备份当前文档、全部成长事件和对应引用，不承诺跨电脑恢复内存中的普通撤销栈。若用户选择保存历史编辑 revision，则 manifest 增加可选 historyIndex=[{revision,path}]，对应文件位于 history/revisions/<revision>.json，所有历史资源一并进入闭包。已撤销成长保留事件及图层 tombstone；恢复时直接加载当前文档，不能再把 accepted 事件重复叠加。

backup 的 documentType=planet，对应完整 PlanetDocument；exhibition 的 documentType=publication，对应独立 PublicationDocument：schemaVersion、publicationId、公开 metadata、exterior/interior、公开 assetRefs、portableArchiveEntries、growthLabels。后者保留已生成的视觉图层，但不包含可重放 GrowthEvent、私密 trigger ID、任务/provider 日志、原始提交版本或作者账号。growthLabels 只含 layerId、公开说明和可空的公开档案卡 ID。导入展览包进入只读展览库，不能伪装为完整编辑备份；若另存为编辑副本，须显式提示仅拥有派生图与可见内容，并生成新的身份。两种 documentType 分别校验，不把脱敏后不完整的事件塞入 GrowthEvent Schema。

### JSON 交换

导出 JSON 不嵌 base64 图片。用于参数迁移与调试：目标本地资源库须已有对应 hash，或由用户随后补齐。缺资源允许隔离只读预览和缺失列表，禁止标为“完整还原”或发布。界面必须区分“仅配置 JSON”和“含全部素材的作品 ZIP”。

### 验证及事务导入

1. 读取包头/中央目录，检查格式、数量、路径、重复项、加密/嵌套压缩限制，不先把内容加入正式存储。
2. 先限制压缩文件≤100 MiB、声明解压总量≤200 MiB、条目≤1000、JSON≤5 MiB；单条压缩比暂限 200:1。阈值需 P0 样本校准。
3. 解压时实际累计输出字节和时间，达到限制中止；不能只信中央目录声明。Worker 处理以保持 UI 响应；需要支持增量中止的解码路径，若 JSZip API 无法强制限额，必须换可流式中止的解码库后才能接受不可信包。
4. 校验 manifest、全部文件 hash/长度、MIME 魔数、图片尺寸与引用闭包；不存在未列入清单的文件。任何必需文件损坏整体失败；缩略图可重建，但必须报告修复动作。
5. 按 schemaVersion 校验/迁移到临时空间；验证所有 ID、图层/热点/档案/成长引用及能力；仅静态白名单，无外部自动抓取。
6. 展示名称、来源、大小、迁移与冲突信息；导入服务在明确的导入操作中提交。默认同 exportId/hash 重复导入无操作；同 planetId 不同内容默认作为新副本，更新已有作品需要明确选择并校验权限/revision。
7. 副本导入统一重映射 planet/layer/scene/hotspot/archive/event ID 及内部引用；素材可按 hash 复用。触发键在新的本地身份空间重算，原始来源只保留为标注，不能重放历史成长。来自包的云端 userId/classId/publicationId 不作为授权依据，外部私密引用需重新绑定；导入历史标记为 imported，不能冒充服务器确认过的课程提交或供应商调用记录。
8. 写入 staging 后，用 IndexedDB 事务切换正式文档/事件/资源引用和 universe entry。失败无半成品，残留 staging 在下次启动清理。不得为腾空间先删除唯一原图。

JSZip 的部分异步接口会把完整输出保留在内存，浏览器大包必须有容量上限；ZIP64/加密/分卷格式不进入 v1 支持范围。[JSZip limitations](https://github.com/Stuk/jszip/blob/main/documentation/limitations.md)

## 5. 整个宇宙的备份

Universe 配置：schemaVersion、universeId、name、layout{version,seed,camera}、entries[{planetId,visible,position,scale,order}]。隐藏和布局独立于作品。

P1展示尺寸补充：标准尺寸为1，宇宙展示、命中与轨迹边界统一使用0.8–1.2倍。旧scale的0.1–2存储契约保持兼容，超界值只在展示时收敛，不改写旧布局；新的作品默认scale=1。图片局部变换不承担整体星球展示尺寸，详见 [17-studio-tools-and-planet-size.md](17-studio-tools-and-planet-size.md)。

2026-10-09 草案具体化：camera 的 x/y 为1600×900设计坐标中的平移，zoom 允许0.04–2.5，以容纳更远的深空探索（原实现下限0.35，旧配置继续有效）。星球的运行轨迹从 seed/planetId 派生，不把每帧位置或临时焦点写回 entries，也不改写学生外观图层。允许授权用户拖拽并保存entry.position锚点；位置修改进入宇宙备份，作者归属不从ZIP取得。当前浏览镜头只保留在 UI 会话，备份仍使用文档里的 layout.camera；未来若发布可编辑轨道参数，应显式扩展 layout 并提供迁移，不把运行时 Pixi 对象写入协议。

universe ZIP：manifest.json（packageType=universe）、universe.json、planets/<planetId>.json、assets/<assetId>/...。不嵌套 planet.zip，素材在包中去重；manifest 覆盖全部文件。必须包含隐藏星球和所有被配置引用的完整备份数据，导出前列出缺失项，不能把 JSON 配置下载称为完整备份。

P1 小宇宙沿用 100/200 MiB 限额；超过上限导出“备份集合”：index.json 列出 universe 配置、各单星球包名及 hash，分批下载/分批导入，最终校验所有包齐全后才切换宇宙。每个包独立可读，不依赖 ZIP 分卷标准。无法完成的集合标记 incomplete，原宇宙保持可用。P2 学期归档用服务端流式导出任务和有时效的下载地址。

## 6. 特效预设与版本迁移

注册表项包含 id/version/category、允许的场景、参数 Schema、默认值、资源依赖、质量预算和渲染工厂。统一参数 color、intensity(0..1)、density(0..1)、opacity(0..1)、speed(0..2)、seed；其中 density 是归一化用户意图，不是可无限增长的粒子数。每个 presetVersion 的量化与上限固定并测试，低质量设备再降采样。

v1 预设目录应覆盖 stardust/fireflies/floating-lights/rain/snow/fog/outer-glow/soft-glow/light-beam/breathe，以及 ring；AI 元素 glow-flower/crystal 使用同一登记方式。不同视觉种类独立能力，不能让 AI 传任意 shader 或素材 URL。旧预设版本至少保留到所有引用作品迁移完成，导出含素材依赖。

迁移流程 raw→识别版本→逐版纯函数迁移→目标校验→引用校验→保存新副本。major 不兼容拒绝自动编辑；minor 也只接受应用声明支持的迁移范围，不能仅凭同 major 放行。保留原始包与迁移报告；降级为只读预览时禁止回写覆盖。每次 schema 升级必须有旧包 fixture、hash 不变检查和回滚用例。
