#!/usr/bin/env bash
# ==========================================================================
# DEVFORGE - 把现有服务器接到 GitHub 仓库，并安装自动更新
#
# 使用（在服务器上，root）：
#   sudo bash /opt/devforge/deploy/connect-github.sh https://github.com/你的用户名/devforge.git
#
# 可选分支：
#   sudo bash /opt/devforge/deploy/connect-github.sh <仓库地址> production
#
# 安全说明：
#   - data/、.env、node_modules/、dist/ 都不在 Git 里，会被保留；
#   - 不会执行 git clean；
#   - 连接前会先做一次数据库备份；
#   - 只支持公开仓库的 HTTPS 地址（私有仓库需要额外配置 deploy key）。
# ==========================================================================
set -euo pipefail

REPO_URL="${1:-}"
BRANCH="${2:-main}"
APP_DIR="${APP_DIR:-/opt/devforge}"
NODE_BIN="${NODE_BIN:-/opt/node/bin}"
export PATH="${NODE_BIN}:${PATH}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 root 运行：sudo bash $0 <仓库地址> [分支]"
  exit 1
fi

if [[ -z "${REPO_URL}" ]]; then
  echo "用法：sudo bash $0 https://github.com/你的用户名/devforge.git [main]"
  exit 1
fi

if [[ ! -d "${APP_DIR}" ]]; then
  echo "错误：找不到 ${APP_DIR}"
  exit 1
fi

if [[ ! -x "${NODE_BIN}/node" ]] || [[ ! -x "${NODE_BIN}/pnpm" ]]; then
  echo "错误：找不到 ${NODE_BIN}/node 或 ${NODE_BIN}/pnpm"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates

cd "${APP_DIR}"

if [[ -d .git ]] && [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "错误：${APP_DIR} 已有 Git 仓库且存在未提交的源码改动。"
  echo "请先处理这些改动，或备份后手动执行 git reset --hard。"
  exit 1
fi

echo "[1/6] 备份数据库..."
if [[ -f server/backup.js ]]; then
  node server/backup.js || echo "警告：备份失败，但继续接通 Git。请手动检查数据。"
fi

echo "[2/6] 配置 Git..."
if [[ ! -d .git ]]; then
  git init -b "${BRANCH}"
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "${REPO_URL}"
else
  git remote add origin "${REPO_URL}"
fi

git fetch --prune origin "${BRANCH}"
# -f is intentional: the existing release directory is not a Git checkout yet,
# so its tracked source files are "untracked" and would otherwise block checkout.
# data/, .env, node_modules/, dist/ are not in the repo and are left untouched.
git checkout -f -B "${BRANCH}" "origin/${BRANCH}"

echo "[3/6] 安装依赖（包含构建工具）..."
pnpm install --frozen-lockfile

echo "[4/6] 构建前端..."
pnpm build

echo "[5/6] 重启服务..."
systemctl restart devforge

echo "[6/6] 健康检查..."
APP_PORT="$(grep -E '^PORT=' .env 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
APP_PORT="${APP_PORT:-3000}"
HEALTH_OK=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done

if [[ "${HEALTH_OK}" != "1" ]]; then
  echo "健康检查失败。请查看："
  echo "  journalctl -u devforge -n 80 --no-pager"
  exit 1
fi

echo "服务正常，安装自动更新 timer..."
bash "${APP_DIR}/deploy/install-auto-update.sh"

echo
echo "完成。当前提交："
git --no-pager log -1 --oneline
echo
echo "确认数据仍在："
ls -lh "${APP_DIR}/data" 2>/dev/null || true
