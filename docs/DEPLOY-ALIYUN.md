# 部署到阿里云 · 完整步骤

> 目标：一台阿里云大陆服务器，绑定域名并通过 ICP 备案，用 HTTPS 访问你自己的 DEVFORGE。
> 系统按 **Ubuntu 22.04 / 24.04 LTS** 编写。全程大约 30–60 分钟，备案另需 1–3 周。

## 0. 先看结论

推荐配置：

| 项目 | 选择 |
| --- | --- |
| 服务器 | 阿里云 **ECS 99 元 e 实例**，或轻量应用服务器，**2 核 2G / 40–60GB SSD / 3Mbps 以上** |
| 地域 | 离你近的大陆地域（杭州 / 上海 / 北京 / 深圳 / 成都 / 广州） |
| 系统 | **Ubuntu 22.04 LTS 或 24.04 LTS** |
| 域名 | `.com` 或 `.cn`，在阿里云购买并完成实名认证 |
| 备案 | 大陆服务器 + 域名必须 ICP 备案 |
| HTTPS | certbot + Let's Encrypt，免费 |
| 数据库 | SQLite，随应用自动创建，无需单独安装 |

ECS 99 元档的具体规格是：**经济型 e（ecs.e-c1m1.large），2 核 2G，3M 固定带宽，40G ESSD Entry，1 年**。这个配置跑 DEVFORGE 足够。

费用大致：ECS 99 元/年或轻量 ¥60–120/月，域名 ¥30–100/年，HTTPS 免费。以阿里云控制台实际价格为准。

**不要买 1 核 1G**。Node 构建和 SQLite 虽然不重，但 2G 内存更稳。

---

## 1. 购买服务器

### 方案 A：ECS 99 元 e 实例（推荐给个人）

在 99 计划 / 活动页选择：

1. 实例：**经济型 e**，规格 `ecs.e-c1m1.large`。
2. 配置：**2 vCPU / 2 GiB / 3M 固定带宽 / 40G ESSD Entry**。
3. 镜像：**Ubuntu 24.04 LTS 64 位**（如果只有 22.04，也完全兼容）。
4. 地域：北京 / 杭州 / 上海 / 深圳 / 成都 / 广州等**大陆地域**。
5. 购买时长：**1 年**（申请备案服务号要求 ≥3 个月）。
6. 公网 IP：下单页确认「分配公网 IPv4 地址」；如果没有，绑定 EIP。
7. 登录方式：设置 root 密码，或绑定 SSH 密钥。

### 方案 B：轻量应用服务器

在阿里云控制台购买「轻量应用服务器」：

1. 地域：选大陆地域（例如华东1·杭州）。
2. 镜像：**Ubuntu 22.04 或 24.04 LTS**。
3. 套餐：2 核 2G，40GB 以上 SSD，带宽 3Mbps 以上。
4. 购买时长：**至少 3 个月**。申请 ICP 备案需要备案服务号，通常要求服务器购买时长 ≥3 个月（以阿里云页面为准）。
5. 公网 IP：选择分配公网 IPv4。
6. 登录方式：设置 root 密码，或绑定 SSH 密钥。

购买完成后，在控制台记下**公网 IP**，并用「远程连接 / Workbench」登录服务器。

> ECS 和轻量应用服务器的安全组/防火墙入口名称不同，但都是放行 22 / 8080 / 80 / 443，部署流程完全一样。

---

## 2. 域名与 ICP 备案

### 2.1 买域名

在阿里云「域名」控制台购买一个 `.com` 或 `.cn` 域名，完成**实名认证**。

域名实名认证通过后才能提交备案。

### 2.2 申请备案服务号

在轻量应用服务器 / ECS 控制台找到「备案」入口，申请**备案服务号**。

> 备案服务号通常要求服务器购买时长 ≥3 个月，且一台服务器可申请的备案数量有限。以阿里云页面说明为准。

### 2.3 提交 ICP 备案

阿里云 App 或控制台 →「备案」→ 开始备案：

- 主体信息：身份证、手机号、地址；
- 网站信息：网站名称、域名、服务内容；
- 网站负责人核验：按提示做人脸识别；
- 提交后等待管局审核，通常 **1–3 周**。

备案期间，网站一般需要关闭。你可以：

- 先不开放 8080；
- 或只在自己电脑上通过 SSH 隧道访问；
- 等备案通过后再绑定域名并开放 80/443。

### 2.4 备案通过后

1. 在网站底部展示 ICP 备案号。DEVFORGE 支持在 `.env` 里配置：
   ```bash
   ICP_NUMBER=浙ICP备2026000000号-1
   ICP_LINK=https://beian.miit.gov.cn/
   ```
   配置后，总览页底部和设置页会显示备案号。
2. 按当地要求完成**公安联网备案**（通常备案通过后 30 天内）。
3. 再做下面的域名解析和 HTTPS。

> 参考：[阿里云 ICP 备案说明](https://www.alibabacloud.com/help/zh/icp-filing/basic-icp-service/product-overview/icp-filing-requirements-for-a-regular-website)

---

## 3. 配置安全组

在轻量应用服务器控制台 →「防火墙 / 安全组」，放行入方向：

| 端口 | 用途 | 建议 |
| --- | --- | --- |
| 22 | SSH | 尽量限制为你的固定 IP |
| 8080 | 备案前临时访问 | 备案完成后关闭 |
| 80 | HTTP / 证书验证 | 备案后开放 |
| 443 | HTTPS | 备案后开放 |

**不要放行 3000**。Node 只监听 `127.0.0.1:3000`，由 Nginx 反向代理。

如果服务器内启用了 ufw，安装脚本会自动放行 22/8080/80/443；安全组仍需在阿里云控制台单独配置。

---

## 4. 上传发布包

在本地项目目录生成发布包（或直接使用已生成的 `release/devforge-1.0.0.zip`）：

```bash
python tools/package_release.py
```

发布包结构：

```text
devforge-1.0.0.zip
└── devforge/
    ├── dist/            # 已构建的前端
    ├── server/          # 后端
    ├── deploy/          # 安装、Nginx、HTTPS、备份脚本
    ├── docs/
    ├── package.json
    ├── pnpm-lock.yaml
    └── .env.example
```

### 方式 A：Workbench 上传

1. 阿里云控制台 → 服务器 →「远程连接」→ Workbench。
2. 使用文件上传功能，把 zip 上传到 `/root/`。
3. 在终端执行：

```bash
apt-get update
apt-get install -y unzip
mkdir -p /opt
unzip -o /root/devforge-1.0.0.zip -d /opt
ls /opt/devforge
```

### 方式 B：本地 scp

```powershell
scp .\release\devforge-1.0.0.zip root@你的公网IP:/root/
```

然后 SSH 登录服务器，执行上面的解压命令。

> 发布包不含 `data/` 和 `.env`，所以覆盖安装不会删掉你的数据。

---

## 5. 一键安装

```bash
sudo bash /opt/devforge/deploy/install-ubuntu.sh
```

脚本会：

1. 安装 `curl`、`xz`、`nginx`、`openssl`；
2. 从 npmmirror 下载 Node 24 到 `/opt/node`；
3. 安装 pnpm 11；
4. 安装生产依赖；
5. 创建系统用户 `devforge`；
6. 生成 `.env` 和随机 `SETUP_TOKEN`；
7. 创建 `data/uploads`、`data/backups`；
8. 安装并启动 `devforge.service`；
9. 配置 Nginx：`8080 -> 127.0.0.1:3000`；
10. 关闭 Nginx 默认站点，避免备案前 80 端口暴露。

看到下面这样的输出就成功了：

```text
 DEVFORGE 已安装并启动
 公网访问地址:  http://<阿里云公网IP>:8080
 首次设置口令:  xxxxxxxxxxxxxxxx
```

### 如果安装失败

```bash
systemctl status devforge
journalctl -u devforge -n 100 --no-pager
nginx -t
```

常见原因：

- 服务器不是 Ubuntu，脚本里的 apt 命令不可用；
- 服务器无法访问 npmmirror；
- 8080 被其他程序占用；
- 发布包不完整（缺少 `dist` 或 `server`）。

---

## 6. 首次初始化

1. 浏览器打开 `http://你的公网IP:8080`。
2. 输入终端里打印的**首次设置口令**。
3. 设置管理员用户名和密码（密码至少 8 位）。
4. 初始化完成后会自动创建「启程」模块和两张示例页面。

初始化成功后：

- **公开站点**：`http://你的公网IP:8080/`
- **管理入口**：`http://你的公网IP:8080/admin`
- 公开站点只显示「公开」模块；管理员登录后才能看到私密模块。
- `/admin` 不出现在公开导航里，建议直接收藏。
- `data/setup-token.txt` 会被删除；
- 初始化接口永久关闭，不会再有第二个账号；
- 账号密码只保存在你自己的服务器，公开页面不显示管理员账号。

> 如果忘了设置口令：查看 `/opt/devforge/.env` 里的 `SETUP_TOKEN`，或 `journalctl -u devforge | grep 初始化口令`。
> 如果已经初始化过，设置口令不再有效；忘记密码见「重置管理员密码」。

### 公开 / 私密怎么切换

登录后：

- 模块列表 → 模块右侧 `···` →「设为私密」或「公开到网站」；
- 或模块编辑框底部「公开到网站」开关；
- 或模块页右上角 `···`。

设为私密后，公开站点、公开搜索和公开页面会立即隐藏该模块；管理员仍然可以在登录状态访问和编辑。

设置页还有「预览公开站点」按钮，可以用访客视角检查公开效果，再返回管理。

---

## 7. 域名解析

在阿里云「云解析 DNS」添加记录：

| 记录类型 | 主机记录 | 记录值 | TTL |
| --- | --- | --- | --- |
| A | `@` | 服务器公网 IP | 10 分钟 |
| A | `www` | 服务器公网 IP | 10 分钟 |

等待几分钟，在本机检查：

```bash
nslookup dev.example.com
```

确认解析到你的公网 IP，再继续下一步。

**必须等 ICP 备案通过后再开放 80/443**，否则可能被拦截，证书申请也会失败。

---

## 8. 绑定域名 + HTTPS

确认：

- 备案已通过；
- 域名已解析到服务器；
- 安全组已放行 80 和 443；
- Nginx 正在运行。

执行：

```bash
sudo bash /opt/devforge/deploy/enable-https.sh dev.example.com you@example.com
```

脚本会：

1. 安装 certbot；
2. 写入域名站点配置；
3. 申请 Let's Encrypt 证书；
4. 自动把 HTTP 跳转到 HTTPS；
5. 关闭 8080 明文入口。

成功后访问 `https://dev.example.com`。

### 证书自动续期

```bash
systemctl status certbot.timer
sudo certbot renew --dry-run
```

certbot 会通过 systemd timer 自动续期。

### 如果 Let's Encrypt 申请失败

常见原因：

- 域名没有解析到这台服务器；
- 备案未通过，80 端口被拦；
- 安全组没有放行 80/443；
- 服务器无法访问外网。

修复后重新运行 `enable-https.sh`。

备选：在阿里云「SSL 证书」控制台申请免费证书，下载 Nginx 格式，手动配置：

```nginx
server {
    listen 443 ssl http2;
    server_name dev.example.com;

    ssl_certificate     /etc/nginx/ssl/dev.example.com.pem;
    ssl_certificate_key /etc/nginx/ssl/dev.example.com.key;

    client_max_body_size 30m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 9. 备份

### 手动备份

```bash
sudo bash /opt/devforge/deploy/backup.sh
```

会做两件事：

1. 用 `VACUUM INTO` 生成 SQLite 快照，保留最近 14 份；
2. 把 `data/uploads` 打成 tar.gz，保留最近 14 天。

输出在：

```text
/opt/devforge/data/backups/
```

### 每天自动备份

```bash
sudo crontab -e
```

加入：

```cron
20 3 * * * /bin/bash /opt/devforge/deploy/backup.sh >> /var/log/devforge-backup.log 2>&1
```

### 备份到阿里云 OSS

最简单的两种方式：

1. 在阿里云 OSS 控制台创建 Bucket，用 `ossutil` 定时同步 `data/backups/`；
2. 用 OSS 控制台的「数据导入 / 迁移」或本地电脑定期下载。

建议至少保留一份**不在同一台服务器上**的备份。

### 恢复

```bash
sudo systemctl stop devforge
sudo cp /opt/devforge/data/backups/devforge-YYYYMMDD-HHMMSS.db /opt/devforge/data/devforge.db
# 如果 uploads 也需要恢复：
# sudo tar -xzf /opt/devforge/data/backups/uploads-YYYYMMDD-HHMMSS.tar.gz -C /opt/devforge/data
sudo chown -R devforge:devforge /opt/devforge/data
sudo systemctl start devforge
```

---

## 10. 更新版本

```bash
# 1. 先备份
sudo bash /opt/devforge/deploy/backup.sh

# 2. 上传新发布包到 /root，解压覆盖（不会动 data/ 和 .env）
sudo unzip -o /root/devforge-1.0.0.zip -d /opt

# 3. 安装生产依赖并重启
cd /opt/devforge
sudo env npm_config_registry=https://registry.npmmirror.com /opt/node/bin/pnpm install --prod --frozen-lockfile
sudo systemctl restart devforge

# 4. 检查
curl -fsS http://127.0.0.1:3000/api/health
systemctl status devforge
```

浏览器端如果还是旧界面：

- 普通刷新；
- 或在开发者工具 → Application → Service Workers → Update；
- 或清除站点数据后重新打开（不会影响服务器数据）。

---

## 11. 日常运维

```bash
systemctl status devforge          # 服务状态
journalctl -u devforge -f          # 实时日志
systemctl restart devforge         # 重启
nginx -t                           # 检查 Nginx 配置
systemctl reload nginx             # 重载 Nginx
df -h                              # 磁盘
du -sh /opt/devforge/data          # 数据大小
```

修改 `.env` 后必须重启：

```bash
sudo systemctl restart devforge
```

### 重置管理员密码

```bash
sudo runuser -u devforge -- /opt/node/bin/node /opt/devforge/server/reset-password.js admin 新密码
```

执行后会退出所有已登录会话。

---

## 12. 常见问题

### 502 Bad Gateway

Node 服务没起来：

```bash
systemctl status devforge
journalctl -u devforge -n 100 --no-pager
```

常见原因：`.env` 格式错误、`data/` 权限不对、端口 3000 被占用。

### 8080 打不开

1. 阿里云安全组是否放行 8080；
2. 服务器内 `curl http://127.0.0.1:3000/api/health` 是否正常；
3. `curl http://127.0.0.1:8080/api/health` 是否正常；
4. Nginx 是否运行：`systemctl status nginx`。

### 初始化口令不正确

```bash
grep SETUP_TOKEN /opt/devforge/.env
```

如果修改了 `.env`，重启服务：

```bash
sudo systemctl restart devforge
```

### 登录后马上又回到登录页

- 正式环境请使用 HTTPS；
- 如果用 HTTP 测试且无法登录，在 `.env` 加 `COOKIE_SECURE=false`，重启；
- 确认系统时间正确（`date`）。

### 上传图片报 413

同时检查两个地方：

1. `.env` 的 `MAX_UPLOAD_MB`（默认 25）；
2. Nginx 的 `client_max_body_size`（模板里是 30m）。

改完重启 Node 和 Nginx。

### 图片显示 401 / 裂图

- 公开页面里的图片走 `/api/public/assets/`，不需要登录；
- 管理端页面里的图片走 `/api/assets/`，需要管理员会话；
- 确认浏览器没有禁用 Cookie；
- 通过同一个域名访问，不要一半 IP 一半域名；
- `data/uploads` 存在且 `devforge` 用户可读。

如果公开页面里的图片裂了，检查该图片是否是由旧版本上传的、页面是否确实公开，以及 `data/uploads` 权限。

### 搜索变慢 / SQLITE_BUSY

- 不要同时运行多个 DEVFORGE 实例；
- 不要用其他程序长期占用数据库；
- 数据量很大时再考虑迁移 PostgreSQL。

### 忘记备案号 / 备案被驳回

以阿里云备案控制台为准。网站上线后记得在 `.env` 填 `ICP_NUMBER`，总览页底部会显示。

### PWA 还是旧版本

Service Worker 会缓存前端资源。强制刷新或清除站点数据即可；服务器数据不受影响。

---

## 13. 安全清单

上线前逐项确认：

- [ ] 已启用 HTTPS，HTTP 自动跳转
- [ ] 管理员密码 ≥12 位，且没有在其他地方使用
- [ ] 已检查哪些模块设为「公开」，私密笔记没有误公开
- [ ] 管理入口 `/admin` 已收藏，没有从公开页面链接出去
- [ ] 公开页面和登录页都没有显示管理员用户名或密码
- [ ] SSH 22 端口限制为自己的 IP，优先使用密钥登录
- [ ] 安全组只开放 22 / 80 / 443，8080 已关闭
- [ ] 没有把 3000 端口暴露到公网
- [ ] 每天自动备份，并且有一份异地备份
- [ ] `.env` 权限为 600，没有被提交到 Git
- [ ] 系统定期 `apt update && apt upgrade`
- [ ] 已填写 ICP 备案号
- [ ] 已测试恢复流程（不只是生成备份）

---

## 14. 可选：Docker + Caddy

如果你更习惯 Docker，并且服务器能正常拉取 Docker Hub 镜像：

```bash
cd /opt/devforge
cp .env.example .env
# 编辑 .env：
#   SITE_ADDRESS=你的域名
#   SETUP_TOKEN=随机字符串
#   HTTP_PORT=80
#   HTTPS_PORT=443
docker compose up -d --build
```

- `SITE_ADDRESS=:80` + `HTTP_PORT=8080`：IP 测试，纯 HTTP。
- `SITE_ADDRESS=dev.example.com`：Caddy 自动申请 HTTPS。
- 大陆服务器拉取 `node:24-bookworm-slim` 和 `caddy:2-alpine` 可能较慢，必要时配置阿里云容器镜像加速。

数据仍然在 `./data`，备份脚本可以复用。

> 对大陆服务器，优先推荐原生 systemd + Nginx 方案，依赖更少，排错更直接。

---

## 15. 费用参考

| 项目 | 大致费用 | 说明 |
| --- | --- | --- |
| ECS 经济型 e 2C2G | ¥99/年 | 99 计划，3M / 40G，需确认活动资格与续费规则 |
| 轻量应用服务器 2C2G | ¥60–120/月 | 促销价差异较大 |
| 域名 | ¥30–100/年 | `.com` / `.cn` |
| ICP 备案 | 免费 | 需要时间 |
| HTTPS | 免费 | Let's Encrypt |
| 备份到 OSS | 几元/月 | 取决于容量 |
| 服务器快照 | 可选 | 建议每月一次 |

个人单管理员使用，2 核 2G 足够。图片和附件很多时，再考虑把 `data/uploads` 迁到阿里云 OSS。
