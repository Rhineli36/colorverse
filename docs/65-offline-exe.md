# Windows 离线 EXE

本轮使用同一套展示前端，由 Electron 44.9.0 提供浏览器和运行环境，electron-builder 26.15.3 生成 Windows x64 免安装单文件程序。使用者不需要安装 Node.js、浏览器插件或其他开发工具。当前版本号为 1.0.1，前端沿用已发布的 744337b，包含最新 LOGO、导航身份菜单与教师管理页。1.0.0 交付文件保留。

## 使用与数据

- 双击 EXE 启动。首次启动需要解压内置运行环境，耗时取决于电脑及磁盘性能；不会启动命令行窗口。
- 游客可浏览；点击登录后直接选择学生或教师，无需云端账号密码。
- 学生首次填写体验学号、姓名。创建星球、导入图片、交作业后，可退出并切换教师查看消息、评分及留言。
- 图片、知识案例、作业范例和三首配乐均在程序内。音乐默认暂停，手动播放后可循环；重启仍暂停。
- 数据保存在当前 Windows 用户的 `%APPDATA%\ColorverseOffline`，不在临时解压目录。移动 EXE、关闭重开不清空数据；不同电脑及不同 Windows 用户的数据各自独立。
- 点击顶部“学生”或“教师”身份菜单，可以退出登录或重新开始。退出登录只切换身份；“重新开始”需要确认，恢复初始示例。它不访问云端课堂或评审数据。
- 离线“导入学生”保留功能说明，不创建真实账号。真实批量账号开通、激活和课堂同步在云端操作。
- 同时双击多次会复用已有窗口。修改图片时保持调整边框可操作。
- 1.0.1 与旧版使用同一本机存档目录，升级不自动清空体验数据。运行新版前请先关闭旧版窗口，避免单窗口机制继续显示已打开的旧版。

免安装启动器使用 `unpackDirName: true`，每个启动进程使用独立临时解压目录。不能改成固定解压目录：第二次启动退出时会清理自己的目录，固定目录会误伤第一个仍在运行的进程，尤其影响稍后才启动的音频服务。正式存档始终独立保存在 AppData。

原浏览器体验的 IndexedDB 与 EXE 使用独立存储；首次启动 EXE 展示初始示例，不自动迁移原浏览器的体验数据。

## 重建

维护电脑需要 Node.js、pnpm；这些工具只用于构建，不是终端使用者的前提。

```powershell
pnpm install --frozen-lockfile
pnpm package:desktop
```

`package:desktop` 先生成离线前端，再将静态页面、素材、许可证及桌面外壳写入 app.asar。明确排除整个 node_modules，避免把云端依赖或本地开发目录一起打包。产物位于 `outputs/desktop-build/色彩星球-离线版-1.0.1-x64.exe`，版本号以 `desktop/package.json` 为准。首次构建需要下载 Electron、NSIS 等构建资源。

若刚完成 `pnpm cloud:deploy`，可执行 `pnpm package:desktop --reuse-site`，使用该次部署生成的 `work/competition-site`，让 EXE 与云端展示版使用同一份静态构建。`desktop-release.json` 记录实际前端 releaseId、sourceRevision 和运行环境版本。

`desktop/main.mjs` 只提供本地 `colorverse://app/` 资源协议，没有对外 HTTP 服务器。渲染器关闭 Node 接入、启用沙箱和上下文隔离；程序内部禁止 HTTP/HTTPS 请求。教学来源链接仅在用户主动点击时交给系统浏览器。Pixi 的现有动态着色器生成需要 CSP 中的 unsafe-eval，其作用限定于无 Node 权限的本地渲染器。

Windows Squirrel 安装包不是本轮目标，electron-winstaller 的安装脚本明确不执行。

## 验证

```powershell
python tests/desktop_browser.py --exe "outputs/desktop-build/色彩星球-离线版-1.0.1-x64.exe" --out "outputs/desktop-tests-1.0.1"
```

此脚本需要开发用 Python Playwright，使用独立临时测试档案；不修改用户正常体验存档。它从 PATH 排除 Node，启动实际单文件 EXE，并将渲染器设为离线，验证首次身份、图像调整、粒子光晕预览、交作业、教师通知与评分、三首音乐、完整退出重启后的保存和重新开始流程，也检查本轮新增的身份菜单、教师列表缩略图、搜索与真实点评进度。使用以上命令时结果写入 `outputs/desktop-tests-1.0.1/acceptance.json`。

程序尚未购买商业代码签名证书。本机 Windows 11 x64 的验证不等同于其他系统的实机测试；发给评委前宜在另一台 Windows 电脑试开。

## 素材与许可

Electron 的许可和 Chromium 第三方声明随运行环境打包。前端依赖的许可证副本及索引放在包内 `site/licenses/frontend`。项目既有图片来源和教学资料随展示页面保留；三首程序化原创配乐沿用项目内 CC0 说明。交付目录提供独立的使用说明与许可说明。
