# 云端班级身份核对

2026-10-11。接续[36](36-cloud-auth-and-cloudflare-pilot.md)，完成 Supabase 真实教师账户与私有业务成员表的绑定、Hyperdrive 连接、账户页班级身份显示。用户实际登录后确认显示测试班与教师，提供的页面截图与服务端预期一致。云端作业、云星球与私有对象上传仍未开放，不能把此阶段解释为正式课堂系统全部上线。

## 当前交互和权限

游客直接浏览。邮箱登录成功后，Worker 先向固定 Supabase 项目验证 token、已确认邮箱与用户 ID，再按 issuer/subject 查询业务用户和成员关系。角色来自数据库，不来自邮箱域名、可修改 metadata、请求头或本机演示身份。当前账户页列出本人有效且未归档的班级与学生/教师/助教身份，提供“重新核对班级”。

未登记或没有有效班级的账户显示待加入班级，不自动创建用户、认领演示星球或晋升教师。业务账户 inactive 显示已停用且清空班级；数据库异常返回503，清除页面旧身份并保留退出通道。每次检查重新查表，Hyperdrive 查询缓存关闭；这不是主动推送撤权，已显示的页面需重新核对或在下一次业务请求检查。未来写接口仍须每次验证角色与所有权。

共享 `CloudSessionSchema` 严格验证身份、数据库配置状态、成员关系与访问状态，拒绝空班级的 active 状态及多余字段。健康接口的 `enrollmentDatabaseConfigured` 仅说明绑定已配置，不证明每次数据库请求成功。当前接口始终 `cloudWrites=false`；本机教师演示与正式云端权限仍分开。

## 私有数据库与初始化

业务表建立在 Supabase 的 `colorverse` schema，复用现有不可变[001迁移](../apps/api/migrations/001-course.sql)，校验SHA256并使用事务和 advisory lock。拒绝未登记但已有表的 schema、已应用迁移内容变化；重复运行不重复建班。不向云端初始化演示学生、假作业或素材。

schema/表/函数及未来默认权限撤销 PUBLIC、anon、authenticated 访问；浏览器公开 key 无法直接读写业务数据。当前运行角色 `colorverse_identity_reader` 为非管理员、无继承成员资格，只获 users/classes/enrollments 的 SELECT，不读 assets/作业内容，不获业务写入。实际读取账户在 READ WRITE 事务中尝试无匹配行的成员 UPDATE，被 PostgreSQL 以42501拒绝；限制不只依赖默认只读事务。

```sh
pnpm cloud:database apply --proxy
pnpm cloud:database check --proxy
pnpm cloud:database bootstrap --teacher-email=teacher@example.test --proxy
pnpm cloud:hyperdrive check
pnpm cloud:hyperdrive create
pnpm cloud:deploy
```

`--proxy` 仅用于此次本机IPv6直连不可达的诊断环境，通过本机127.0.0.1:7892 CONNECT；生产 Worker 不依赖该代理。不需要代理的机器省略此参数。所有数据库连接保留官方根证书与主机验证。

初始化教师邮箱必须由项目负责人明确提供。先在 Supabase Authentication → Users → Add user → Create new user 创建并确认邮箱；bootstrap 只查询该邮箱唯一、未删除、未禁用、已确认的 Auth 用户ID，不读取或设置密码。首次空数据库建立“设计色彩 · 测试班”与教师成员关系；已有班级而目标没有教师资格时拒绝自动提升，需显式后续成员流程。不是自助教师注册，也不是学生邀请实现。当前自动确认方式用于负责人创建的测试教师，不能当作课堂批量邀请方案。

## Hyperdrive 与配置

沿用已有帐户设置读取与 Workers脚本编辑，追加限定当前帐户的 Hyperdrive编辑及SSL和证书编辑，后者用于上传数据库根CA。Hyperdrive 使用 Direct Supabase主机、上述受限读取角色、`verify-full`、匹配根证书、关闭查询缓存和5个源连接上限。没有购买IPv4或付费计划。第一次创建收到Cloudflare500/10000，重新检查并重试成功，未复制错误中的连接参数或输出密码；脚本先查同名配置和根证书，复用一致配置，遇不一致项要求检查而不覆盖。

每个Worker请求单独创建pg Client并在finally关闭，底层连接池由Hyperdrive维护，不跨请求保存身份。Auth和DB分别有超时；前端完整检查超时18秒，覆盖顺序验证预算。部署前检查连接指向当前项目、受限角色、关闭缓存与verify-full，私密配置损坏时不悄悄退回未连接状态。

私密文件由Git忽略：原 `.env.supabase.local` 为管理迁移凭据；自动生成 `.env.cloud-database.local` 为只读运行凭据；`.env.hyperdrive.local` 只保存绑定ID。数据库密码只通过结构化HTTPS请求提交给Hyperdrive，不能进入Vite变量、Wrangler公开vars、命令行参数或源码包。前端仍仅使用项目URL与Publishable key。运行角色凭据在事务提交前写入本机私密文件以免成功建角色后遗失；不要手工删除或提交该文件，后续轮换需同步Hyperdrive。

依据：[Cloudflare连接Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/)、[pg驱动](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)、[证书配置](https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/)、[配置API](https://developers.cloudflare.com/api/resources/hyperdrive/subresources/configs/methods/create/)、[根证书API权限](https://developers.cloudflare.com/api/resources/mtls_certificates/methods/create/)、[Supabase Data API隔离](https://supabase.com/docs/guides/api/securing-your-api)。

## 验证记录和下一步

新增10项模块检查：本人有效关系、教师角色按班级隔离、其他issuer/未知subject不匹配且不自动建用户、停用账户、撤销后复验、schema注入、忽略伪造教师字段、DB故障隐藏身份、Auth拒绝时不查DB、不一致session拒绝。全套21文件172项、ESLint、TypeScript、构建和Worker打包通过；CI的真实PostgreSQL18作业加入该新测试文件。

7项隔离浏览器流程本机和线上通过，Auth/session请求被拦截，包含新班级卡片、重新核对与撤销后清空，390px手机弹窗、错误登录/密码清空、服务故障与退出；线上复测不重复累加。真实Supabase迁移/角色权限和首教师绑定、只读角色查询教师班级通过，用户实际网页登录并截图确认教师身份；这条用户验证没有读取用户密码。尚未建立学生A/B真实账户验证完整登录/提交隔离。

已部署[Cloudflare测试版](https://colorverse-dev.2999346.workers.dev/)，Worker版本 `654a6813-5c00-4af8-a11b-112ca681ce33`。7项线上页面/API检查通过，额外健康检查确认Hyperdrive绑定存在；未登录/无效token仍401，开发登录与文件接口404，session写入405。GitHub Pages继续本机演示，不启用云端Auth。

下一步建立受控学生加入班级流程，然后实施私有R2/媒体解码、上传配额、失败清理与联合恢复，接入云星球所有权与作业提交。写操作使用单独明确授权角色，不能给当前只读角色直接放开所有表；仍按[33](33-upload-login-and-file-readiness.md)验收后开放。密码重置/邀请回调、正式SMTP、限制注册、校园网直连及备份恢复尚待验证。
