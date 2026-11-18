#!/usr/bin/env bash
# ==========================================================================
# DEVFORGE - 每日备份
# 备份 SQLite 数据库快照 + uploads 上传目录 + AI 对话日志，保留最近 14 天。
#
# 使用：
#   sudo bash /opt/devforge/deploy/backup.sh
#
# 加入 crontab（每天 03:20）：
#   20 3 * * * /bin/bash /opt/devforge/deploy/backup.sh >> /var/log/devforge-backup.log 2>&1
# ==========================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/devforge}"
APP_USER="${APP_USER:-devforge}"
DATA_DIR="${APP_DIR}/data"
BACKUP_DIR="${DATA_DIR}/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 root 运行：sudo bash $0"
  exit 1
fi

if [[ ! -d "${DATA_DIR}" ]]; then
  echo "找不到数据目录：${DATA_DIR}"
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

echo "[1/2] SQLite 快照..."
if runuser -u "${APP_USER}" -- /opt/node/bin/node "${APP_DIR}/server/backup.js"; then
  :
else
  echo "数据库备份失败。检查服务是否正常：systemctl status devforge"
  exit 1
fi

echo "[2/3] 打包 uploads..."
if [[ -d "${DATA_DIR}/uploads" ]]; then
  runuser -u "${APP_USER}" -- tar -czf "${BACKUP_DIR}/uploads-${STAMP}.tar.gz" -C "${DATA_DIR}" uploads
else
  echo "没有 uploads 目录，跳过。"
fi

echo "[3/3] 打包 AI 对话日志..."
if [[ -d "${DATA_DIR}/ai-logs" ]]; then
  runuser -u "${APP_USER}" -- tar -czf "${BACKUP_DIR}/ai-logs-${STAMP}.tar.gz" -C "${DATA_DIR}" ai-logs
else
  echo "没有 ai-logs 目录，跳过。"
fi

# 保留最近 14 天的 uploads / ai-logs 压缩包；数据库快照由 server/backup.js 保留 14 份。
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'uploads-*.tar.gz' -mtime +14 -delete
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'ai-logs-*.tar.gz' -mtime +14 -delete

echo
echo "备份完成："
ls -lh "${BACKUP_DIR}" | tail -n 8
echo
echo "建议把 ${BACKUP_DIR} 同步到阿里云 OSS 或另一台机器。"
