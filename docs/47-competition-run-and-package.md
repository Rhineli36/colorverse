# 参赛版本运行与打包说明

按负责人最新确认，参赛浏览展示优先采用轻量静态展示，真实云端课堂用于验证和演示登录、上传、评分与互评。源码、本机课程开发环境和静态展示版是不同交付，不能互相替代。静态版不能证明真实写入能力。以下说明优先于早期阶段文档中的“云端待接入”等描述。

## 三种使用方式

| 方式 | 实际功能 | 数据与网络 |
| --- | --- | --- |
| 云端课堂 | 真实邮箱登录、班级权限、星球设计、教学模板、作品上传与说明、规则成长、教师评分、同伴反馈 | Worker、Hyperdrive、Supabase Auth/PostgreSQL/私有 Storage 均需可访问；不是离线服务 |
| 本机源码默认启动 | 本机创作、导入导出、预制星球、规则成长；另启课程 API 可演示任务发布、退回重交和版本历史 | 浏览器 IndexedDB；课程 API 用本机 PGlite 与私有文件目录。开发身份不能公开部署 |
| 静态备用包 | 5 个匿名作品风格案例、5 个默认星球、25 幅预览、演示点评、成长播放、即时点赞、教学卡片和模板浏览 | 自带全部运行素材；本机 HTTP 服务启动后不需要云服务。没有真实上传、登录、写入评分或互评；点赞不持久保存 |

线上主演示地址由负责人单独提供。现有 workers.dev 和 GitHub Pages 地址不能保证中国大陆所有网络可访问，联网演示必须提前在比赛现场网络验证。静态包用于断网时展示外观与教学设计，不作为真实保存功能的验收证据。

## 源码目录与环境

Node.js ≥22.12，建议 Node.js 24；pnpm 11.25.0；现代 Chrome/Edge。React 19、TypeScript 5、Vite 7、PixiJS 8；Worker 使用 Fetch API、pg 和 Cloudflare Images，Node 可移植服务器使用 sharp。Windows 与 Linux 均有启动代码，Docker 方案主要面向 Linux。

源码包保留 apps/web、apps/worker、apps/server、apps/api、packages、scripts、tests、docs、deploy、依赖清单和锁文件。apps/web/public 是匿名预览与系统素材；生产数据库与私有上传文件不在源码包内。migration 001～006 必须保持原文件，已应用迁移用 SHA256 校验，不能修改后覆盖旧库。

安装和前端启动：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开终端显示的本机地址（默认 http://127.0.0.1:5173）。默认没有云端账户配置时是本机创作演示，不能以此证明云端上传可用。依赖安装需要网络。

验证和构建：

```sh
pnpm lint
pnpm test
pnpm build
pnpm preview
```

## 独立的本机正式课程模块

在另一终端执行 `pnpm dev:api`，再执行 `pnpm dev`。开发 API 只监听 127.0.0.1:3001，前端通过 Vite 代理连接。首次启动自动应用 001-course.sql 和开发种子。PGlite 数据默认在 work/course-server/postgres，上传文件在 work/course-server/private-media。关闭再启动会继续使用该目录。

该模块支持发布任务、学生提交、教师评阅、退回、重新提交和提交版本记录；使用开发身份，入口是本机“课程作业”。本次没有把这些接口接入真实 Worker 课堂，也没有把它们列入主演示路线。`NODE_ENV=production` 时开发 API 明确拒绝启动。

## 本机运行真实云端课堂前后端

可移植 Node 服务器与 Worker 复用接口，但仍依赖外部 Supabase。它不是自带数据库和 Auth 的离线一键包。

1. 由负责人准备独立 Supabase 项目、邮箱密码 Auth、colorverse schema、班级授权记录与非公开 colorverse-classroom 桶。源包不携带真实账号、密钥、数据库导出或私有图片。
2. 使用后台管理员凭据初始化结构：`pnpm cloud:database apply` 应用 001，`pnpm exec tsx scripts/classroom-setup.mjs` 应用 002～006。管理员凭据只用于初始化；运行时必须使用受限 reader/writer 账户，不能传入 postgres 管理员连接。新项目还需按 scripts/classroom-provision.mjs 中的权限清单建立 writer，并建立私有桶；该旧脚本绑定既有试用班，不能直接作为任意新项目的一键初始化命令。
3. 在 apps/web/.env.local 设置公开项目地址和公开密钥，以及 `VITE_ENABLE_CLOUD_AUTH=true`、`VITE_USE_AUTH_PROXY=true`。后端凭据不能使用 VITE_ 前缀。
4. 设置下表后端环境变量，执行 `pnpm build`、`pnpm start:server`。本机测试可使用 `SERVER_LOCAL_TEST=true` 和 `PUBLIC_ORIGIN=http://127.0.0.1:3000`；打开该服务器地址，不要把前端与 Auth 转接分开到不同源。正式部署必须使用 HTTPS。

| 环境变量 | 用途 |
| --- | --- |
| VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY | 仅前端公开配置 |
| VITE_ENABLE_CLOUD_AUTH / VITE_USE_AUTH_PROXY | 启用登录与同源 Auth 转接 |
| VITE_EXHIBITION_MODE / VITE_BASE_PATH | 静态展示模式及资源根路径 |
| SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY | 后端验证与 Auth 转接 |
| SUPABASE_SECRET_KEY | 仅后端调用私有 Storage 与受控 Auth 管理接口 |
| DATABASE_READER_URL / DATABASE_WRITER_URL | Node 服务的受限 PostgreSQL 连接 |
| DATABASE_CA_FILE | PostgreSQL 证书信任文件，必须校验主机和证书 |
| PUBLIC_ORIGIN / PORT / SERVER_HOST | 服务公开源、端口与监听地址 |
| SERVER_LOCAL_TEST | 仅允许显式本机 HTTP 测试 |
| SUPABASE_DB_HOST / SUPABASE_DB_PORT / SUPABASE_DB_NAME / SUPABASE_DB_USER / SUPABASE_DB_PASSWORD / SUPABASE_DB_CA_FILE | 根目录 .env.supabase.local 中的初始化配置；实际键名均以 SUPABASE_DB_ 开头 |
| CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN | 根目录 .env.cloudflare.local 中的部署配置 |
| CLOUDFLARE_HYPERDRIVE_ID | 独立 reader/writer 本机配置文件中绑定 ID |
| COURSE_DATA_DIR / COURSE_API_PORT / COURSE_WEB_ORIGINS / DATABASE_URL | 独立本机课程 API 数据、端口、允许源及可选 PostgreSQL |

Worker 部署使用 `pnpm cloud:deploy`，需要本机 Cloudflare、Supabase 公开配置、reader/writer Hyperdrive 绑定以及已安装的后端 Secret。现有 scripts/cloud-hyperdrive.mjs、classroom-secret.mjs 等属于负责人部署工具，不是评委使用步骤。没有这些外部配置时不能启动完整真实课堂。

## Docker 的边界

现有 deploy/server/Dockerfile、compose.yaml、Caddyfile 可部署 Node 课堂服务器与 HTTPS 反代。复制 deploy/server/.env.example 为 .env，并提供数据库 CA 文件到 deploy/server/secrets/postgres-ca.crt，按前述完成外部数据库与私有桶初始化，再运行：

```sh
docker compose --env-file deploy/server/.env -f deploy/server/compose.yaml up -d --build
```

镜像仍需要联网构建，运行仍依赖 Supabase；没有内置完整离线 Auth、数据库和对象存储。当前没有在这台 Windows 电脑上完成 Docker 新主机部署验收，不把该方案表述为已验证的一键交付。参赛备用展示用下方静态包更简单。

## 静态备用包启动

解压后先安装 Node.js（离线电脑应预装），在包目录执行 `node serve.mjs`。Windows 也可双击“启动展示.cmd”。浏览器打开 http://127.0.0.1:5198。无需 npm/pnpm 安装依赖，不要双击 index.html 以 file:// 运行。参考资料链接在断网时不可打开，但卡片正文和全部展示素材在包内。

## 演示数据与恢复

scripts/learning-demo.mjs 管理一个独立演示班、一名教师、两名学生，密码与恢复日志仅保存在忽略目录 work/learning-demo-accounts.json 和 work/参赛演示账号.txt。教师账号与原课堂教师分开，角色来自数据库 enrollment。`--provision` 初始化受控身份与独立班级；`--seed` 通过真实课堂接口上传示例、设置模板和填写演示反馈。脚本要求已有可工作的云端基础设施。

历史作业预览来自负责人授权用于演示的素材；新说明与演示点评预先编写，不代表原作者意图和原课程成绩。星球外貌/内部场景为开发过程中的 AI 辅助素材。正式公开参赛前，负责人仍需确认展示授权与素材署名。

恢复时优先创建新的演示班并重新导入经授权样例；不删除或覆盖正式班级。现有日志可安全重跑种子，已上传记录和已有点评不重复覆盖。它不会清空后来人工提交的数据，不等同于一键恢复到完全空白。包含正式教学数据的全库备份不能当作公开演示种子。评委账号应比赛前单独发放，比赛后轮换或停用。

## 源包排除与校验

排除 node_modules、.git、work、outputs、缓存、日志、.env.local 等真实配置、数据库/证书凭据、账号密码、原学生文件夹和私有数据库备份。保留 .env.example 模板和匿名压缩预览。源包包含更新后源码与全部迁移；静态包包含构建产物、匿名预览、无依赖 HTTP 启动器和说明。两包分别列出 SHA256 与文件数，体积以打包结果为准，不以“源码能压缩”代替运行验证。
