# Supabase Data API 默认授权变更检查

检查日期：2026-10-21。针对 2026-10-30 新建 `public` 表不再自动开放 Data API 的变更。

## 结论及访问路径

当前版本不依赖这项自动授权。线上数据库有 24 张 `colorverse` 表（其中 1 张迁移登记表），`public` 中没有业务表。前端没有通过 `/rest/v1`、GraphQL、`supabase.from()` 或 RPC 访问业务数据。

| 数据类型 | 实际访问方式 | 权限来源 |
| --- | --- | --- |
| 登录与会话 | Supabase Auth HTTP，经本站受限登录转接 | Auth 账号和会话，不是业务表 Data API GRANT |
| 身份、报名、教师统计 | Worker → Hyperdrive → PostgreSQL | `colorverse_identity_reader`，具名表 SELECT |
| 星球、展示作业、留言、评分、发布作业 | Worker → Hyperdrive → PostgreSQL | `colorverse_classroom_writer`，按表及列显式授权 |
| 作品图片与原图 | Worker → Supabase 私有 Storage API | 后端密钥与 Worker 班级/所有权校验，前端不持有密钥 |
| 展示网页、离线 EXE | 包内静态资源、IndexedDB | 不连接 Supabase 业务数据库 |

数据库角色是后端服务角色，与页面上的学生/教师角色不同。Worker 根据已验证身份、有效报名和班级逐次判定权限；学生不能因为后端使用 writer 连接就获得教师功能。

## RLS 的实际情况

检查发现 `colorverse` 业务表此前未启用 RLS，没有业务 RLS policy。原有保护是私有 schema、显式 GRANT、独立数据库角色、Worker 认证/报名/所有权检查。不能将此描述为“已经依靠 RLS 过滤学生行”。

本轮没有启用、关闭或修改任何 RLS、policy、函数或不可变历史触发器；没有暴露 `colorverse` schema，也没有修改 Supabase 托管的 Auth/Storage 表、策略或平台默认授权。

## 建表、迁移与修正

原有 001—010 迁移按当前 schema 的 `search_path` 建表；部署脚本 `cloud-database.mjs`、`classroom-provision.mjs`、`classroom-setup.mjs` 明确授予自定义后端角色权限，并撤销浏览器角色访问。线上所需授权已完整，没有发现因本次默认变更而缺失的现有业务权限。

为防止后续迁移重放时遗漏分散在初始化脚本里的授权，本轮新增 `011-explicit-runtime-grants.sql`，集中声明完整的运行权限。已通过维护命令应用到当前数据库，并登记为迁移 11。没有修改 001—010 的内容及校验值。

- 只读角色只获得身份核对和统计实际需要的 SELECT。
- 写入角色只获得星球、作品、任务、导入等实际需要的具名表操作；无建表、管理员或 BYPASSRLS 权限。
- `users` 的 UPDATE 限定为 `display_name`、`student_number`、`real_name`，不允许改账号认证标识及状态。
- 评分历史只有 SELECT/INSERT；无 UPDATE/DELETE，继续受原不可变触发器保护。
- `anon`、`authenticated` 不获得私有 schema 或业务表权限；`service_role` 也未新增任何业务表授权。
- 主键使用 UUID，没有需要补授的业务自增序列权限。
- 新增迁移不会依赖 Supabase 对 `public` 的任何隐式默认 GRANT。

幂等操作：

```powershell
# 只读检查，不改变数据库。
pnpm cloud:database-access check

# 显式应用迁移 11；版本校验相同则不重复执行。
pnpm cloud:database-access apply
```

均读取本机忽略的数据库配置，密钥不进入源码、前端或报告。需要本机代理时，按现有数据库脚本的方式配置并追加 `--proxy`，不把代理配置硬编码到项目。

`classroom-setup.mjs` 完成原迁移后会调用同一迁移函数。新环境仍须先完成后端受限角色创建，再执行课堂迁移；不要仅将 SQL 文件导入 `public`，也不要为让 Data API 可见而批量开放业务表。将来若新增真正通过 Data API 访问的对象，应单独设计所需角色、逐操作 GRANT 和对应 RLS，再增加新迁移。

## 验证

### 无自动授权的干净数据库

`tests/database-access.test.ts` 在独立 PGlite PostgreSQL 环境从头重放 001—010，创建非特权后端角色，不提供 Supabase 自动授权，再应用 011：

- 写入角色能够访问所需资源，不能修改用户认证字段、不能改写/删除评分历史。
- 只读角色不能写星球、不能读激活账号表。
- `anon`、`authenticated`、`service_role` 仍不能直接读取业务星球表。
- 在一个已启用 RLS、禁止 writer 读行的测试表上重放迁移后，RLS 与 policy 不变，原始行保留，writer 仍读不到该行。
- 原有评分历史不可变触发器保留。

完整自动测试：39 个测试文件、259 项通过。类型检查、相关 ESLint 和 diff 空白检查通过。

### 真实数据库及真实私有文件

使用实际 `colorverse_classroom_writer` 凭据连接数据库，调用现有 Worker 业务处理函数。测试使用独立的临时课程/班级，临时学生、星球、作品、留言、评分等在外层事务中操作，请求事务通过保存点隔离，最终回滚；临时课程/班级按精确内部 ID 清理。

| 流程 | 结果 |
| --- | --- |
| 学生填写资料、创建星球，重复创建保持同一颗星球 | 通过 |
| 教师发布作业，学生读取已发布任务 | 通过 |
| 学生提交作业、私有原图/展示图上传与读取、重复提交幂等 | 通过 |
| 另一名同班学生留言、读取及重复请求幂等 | 通过 |
| 教师读取待评价、标为已读后仍待评价、评分 92 分、学生读取新评分 | 通过 |
| 学生不能发布作业/教师评分，不能读取未报名班级 | 通过 |
| 实际只读 reader 凭据读取评审班教师统计 | 通过 |

图片上传和读取使用真实 Supabase 私有 Storage；测试中 Cloudflare Images 处理绑定由本地 sharp 适配，未重新验证其云端图像转换实现。本轮重点是数据库权限及业务处理路径，没有修改前端，也未将上述服务端流程冒充新的逐页人工浏览器验收。

另外通过已部署 Workers 地址实际登录评审学生和教师，验证会话、班级归属、星球、任务及消息接口正常读取。未登录访问业务接口返回 401；尝试经 Supabase Data API 直接访问 `colorverse` 返回 406 / `PGRST106`，证实它不在暴露的 Data API schema 中。这些 HTTP 检查只读业务数据，没有发布或修改现有评审作品。

### 数据保护和复查

执行前后对 23 张业务表的全部行计算排序指纹，完全一致。迁移登记表只增加版本 11。表的 RLS 标志、policy、有效表权限、角色属性/成员关系及默认授权完全一致；线上已有授权被新迁移明确记录，并未扩大。

临时作品等写入全部回滚，两份临时 Storage 对象及临时班级/课程均已清理。未重建、清空、归档或重置任何真实课堂及评审数据。没有重新封装或替换 EXE，原 1.0.2 交付包不受影响。

原 EXE SHA256 复核仍为 `1b1e7869eec137b4af2df77edb7f3ea4f1c6cc5de10f86745d3ecf6d4a749e3a`。本轮只有数据库授权迁移及维护/测试文件变更，不需要重新发布前端或封装 EXE。

原始检查记录位于 `outputs/data-api-audit/`：

- `before.json` / `after.json`：数据库元数据、权限及业务行指纹。
- `runtime-access.json`：运行权限矩阵检查。
- `live-flows.json`：真实受限连接与业务流程验证。
- `http-readback.json`：实际云端登录、接口读取及 Data API 拒绝验证。
- `preservation.json`：前后保护性对照。

## 官方依据

- [Supabase 变更公告：新表不再自动暴露至 Data/GraphQL API](https://github.com/orgs/supabase/discussions/45329)
- [Supabase 官方 Changelog](https://supabase.com/changelog)
- [Supabase Data API 授权与 RLS 说明](https://supabase.com/docs/guides/api/securing-your-api)

该变更针对以后创建对象的默认 Data API 暴露，现有对象的 GRANT 保留；SQL 服务角色的显式授权和应用服务端权限校验仍需要独立维护。
