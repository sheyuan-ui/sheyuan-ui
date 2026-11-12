# SHEYUAN-ui

机器人双手操作演示界面。React 19 + TypeScript + Vite + three.js，纯前端，无后端接口和数据库。

## 环境要求（Windows）

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Windows 10 / 11（或 Windows Server 2016 及以上） |
| Node.js | 20 以上，推荐 22 LTS |
| npm | 随 Node.js 一起安装 |
| 浏览器 | Chrome / Edge，开启硬件加速 |
| 编辑器 | VS Code（推荐） |

## 首次运行

1. 安装 Node.js 22 LTS：<https://nodejs.org/>，按默认选项安装，安装完成后重新打开命令行。
2. 在项目目录双击 `dev-windows.bat`；也可以在命令行手动执行：

```bat
npm ci
npm run dev
```

3. 浏览器打开终端里显示的地址，默认是 <http://localhost:5174>。
4. 登录页输入任意非空账号和密码即可进入（当前为前端演示校验）。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器，支持热更新 |
| `npm run build` | 类型检查 + 生产构建，输出到 `dist` |
| `npm run preview` | 本地预览生产构建 |
| `npm run lint` | 使用 oxlint 做静态检查 |

## 局域网预览

开发服务器监听 `0.0.0.0`，同一局域网的同事可以用 `http://本机IPv4:5174` 访问。首次访问需要在 Windows 防火墙中放行 Node.js 或 5174 端口。

## Windows 常见问题

**依赖下载慢**

```bat
npm config set registry https://registry.npmmirror.com
```

**端口被占用**

终端会打印实际使用的端口；也可以在 `vite.config.ts` 的 `server.port` 中固定端口。

**不要用 file:// 直接打开 index.html**

项目使用 ES Module 和静态资源路径，必须通过开发服务器访问。

**改了文件页面不刷新**

不要把项目放在同步盘或网络盘；`vite.config.ts` 已忽略 `release`、`dist` 和临时文件，避免 Windows 文件锁导致开发服务器退出。

**开发服务器总是退出**

先关闭正在运行的 `npm run dev`，确认没有杀毒软件或编辑器占用 `node_modules`，然后重新启动。

## 目录结构

```
src/
  components/   界面模块（顶栏、视频、手部姿态、右侧视图、底部标注等）
  contexts/     播放与通知状态
  theme/        颜色与排版令牌
  utils/        手部关键点与动作数据
public/
  models/       三维手部模型
  modules/      界面图片资源
deploy/windows/ IIS 部署配置与建站脚本
scripts/        Windows 打包脚本
```

## 部署到 Windows 服务器

需要交付到 Windows 服务器时，见 [DEPLOY.md](DEPLOY.md)（IIS 静态站点）。日常开发不需要 IIS、Docker 或 Nginx。

## 代码交接

- `node_modules`、`dist`、`release` 已在 `.gitignore` 中忽略，不需要提交。
- 换行符由 `.gitattributes` 统一：源码使用 LF，`.bat` / `.ps1` 使用 CRLF。
- 本地备份目录和压缩包不要提交到仓库。
