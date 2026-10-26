# SHEYUAN-ui 部署运行说明（Ubuntu 22.04）

项目文件放到服务器后，按下面的步骤操作即可。宿主机只需要 Docker，不需要安装 Node.js、npm 或 Nginx。

## 一、进入项目目录

```bash
cd ~/SHEYUAN-ui          # 换成项目实际所在目录
ls docker-compose.yml    # 能看到这个文件，说明目录正确
```

## 二、安装 Docker（已安装可跳过）

先检查：

```bash
docker compose version
```

提示命令不存在时，执行：

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

执行完最后一行后，**退出 SSH 重新登录**（或执行 `newgrp docker`），之后使用 Docker 不需要 `sudo`。

## 三、构建并启动

```bash
cd ~/SHEYUAN-ui
docker compose up -d --build
```

第一次构建需要下载 Node.js、Nginx 基础镜像和前端依赖，约 3–5 分钟。看到 `Started` 即启动成功。

检查运行状态：

```bash
docker compose ps
curl -I http://localhost:8080
```

第二条命令返回 `HTTP/1.1 200 OK` 表示正常。

## 四、在浏览器打开

查服务器 IP：

```bash
hostname -I
```

例如输出 `192.168.1.50 ...`，就在浏览器访问：

```
http://192.168.1.50:8080
```

只能本机访问时，放行防火墙端口：

```bash
sudo ufw allow 8080/tcp
```

登录页输入任意账号和密码即可进入（当前为前端演示校验）。

## 五、日常命令

```bash
docker compose stop      # 停止
docker compose start     # 启动
docker compose restart   # 重启
docker compose logs -f   # 查看日志，Ctrl+C 退出
docker compose down      # 停止并删除容器（不删代码）
```

更新版本：代码更新后，在项目目录执行：

```bash
docker compose up -d --build
```

## 六、常见问题

**打不开网页**

```bash
docker compose ps                     # 状态应为 running
docker compose logs --tail=50         # 看报错
curl -I http://localhost:8080         # 服务器本机是否 200
```

**8080 端口被占用**

修改 `docker-compose.yml` 中的 `"8080:80"`，把 8080 换成其他端口，再执行：

```bash
docker compose up -d
```

**构建时下载失败**

服务器需要能访问 Docker Hub 和 npm 源。内网环境可在能联网的机器上构建镜像，再导出到服务器：

```bash
docker save sheyuan-ui:latest -o sheyuan-ui.tar   # 联网机器
docker load -i sheyuan-ui.tar                     # 服务器
docker compose up -d                              # 不加 --build
```

**三维手模不显示**

三维部分由浏览器渲染，请使用 Chrome 或 Edge 打开，并确认显卡加速未关闭。
