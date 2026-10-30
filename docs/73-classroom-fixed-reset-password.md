# 教师重置学生密码：固定8个8

2026-10-30，按用户明确要求，云端课堂教师执行单个学生重置时，临时密码固定为 `88888888`。已有学生密码不批量改变，正式教师、评审账号均不重置。比赛、展示、EXE和数据库结构不改。

修改 `apps/worker/src/classroom-accounts.ts` 的临时密码生成策略；保留现有教师/班级授权、排除评审账户、Auth规范保存、must_change_password与Auth app_metadata强制改密、保留原有激活状态。教师详情的重置确认框明确显示新规则；成功提示说明8个8和登录后必须改密。

`changePassword` 继续要求校验当前密码，新密码不能与当前密码相同。学生完成改密后解除强制修改状态，旧临时密码失效；姓名激活入口不会重新开放。

测试使用隔离的PGlite数据和Auth传输替身，没有针对任何真实学生执行重置。`pnpm typecheck`、`pnpm lint`、`pnpm test tests/classroom-management.test.ts`（14项）通过；新增断言检查固定值、强制改密标记、禁止保留8个8、修改后临时密码不再通过，以及既有学生/跨班教师权限限制。没有宣称本轮对真实课堂学生完成了重置演练。

只发布 `colorverse-classroom-next`，自定义域名 `https://colorverse.de5.net/` 通过既有网关自动使用新服务；`/review/` 和 `/exhibition/` 仍使用冻结比赛Worker。
