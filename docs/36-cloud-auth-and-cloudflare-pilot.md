# Cloudflare / Supabase 登录测试版

2026-10-11。继[33](33-upload-login-and-file-readiness.md)完成本机上传与登录边界核对后，开始接入托管云服务。当前交付为邮箱密码登录、退出、会话恢复与服务端身份验证；班级授权、私有文件、云星球保存尚未开放。

## 当前入口与边界

游客直接进入宇宙，无强制登录首页。启用测试配置后，导航右侧“登录”打开深空风格弹窗，学生与教师使用同一个课堂邮箱入口。没有自选云端身份或自助注册按钮。成功后服务端返回“待加入班级”，界面明确提示作品仍在本机；登录不改变演示身份、不会认领演示星球，不自动上传 IndexedDB。

GitHub Pages 保留本机演示，不设置 `VITE_ENABLE_CLOUD_AUTH`，不初始化 SDK 或请求 Auth。Cloudflare 测试版设置该值为 `true`，延迟加载登录模块；手机导航显示登录入口。密码提交/关闭时清空，错误提示不照搬服务端内部错误。原生 dialog 管理模态焦点、Esc 与返回浏览；退出失败保留提示，校验服务断网时仍可退出已有会话。

SDK 在专用 `colorverse.auth.<项目主机>` 存储键中保存会话并刷新。缓存会话仅用于取得 Bearer token，不能作为业务权限依据。服务端向固定项目 `/auth/v1/user` 发起验证，验证邮箱确认与用户 ID；超时/服务异常返回503，凭据失效返回401。忽略 `user_metadata`、前端角色字段和本地课程 cookie。响应 `no-store`，不缓存私人身份；登录退出不保证立即吊销已经签发的所有访问 JWT，后续业务授权还须检查有效成员资格和账户状态。

## 部署命令与凭据

`apps/worker` 是独立的 Fetch Worker，不包含本机 Node HTTP、Sharp、文件系统数据库、自动迁移或演示初始化。`wrangler.json` 配置同源 Static Assets，`/api/*` 优先交给 Worker，未知 API 返回 JSON 404，不回落到 SPA。健康接口明确 `stage=auth-pilot`、`cloudWrites=false`；开发登录、课程和文件写接口未开放。

```sh
pnpm cloud:check
pnpm cloud:dry-run
pnpm cloud:deploy
pnpm cloud:verify https://<worker>.<account>.workers.dev
```

`cloud:check` 只验证 Account ID 与令牌的帐户读取权限，不代表全部部署权限已验证。`cloud:dry-run` 无需令牌，构建并离线校验 Worker 打包。`cloud:deploy` 读取本机凭据、验证帐户、构建测试版并上传；成功 URL 和资源版本由 Wrangler 返回。

根目录 `.env.cloudflare.local` 保存 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`，由 Git 忽略。令牌只通过 Wrangler 子进程环境传递，不作为命令行参数或前端配置。前端 `.env.local` 只含项目 URL 与 Publishable key；部署生成的真实公开配置放在忽略的 `work/wrangler.cloudflare.json`。数据库密码和证书不会被部署脚本读取。`.wrangler/`、`.dev.vars*` 也不进入 Git。原始本机课程服务仍只监听127.0.0.1，不能直接将其数据库环境改成 Supabase 后上线。

第一阶段令牌：指定帐户 `Account Settings / Read` 与 `Workers Scripts / Edit`；后续实际接 R2/Hyperdrive 时再加对应权限，不使用 Global API Key，不需要域名 DNS 权限。Account ID 在控制台账号地址段或 Workers & Pages 的 Account Details 中取得，登录邮箱不是 Account ID。[官方权限](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)、[ID 查找](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/)。

## 正式课堂前的下一步

1. 在独立私有业务 schema 落地现有 PostgreSQL 契约，建立受限运行角色，关闭浏览器角色直接读写业务表；不能以此次连接检查的 postgres 作为最终 API 用户。
2. 绑定 Supabase issuer/subject 与用户、有效班级成员关系。教师首次建班需要明确的初始化身份，再通过教师邀请分配学生身份；不得通过可修改 metadata 晋升教师。关闭自助注册与落实邮箱邀请/密码设置流程，生产邮件需配置 SMTP。
3. 配置 Hyperdrive、私有 R2、图像解码与变体生成；补齐中途失败、孤立资源、解除引用、配额和联合恢复验收。当前部署不能上传正式作业。
4. 云星球所有权、班级可见快照与学生A/B/教师隔离验证通过后，才将编辑/提交切入云端路径。本机演示角色与云端权限始终分开。
5. 校园网直连、请求限流、日志脱敏、会话与上传错误恢复、备份恢复需要独立验收。本机代理成功不是校园网可用结论。

## 验证记录

新增20项模块检查：远端验证、伪造教师 metadata/header、缺失/畸形/过长 token、过期/拒绝、上游故障、邮箱确认、配置越界、API 路由与禁用开发登录、前端显式开关和错误提示，以及全局 Fetch 调用和不转发重定向凭据。全套20文件162项通过。TypeScript、ESLint、生产构建及 Wrangler dry-run 通过。

新增5项隔离浏览器检查：游客无登录墙/无 Auth 请求、错误提示与密码清空/Esc、成功后服务端身份与刷新复验、断网保留退出通道、390px手机弹窗/入口。全部 Auth 和会话请求被拦截，无实际注册、邮件或真实用户登录；这些检查不是正式账户端到端验收。浏览器首轮发现旧手机样式隐藏导航右侧，以及弹窗宽度未计入 padding，修复后通过。运行报告和截图保存在 Git 忽略的 outputs。

已发布到[Cloudflare测试版](https://colorverse-dev.2999346.workers.dev)，Worker版本 `778ed169-4886-4a56-95df-8b188504dbeb`。真实线上7项页面/API检查通过：HTML与健康200、未登录401、无效令牌经Supabase拒绝后401、开发登录/上传404、会话写入405；5项浏览器模拟流程在线复测通过，不重复增加独立检查数。真实教师/学生成功登录仍需建立应用账户，不能使用Cloudflare控制台账户替代。

首轮实际边缘运行发现 `redirect="error"` 产生 TypeError，虽然Node模拟检查与当日官方文档接受此值。查看仅使用无效测试令牌的脱敏诊断后，改用实际运行支持的 `manual` 并拒绝全部3xx，避免把Bearer/apikey转发到其他地址；删除临时详细诊断，仅记录异常名称/上游状态。修复已在真实Worker→Supabase链路验证，不能只依赖打包dry-run。测试/部署经本机代理，校园网直连仍未验收。

官方身份验证依据：[Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser)，不能把 getSession 返回的缓存用户当作服务器授权依据。
