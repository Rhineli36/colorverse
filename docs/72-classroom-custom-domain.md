# 云端课堂恢复原自定义域名

2026-10-30，用户明确授权：`https://colorverse.de5.net/` 和其他课堂页面使用最新课堂，只保留 `/review/`、`/exhibition/` 与比赛所需接口/素材为旧版。

## 路由与隔离

历史和Cloudflare控制面均确认，此域名从2026-10-15绑定原 `colorverse-dev`。现在将域名绑定到独立 `colorverse-domain-gateway`，内部通过Cloudflare Service Bindings转发，浏览器不跳转到workers.dev，也不通过公开workers.dev域名拉取课堂内容。

分流：

- `/`、色彩奥秘、三个实验、登录、课堂教师管理及课堂API → `colorverse-classroom-next`。
- `/review`、`/review/*`、`/exhibition`、`/exhibition/*` → 原 `colorverse-dev`，保留原响应和重定向域名。
- 评审班级资源及现有评审账号的API → 原服务；原服务继续验证JWT及班级权限。路由读取JWT subject仅用于选择目标，不能替代认证、不能授予权限。
- 同源评审页面引用的公共素材仍走原服务。根目录hash脚本先查课堂资源，遇缺失或HTML单页回退时查比赛资源，避免老JS路径得到新HTML。

评审账号的内部subject和班级ID保存于网关变量，无密码或邮箱进入源代码。当前冻结评审账号列表为既有4个subject；未来若新增评审Auth账号，需要同步该变量，不能只添加账号却忽略路由。学生权限、RLS和数据隔离依然由后端控制，没有数据库迁移、重建、导入或重置。

## 发布

网关版本 `f7708990-f633-45eb-8a06-fa2b82bb3961`。课堂仍为源码 `999a61c`、前端 `2026-10-29T14:29:15.660Z-999a61c`、Worker `1cd21d91-837e-4751-b455-946147cb3abb`；比赛仍为 `76b2e8b5-3634-456b-b00e-b6a2f68dd210`。本次没有重新部署这两个应用，也没有构建EXE。

原Token读取zone routes返回403，因此没有修改zone规则；账号级Worker域名绑定API权限可用。先部署独立网关、完成其默认地址的内容对照及评审登录预验，再调用 `PUT /accounts/{account_id}/workers/domains`（固定hostname、原zone_id、production、目标网关、override_existing_origin=true）切换现有绑定。没有删除域名/DNS记录，没有修改证书。初次未加override选项返回409，未造成变更；补充API要求的参数后切换成功。

新增 `apps/worker/src/domain-gateway.ts`、`tests/domain-gateway.test.ts`、`scripts/classroom-domain.mjs`。域名绑定在服务配置中独立于课堂构建，后续正常 `pnpm classroom:next deploy` 会自动在本域名使用新课堂内容，不会改比赛。

维护命令：

```powershell
pnpm classroom:domain deploy --dry-run
pnpm classroom:domain deploy
pnpm classroom:domain bind
# 必要时将整个域名恢复到原旧版服务（不重置数据）：
pnpm classroom:domain rollback
```

脚本重新部署时从Cloudflare现有网关设置读取评审路由变量，不依赖本机账号密码文件。首次部署的配置由既有私有交付记录生成；绑定和回滚限定唯一域名与两个已知服务，防止误覆盖其他域名。回滚会使根路径也恢复旧课堂，而不是只回滚某个实验。

## 实际验证

- `pnpm typecheck`、`pnpm lint`，3项网关定向测试和独立网关dry-run通过。
- 自定义域名下静物实验8组浏览器验收通过，记录 `outputs/weight-lab/custom-domain-browser.json`。
- 正式教师真实登录、35人名单及原29名导入学生、作业列表/星球/通知读取通过；匿名名单401。证据 `outputs/classroom-domain/classroom-auth.json`。
- 评审教师和学生使用现有简易登录账号登录成功，session仍包含原评审班级，星球读取成功；没有改密码或重置内容。证据 `domain-review-auth.json`。
- 原review/exhibition在默认域名和自定义域名的16项HTML/入口JS/CSS/release内容哈希与切换前一致，原Worker版本不变，EXE与情感素材文件哈希不变。证据 `outputs/tree-lab/isolation-before.json`、`isolation-after.json`。
- 浏览器分别实际打开根、review、exhibition均无页面异常，实际请求中workers.dev数量为0。截图及记录 `outputs/classroom-domain/homepage.png`、`review.png`、`exhibition.png`、`browser-pages.json`。
- 自定义域名课堂入口JS/CSS、实验封面等6项资源与现有生产构建逐字节相等，未生成第二套课堂前端。

以上网络验证使用本机配置的代理，不代表对所有中国大陆运营商线路的独立测量；客户端访问入口和资源已无需workers.dev域名。

参考：Cloudflare [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)、[Worker Domain绑定API](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/update/)。
