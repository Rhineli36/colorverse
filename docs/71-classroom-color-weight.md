# 实验03：色彩的分量

2026-10-29。按用户在评估后授权实施的P0，使用原创SVG《窗边的花瓶》。仅独立课堂 `colorverse-classroom-next`，不部署比赛/评审/展示，不构建EXE，不改数据库或账号。保留实验01水母、实验02色彩之树。

## 范围与模块

首版仅一幅16:10静物、窗帘展开12%—48%、四类可见面积、保存参数对照、重置、PNG导出、课堂模式。未加入桌面高度、花瓶宽度、交换配色或位置实验等P1功能。

13条原创可编辑路径：米白背景、深蓝窗帘和窗框、水平深蓝桌面、陶橙花瓶、三条茎及五枚灰绿叶形。绘制顺序始终是背景→窗帘→窗框→桌面→花瓶→茎叶。没有材质、渐变、阴影、透明叠色、3D、持续动画或AI生成的画布图像。范例只参考布局与静物形式，未截图当页面素材。四个锁定色值为 #EFE5CF、#29445B、#CE694A、#73866A。

新增 `weight-scene.ts`（路径/类型/校验/面积舍入）、`weight-raster.ts`（统计/PNG）、`WeightLab.tsx`、`weight-lab.css`、`weight-cover.svg`。修改注册和课堂路由接入；共享入口封面的alt改为准确的“实验画面”。没有改水母/树的渲染器。

## 统计、对照和导出

SVG显示、统计和PNG导出共享 `weightPaths` / `weightSvg`，相同参数、色值与层级；只改变窗帘轮廓，其余12条路径不变。统计在1200×750离屏画布栅格化完整插画后，合并相同RGB，按最终可见像素计算，遮挡不会重复计数。抗锯齿边缘按最近的锁定RGB归类。只在参数变化后70ms计算，缓存最近45份数值；没有RAF循环。

分母不包含UI、边框和画布外留白。界面明确窗帘滑杆是相对画布宽度，深蓝实际总占比见下方。四类百分比显示“约”和一位小数，以最大余数法分配十分位，合计100%。

本机键 `colorverse.color-lab.weight.v1`，version=1与composition=window-vase-v1。快照含四个色值、窗帘与构图版本，通过深复制保存，后续修改不会改变它。保留最近两份对照并明确提示；点击任一快照与当前构图比较。重置只重置当前，不删除保存；刷新恢复当前和快照，默认展示单幅。存储失败有提示，仍可继续操作及导出。窄屏对照上下完整呈现，桌面左右对照保持相同比例。

PNG单幅1200×750；对照2400×750，左为已保存，右为当前，均完整包含原画布，不含应用文字和控制器。没有外部字体依赖，不会把界面截图冒充作品导出。导出失败保留操作状态并提示，统计失败仍显示SVG并提供重试。

## 实际验证

类型检查、lint、43个测试文件共283项测试通过。新增单元验证固定形体/锁色、边界校验、面积合计和快照独立。`tests/weight-lab-browser.py` 用实际Chrome验证8组：可编辑纯色路径、边界与固定形体、两档面积收敛、PNG与统计逐像素分类一致、快照/刷新/重置、适配/课堂/历史路由、原实验入口与清理、统计错误恢复、断网后实验与导出。

窗帘12/28/37/48四档，1200×750与2400×1500对比，各颜色最大差异约0.0211个百分点，小于0.2。默认28%时深蓝约44.3%，窗帘48%时深蓝约59.0%；不是将滑杆值当颜色占比。导出的对照PNG左右分类像素数量与对应统计完全一致。精度仍为栅格近似，没有宣称解析几何绝对精确。

水母13组和树11组本地浏览器回归通过。证据在 `outputs/weight-lab/`，入口工作台、对照UI、课堂分别为带前缀的 `-workbench.png`、`-comparison-screen.png`、`-classroom.png`；`-comparison-export.png` 是实际作品PNG，不当作UI截图。

实际执行命令：

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm classroom:next build
& 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' tests/weight-lab-browser.py
& 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' tests/tree-lab-browser.py
& 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' tests/color-lab-browser.py
```

生产预览与线上使用 `COLORVERSE_TEST_URL`、`COLORVERSE_TEST_LABEL` 指定相同脚本。此模块无需新增素材、权限、后端接口或部署变量。课堂账号和作业仍需网络；实验自身加载后断网可继续，或通过本地HTTP服务运行，不宣称云端整站可离线冷启动。
