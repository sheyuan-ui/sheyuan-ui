# SHEYUAN-ui 部署运行说明（Windows + IIS）

## 交付给客户

只把 `release\SHEYUAN-ui-windows.zip` 发给客户即可。发布包内已经包含编译好的网页、IIS 配置、建站脚本和操作手册，不需要发送源码、`node_modules` 或 `dist`。

客户服务器需要满足：Windows Server 2016 及以上，或 Windows 10 / 11 专业版、企业版；已安装或允许安装 IIS；8080 端口可用。

客户拿到 zip 后按本说明操作：解压 → 确认/安装 IIS → 管理员运行 `install-iis-site.ps1` → 浏览器访问 `http://服务器IP:8080`。

本说明适用于 Windows 10 / Windows 11 / Windows Server 2016 及以上系统。整套流程分两步：**在开发机打包**，**在服务器用 IIS 托管**。

服务器只需要 IIS，不需要安装 Node.js、npm、Docker 或 Nginx。打包用的 Node.js 只装在开发机上。

## 一、交付内容

| 文件 / 目录 | 作用 | 放在哪台机器 |
| --- | --- | --- |
| `build-windows.bat` | 双击即可打包 | 开发机 |
| `scripts\build-windows.ps1` | 打包脚本：安装依赖、编译、生成发布包 | 开发机 |
| `deploy\windows\web.config` | IIS 站点配置：默认文档、MIME、缓存、关闭目录浏览 | 随发布包进入站点目录 |
| `deploy\windows\install-iis-site.ps1` | 服务器辅助脚本：创建应用池、站点、权限和防火墙 | 服务器 |
| `release\SHEYUAN-ui-windows.zip` | 打包产物，发给客户部署 | 服务器 |
| `SHEYUAN-ui 运行操作手册.docx` | 图文操作手册，随发布包一起交付 | 服务器 |
| `DEPLOY.md` | 本说明 | 两处都可保留 |

发布包解压后包含：

```
SHEYUAN-ui\
  index.html          网页入口
  web.config          IIS 配置
  assets\             编译后的 JS / CSS
  models\             三维手部模型
  modules\            界面图片资源
  favicon.svg
install-iis-site.ps1  服务器建站脚本
部署说明.md           本说明
SHEYUAN-ui 运行操作手册.docx
```

网页是纯静态前端，没有后端接口和数据库。服务器上不会出现 `node_modules`，也不需要执行 `npm install`。

## 二、在开发机打包

### 1. 安装 Node.js

到 <https://nodejs.org/> 下载 **Node.js 22 LTS** 安装包，按默认选项安装。安装完成后重新打开命令行，确认：

```bat
node -v
npm -v
```

能显示版本号即可。Node.js 只需要装在开发机。

### 2. 一键打包

进入项目目录，双击 `build-windows.bat`。也可以在 PowerShell 中执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1
```

脚本依次完成：

1. 执行 `npm ci` 安装前端依赖（首次需要联网下载，约 1–3 分钟）；
2. 执行 `npm run build` 编译前端；
3. 把 `dist` 内容、`web.config`、建站脚本和部署说明整理到 `release\`；
4. 生成 `release\SHEYUAN-ui-windows.zip`（约 2 MB）。

看到“打包完成”即成功。

### 3. 只重新编译

依赖没有变化、只想重新编译时：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1 -SkipInstall
```

### 4. 内网下载慢

在开发机设置 npm 镜像后重试：

```bat
npm config set registry https://registry.npmmirror.com
```

## 三、在服务器安装 IIS

已安装 IIS 可跳过本章。

### 1. 图形界面安装

打开“控制面板 → 程序 → 启用或关闭 Windows 功能 → Internet Information Services”，至少勾选：

- **Web 管理工具**：IIS 管理控制台、IIS 管理脚本和工具；
- **万维网服务 → 常见 HTTP 功能**：默认文档、静态内容、HTTP 错误；
- **万维网服务 → 性能功能**：静态内容压缩（可选，用于压缩 JS/CSS）。

确定后等待安装完成。

### 2. PowerShell 安装（管理员）

Windows 10 / Windows 11：

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole,IIS-WebServer,IIS-CommonHttpFeatures,IIS-StaticContent,IIS-DefaultDocument,IIS-HttpErrors,IIS-HttpCompressionStatic,IIS-ManagementConsole,IIS-ManagementScriptingTools -All
```

Windows Server：

```powershell
Install-WindowsFeature Web-Server,Web-Static-Content,Web-Default-Doc,Web-Http-Errors,Web-Http-Compression,Web-Mgmt-Console,Web-Scripting-Tools -IncludeManagementTools
```

安装后浏览器访问 `http://localhost`，能看到 IIS 欢迎页说明安装成功。

> 本站不使用前端路由，**不需要安装 URL Rewrite 模块**。

## 四、部署网站

### 1. 拷贝文件

把 `SHEYUAN-ui-windows.zip` 拷到服务器，解压到 `C:\inetpub`，得到站点目录 `C:\inetpub\SHEYUAN-ui`。确认该目录下直接能看到 `index.html` 和 `web.config`，不要再多套一层 `SHEYUAN-ui` 文件夹：

```
C:\inetpub\SHEYUAN-ui\
  index.html
  web.config
  assets\
  models\
  modules\
  favicon.svg
```

### 2. 创建站点（推荐）

把 zip 中的 `install-iis-site.ps1` 一并解压到服务器任意位置。以**管理员身份**打开 PowerShell，进入脚本所在目录：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-iis-site.ps1 -SitePath "C:\inetpub\SHEYUAN-ui" -Port 8080
```

脚本会：

- 创建应用程序池 `sheyuan-ui`（无托管代码）；
- 创建站点 `sheyuan-ui`，绑定 8080 端口；
- 授予 `IIS_IUSRS` 读取权限；
- 在 Windows 防火墙放行 8080 端口；
- 启动站点并打印访问地址。

脚本可以重复执行，用于更新站点路径或端口，不会重复创建站点。

### 3. 手动创建（IIS 管理器）

1. 打开 IIS 管理器，进入“应用程序池 → 添加应用程序池”，名称填 `sheyuan-ui`，.NET CLR 版本选“无托管代码”；
2. 进入“网站 → 添加网站”，网站名称 `sheyuan-ui`，物理路径 `C:\inetpub\SHEYUAN-ui`，端口 `8080`，应用程序池选 `sheyuan-ui`；
3. 管理员 PowerShell 放行端口：

```powershell
New-NetFirewallRule -DisplayName "SHEYUAN-ui 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

### 4. 检查状态

在服务器本机执行（Windows Server 2016 默认没有 `curl.exe`，下面的命令在 2016 及以上通用）：

```powershell
(Invoke-WebRequest http://localhost:8080 -UseBasicParsing).StatusCode
```

返回 `200` 表示正常。IIS 日志位于 `C:\inetpub\logs\LogFiles`。

## 五、在浏览器打开

1. 在服务器执行 `ipconfig`，记下 IPv4 地址，例如 `192.168.1.50`；
2. 在同一网络的电脑上访问：

```
http://192.168.1.50:8080
```

服务器本机也可以直接用 `http://localhost:8080`。登录页输入任意非空账号和密码即可进入（当前为前端演示校验，尚未接入后端账号系统）。

如果服务器本机能打开、其他电脑打不开，请检查 Windows 防火墙入站规则，以及云服务器的安全组或网络策略是否放行 8080。

建议使用 Chrome 或 Edge，并保持硬件加速开启，以保证三维手部模型流畅显示。

## 六、日常运维

### 1. 开机自启

IIS 服务（W3SVC）默认自动启动，服务器重启后站点自动恢复，无需手工操作。应用程序池按需启动，首次访问会自动拉起。

### 2. 启停

IIS 管理器中右键站点可启动 / 停止，右键应用程序池可回收 / 停止 / 启动。管理员 PowerShell 也可以：

```powershell
Stop-Website -Name "sheyuan-ui"
Start-Website -Name "sheyuan-ui"
Restart-WebAppPool -Name "sheyuan-ui"
```

### 3. 更新版本

1. 在开发机重新打包，得到新的 `SHEYUAN-ui-windows.zip`；
2. 在服务器上停止站点；
3. 清空 `C:\inetpub\SHEYUAN-ui` 中的旧文件（保留目录本身）；
4. 解压新包内容覆盖，确认 `index.html` 和 `web.config` 在根目录；
5. 启动站点，浏览器按 `Ctrl+F5` 强制刷新。

新版本会更换 `assets` 文件名，先清空旧文件可以避免残留资源。站点目录只放发布包内容，不要混入其他业务文件。

### 4. 备份与回滚

直接复制整个 `C:\inetpub\SHEYUAN-ui` 目录即完成备份。需要回滚时，把备份目录覆盖回去并重启站点。网页使用演示数据，刷新页面即恢复初始状态，不涉及数据库迁移。

## 七、常见问题

**打开网页报 500.19**

`web.config` 没有放在站点根目录、内容被改动损坏，或站点物理路径指向错误。确认 `index.html` 与 `web.config` 在同一目录。

**403 / 403.14**

站点根目录缺少 `index.html`；IIS 未安装“默认文档”功能；或目录权限不足。重新运行 `install-iis-site.ps1` 会自动授权 `IIS_IUSRS`。

**404**

物理路径多了一层文件夹（例如指向了 `...\SHEYUAN-ui\SHEYUAN-ui`）。把物理路径改为直接包含 `index.html` 的目录。

**8080 端口被占用**

```powershell
netstat -ano | findstr :8080
```

换一个端口重新建站，例如：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-iis-site.ps1 -Port 8090
```

同时在防火墙放行新端口，访问地址也要改成新端口。

**页面白屏或样式丢失**

按 `F12` 打开开发者工具，查看 Console 和 Network 中 `assets` 是否 404。通常是站点目录不完整或 `web.config` 丢失，重新解压发布包覆盖即可。

**页面还是旧版本**

按 `Ctrl+F5` 强制刷新；确认已清空旧文件并覆盖新包；检查 `assets` 下的文件名是否已经变化。

**三维手部模型不显示**

三维画面由浏览器实时渲染。请使用 Chrome 或 Edge，并确认“使用硬件加速”已开启；远程桌面环境渲染能力受限，建议在本机浏览器访问。

**打包时下载失败**

开发机需要能访问 npm 源。先设置镜像 `npm config set registry https://registry.npmmirror.com` 后重试。服务器端不需要联网，也不需要 Node.js。

## 附录：运行环境

| 项目 | 说明 |
| --- | --- |
| 访问地址 | `http://服务器IP:8080` |
| 运行方式 | IIS 静态站点，应用程序池为“无托管代码” |
| 站点目录 | `C:\inetpub\SHEYUAN-ui` |
| 发布包体积 | 约 2 MB（站点目录约 3 MB） |
| 技术栈 | React 19 + TypeScript + three.js，纯前端 |
| 外部依赖 | 无数据库、无后端接口 |
| 服务器要求 | Windows 10/11 或 Windows Server 2016+，IIS，内存 2 GB 以上 |
| 开发机要求 | Windows + Node.js 22 LTS（仅打包使用） |
| 登录方式 | 前端演示校验，任意非空账号密码 |
| 数据 | 演示数据，刷新页面恢复初始状态 |

如需更换访问端口、绑定域名或启用 HTTPS，可在 IIS 站点绑定中添加；HTTPS 需要提前准备证书。
