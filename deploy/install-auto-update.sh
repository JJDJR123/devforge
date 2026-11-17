#!/usr/bin/env bash
# ==========================================================================
# DEVFORGE - 安装/启用自动更新 timer
#
# 前置条件：
#   - /opt/devforge 是 git checkout，且 origin 指向 GitHub 仓库
#   - devforge 服务已经能正常运行
#
# 使用：
#   sudo bash /opt/devforge/deploy/install-auto-update.sh
#   sudo UPDATE_BRANCH=production bash /opt/devforge/deploy/install-auto-update.sh
# ==========================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/devforge}"
BRANCH="${UPDATE_BRANCH:-main}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 root 运行：sudo bash $0"
  exit 1
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "错误：${APP_DIR} 不是 Git 仓库。"
  echo "请先运行 connect-github.sh 接通 GitHub 仓库。"
  exit 1
fi

if ! git -C "${APP_DIR}" remote get-url origin >/dev/null 2>&1; then
  echo "错误：没有 origin remote。"
  echo "请先运行：sudo bash ${APP_DIR}/deploy/connect-github.sh <仓库地址>"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl util-linux ca-certificates

chmod 0755 "${APP_DIR}/deploy/auto-update.sh"
mkdir -p /var/log
touch /var/log/devforge-update.log

cat > /etc/default/devforge-update <<EOF
APP_DIR=${APP_DIR}
UPDATE_BRANCH=${BRANCH}
NODE_BIN=/opt/node/bin
EOF

sed "s#/opt/devforge#${APP_DIR}#g" "${APP_DIR}/deploy/devforge-update.service" \
  > /etc/systemd/system/devforge-update.service
install -m 0644 "${APP_DIR}/deploy/devforge-update.timer" /etc/systemd/system/devforge-update.timer

systemctl daemon-reload
systemctl enable --now devforge-update.timer

echo
echo "自动更新已启用："
echo "  仓库分支: ${BRANCH}"
echo "  检查频率: 每 2 分钟"
echo "  日志文件: /var/log/devforge-update.log"
echo
systemctl list-timers --all | grep -E 'devforge-update|NEXT' || true
echo
echo "查看日志："
echo "  tail -f /var/log/devforge-update.log"
echo "立即检查一次："
echo "  sudo systemctl start devforge-update.service"
echo "暂停自动更新："
echo "  sudo systemctl disable --now devforge-update.timer"
