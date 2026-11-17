# 更新与自动部署

DEVFORGE 使用 **GitHub 源码仓库 + 服务器定时拉取** 的方式更新，不覆盖 `data/` 和 `.env`。

```text
本地修改 / 测试 / 提交
        │
        └── git push origin main
                    │
                    ▼
      服务器 devforge-update.timer（每 2 分钟）
                    │
          git fetch / 比较提交
                    │
          ┌─────────┴─────────┐
          │ 没有更新           │ 有更新
          ▼                   ▼
        退出          备份数据库（VACUUM INTO）
                              │
                        git pull --ff-only
                              │
                        pnpm install
                              │
                        pnpm build
                              │
                        systemctl restart
                              │
                        健康检查 /api/health
                         │              │
                       成功           失败
                         │              │
                    完成更新      回滚代码 + 重启
```

## 1. 第一次把项目推到 GitHub

在本地项目目录执行：

```bash
cd devforge
git init -b main
git add .
git commit -m "Initial DEVFORGE release"
```

然后在 GitHub 网页创建一个**公开空仓库**，不要勾选 README / .gitignore / License，再执行：

```bash
git remote add origin https://github.com/你的用户名/devforge.git
git push -u origin main
```

推送前确认：

```bash
git status --short
```

不应该出现：

- `.env`
- `data/`
- `release/`
- `node_modules/`
- `dist/`

这些都已经在 `.gitignore` 里。

## 2. 第一次让服务器接入 GitHub

在服务器 Workbench 终端执行：

```bash
cd /opt/devforge
sudo bash deploy/connect-github.sh https://github.com/你的用户名/devforge.git
```

脚本会：

1. 先备份一次数据库；
2. 把 `/opt/devforge` 初始化为 Git 仓库；
3. 拉取 `main`；
4. 安装依赖、构建前端；
5. 重启 `devforge`；
6. 健康检查；
7. 安装自动更新 timer。

它**不会**执行 `git clean`，所以 `data/`、`.env`、`node_modules/`、`dist/` 都会保留。

## 3. 日常更新

本地修改后：

```bash
git add .
git commit -m "更新内容"
git push origin main
```

服务器会在 2 分钟内自动检查并更新。

想立刻更新，不等 2 分钟：

```bash
sudo systemctl start devforge-update.service
tail -f /var/log/devforge-update.log
```

手动查看是否有新提交：

```bash
cd /opt/devforge
git fetch origin main
git log --oneline HEAD..origin/main
```

## 4. 数据安全

更新脚本的设计原则：

- `data/`、`.env` 不在 Git 中；
- 更新前先执行 `server/backup.js`，生成 SQLite 快照；
- `git pull` 使用 `--ff-only`，不产生合并；
- 不运行 `git clean`；
- 构建失败 / 健康检查失败时，自动 `git reset --hard` 回滚代码；
- 回滚只回滚代码，**不会自动覆盖数据库**，避免丢掉更新期间的新数据；
- 上传目录 `data/uploads` 完全不动。

如果某次更新包含不兼容的数据库迁移，并且旧代码无法运行：

1. 停止服务；
2. 找到更新前的快照 `data/backups/devforge-*.db`；
3. 替换 `data/devforge.db`；
4. 启动服务。

## 5. 失败保护

如果某个提交更新失败，脚本会把该提交写入：

```text
data/.update-failed
```

之后每 2 分钟会跳过这个提交，避免无限重启；等你推送新提交后才会再次尝试。

查看失败原因：

```bash
tail -n 100 /var/log/devforge-update.log
journalctl -u devforge -n 80 --no-pager
```

## 6. 分支策略

默认自动更新跟随 `main`，也就是**每次 push 到 main 都会上线**。

更稳的做法：

1. 平时在 `main` 开发、测试；
2. 准备上线时合并到 `production`；
3. 服务器只跟 `production`。

配置：

```bash
sudo UPDATE_BRANCH=production bash /opt/devforge/deploy/install-auto-update.sh
```

之后服务器只检查 `production` 分支。

## 7. 暂停 / 恢复 / 日志

```bash
# 暂停
sudo systemctl disable --now devforge-update.timer

# 恢复
sudo systemctl enable --now devforge-update.timer

# 查看下次检查时间
systemctl list-timers --all | grep devforge-update

# 实时日志
tail -f /var/log/devforge-update.log

# 手动执行一次
sudo systemctl start devforge-update.service
```

## 8. CI

GitHub Actions 会在每次 push / PR 时：

- 安装依赖
- TypeScript 检查 + Vite 构建
- `node --check` 后端文件
- 启动一次服务器并检查 `/api/health`

工作流文件：`.github/workflows/ci.yml`。

## 9. 注意事项

- 自动更新意味着 `main` 分支就是生产分支；不要把半成品直接 push 到 main。
- 公开仓库意味着任何人都能看到源码和管理入口路径 `/admin`，这没问题；安全性靠强密码、HTTPS 和限流，不靠隐藏路径。
- 不要把 `.env`、数据库、备份、初始化口令提交到 Git。
- 如果使用私有仓库，需要额外给服务器配置 GitHub Deploy Key；本文默认公开仓库。
