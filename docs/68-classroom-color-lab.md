# 云端课堂：色彩实验室与深海水母

2026-10-28。本轮仅对独立 `colorverse-classroom-next` 课堂 Worker 发布。不运行 `cloud:deploy`、`cloud:dry-run`、`build:competition`、`package:desktop`，不推送 main。无需数据库迁移、账号修改、对象存储或在线生成服务。

## 入口与功能

- 实验室：`https://colorverse-classroom-next.2999346.workers.dev/color-mystery/lab`
- 工作台：`https://colorverse-classroom-next.2999346.workers.dev/color-mystery/lab/jellyfish`
- 课堂直达：`https://colorverse-classroom-next.2999346.workers.dev/color-mystery/lab/jellyfish?mode=classroom`

仅课堂上下文启用第三栏目；共享 `ColorMystery` 在其他上下文默认保持两栏。已有知识主题、情感色系、23 张案例及图片映射没有改动。课堂登录、学生名单、提交和批改继续使用原有组件与服务。访客可以直接打开实验。

新增实验注册信息、静态入口、四种预设、色彩和动态两组参数、纯色色标及 HEX、暂停、同步 A/B、相机操作、三档质量、PNG 导出、版本化本地参数保存和恢复默认。灰度记忆各侧原配色；点缀色比例只对彩色「暗海微光」有效。A/B 共用一个几何体、种子 20261028、相机、动画时间及渲染曝光，允许各侧独立微调颜色。

课堂模式隐藏主导航和完整参数面板，保留底部工具条及始终可见的退出按钮；设置使用原生模态抽屉。课堂模式和浏览器全屏独立，模式、抽屉切换不重建 WebGL 上下文。窄屏通过抽屉调色。空格暂停、1—4 配色、H 课堂模式、R 重置视角、F 全屏，表单输入和按钮焦点不会误触这些快捷键。

进入实验才按需加载粒子模块。页面隐藏时取消绘制，退出实验释放 RAF、监听、ResizeObserver、几何、材质和 WebGL renderer。WebGL 不可用或丢失时显示真实场景封面、中文提示和重试；上下文丢失后的重试替换失效 canvas。

## 源码与素材

水母来自用户提供的 `COLORVERSE-水母接入包.zip` 对应完整目录 `2026-10-28/1-2-3-1-2-3/outputs/deep-sea-jellyfish`。提取原 `app.js` 的 GPU 着色器和确定性粒子形态，保留钟形伞、口腕、触须、漂浮粒子、呼吸与扰动。没有重新生成形态或用视频替代交互。

- `apps/web/src/features/color-lab/jellyfish-shape.js`：原形态、GLSL、粒子排序。
- `jellyfish-renderer.ts`：容器化渲染 API、共享相机/时钟、导出和释放。
- `JellyfishLab.tsx`、`color-lab.css`：工作台、课堂模式、抽屉与响应式布局。
- `lab-state.ts`：预设、微调、灰度、纯色色标和本地持久化。
- `lab-navigation.ts`、`experiments.ts`、`LabLanding.tsx`：课堂门控、深链接和实验注册。
- `apps/web/src/features/classroom/ColorMystery.tsx`、`CloudExperienceView.tsx`：第三栏目及课堂路由集成。
- `apps/web/public/color-lab/jellyfish-cover.webp`：从原作品真实画布 PNG 裁出的本地封面，不在入口后台运行粒子。
- `apps/web/public/color-lab/THREE-LICENSE.txt`：Three.js MIT 许可。
- `tests/color-lab.test.ts`、`tests/color-lab-browser.py`：状态及实际浏览器验收。
- `package.json`、`pnpm-lock.yaml`：固定 Three.js 与其类型为 0.180.0，本地打包，无 CDN。

## 本机运行

在项目根目录用 PowerShell：

```powershell
$env:VITE_ENABLE_CLOUD_AUTH='true'
$env:VITE_CLASSROOM_NEXT='true'
$env:VITE_EXHIBITION_MODE='false'
pnpm dev --port 5186
```

浏览器打开 `http://127.0.0.1:5186/color-mystery/lab`。依赖安装完成后，新增实验只请求本站资源。静态生产产物位于 `work/classroom-next-site`，可以用 Vite preview 提供本地 HTTP；实验本身可在阻断外部网络的情况下运行，真实课堂账号、上传及作业仍需要云端后端。不支持通过 `file://` 双击 HTML，也没有将云端网站宣称为可冷启动的离线 PWA。本轮不修改或重新生成比赛 EXE。

## 验证记录

本轮测试与发布记录补充于下方；浏览器截图、PNG 和隔离检查保存于本机 `outputs/color-lab/`，不将测试状态或私有发布配置提交到公开代码。

初步检查：`pnpm typecheck`、`pnpm lint` 通过；`pnpm test` 为 41 个文件、278 项通过。`pnpm classroom:next build` 已完成 Vite 生产构建及 Worker dry-run。Vite 有原有大模块、Auth 混合导入和依赖注释提示，未作为构建失败；水母按需模块约 500 KB，gzip 约 130 KB。

本地浏览器检查覆盖三栏目、入口不加载 Three.js、暂停调色、灰度往返、点缀色面积真实画面变化、共享几何/相机/时钟、A/B 参数回显、三档实际粒子数、课堂/抽屉保留同一上下文、真实 PNG、刷新与浏览器前进后退、三次退出释放、可见性处理、失败降级与重试。布局检查为 1280×720、1366×768、1920×1080、768×1024、390×844。

限制：自动浏览器使用 Chrome / SwiftShader，不能代表所有教室显卡的帧率；默认中档，普通设备可切低档。页面可见性暂停由受控 visibility 事件检查；冷启动隔离测试保留本站 HTTP、阻断其他所有来源，并不等同于网站自身具备离线安装能力。后续“月下萤火 / 四季之树 / 星云诞生”只列方向，没有不可用的实验按钮。
