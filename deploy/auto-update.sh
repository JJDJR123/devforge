#!/usr/bin/env bash
# ==========================================================================
# DEVFORGE auto update
#
# 由 systemd timer 每 2 分钟执行一次：
#   fetch origin -> 有更新 -> 备份数据库 -> pull -> install -> build
#   -> restart -> health check -> 失败回滚代码
#
# data/ 和 .env 不在 Git 里，更新过程不会删除它们。
# 不会执行 git clean。
# ==========================================================================
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/devforge}"
BRANCH="${UPDATE_BRANCH:-main}"
NODE_BIN="${NODE_BIN:-/opt/node/bin}"
export PATH="${NODE_BIN}:${PATH}"

LOCK_FILE="/var/lock/devforge-update.lock"
LOG_PREFIX="[devforge-update]"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') ${LOG_PREFIX} $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

mkdir -p /var/lock
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  log "another update is already running, skip"
  exit 0
fi

cd "${APP_DIR}" || die "cannot cd to ${APP_DIR}"

if [[ ! -d .git ]]; then
  log "not a git checkout, skip"
  exit 0
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  log "no git origin remote, skip"
  exit 0
fi

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  log "tracked files have local changes, skip to avoid overwriting them"
  exit 0
fi

if ! git fetch --quiet origin "${BRANCH}"; then
  log "git fetch failed (network?), will retry next timer"
  exit 0
fi

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/${BRANCH}" 2>/dev/null || true)"
if [[ -z "${REMOTE}" ]]; then
  log "branch origin/${BRANCH} not found, skip"
  exit 0
fi

if [[ "${LOCAL}" == "${REMOTE}" ]]; then
  exit 0
fi

DATA_DIR_VALUE="$(grep -E '^DATA_DIR=' "${APP_DIR}/.env" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
DATA_DIR_VALUE="${DATA_DIR_VALUE:-${APP_DIR}/data}"
FAILED_FILE="${DATA_DIR_VALUE}/.update-failed"
APP_PORT="$(grep -E '^PORT=' "${APP_DIR}/.env" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
APP_PORT="${APP_PORT:-3000}"

if [[ -f "${FAILED_FILE}" ]] && [[ "$(cat "${FAILED_FILE}" 2>/dev/null)" == "${REMOTE}" ]]; then
  log "commit ${REMOTE} previously failed; waiting for a newer commit"
  exit 0
fi

log "update ${LOCAL} -> ${REMOTE}"

# Always back up the database before touching code or running migrations.
if ! node "${APP_DIR}/server/backup.js"; then
  die "database backup failed; update aborted"
fi

OLD_HEAD="${LOCAL}"

rollback() {
  local reason="$1"
  log "ROLLBACK (${reason}); restoring code ${OLD_HEAD}"
  git reset --hard "${OLD_HEAD}" >/dev/null 2>&1 || log "git reset failed"
  if ! pnpm install --frozen-lockfile; then
    log "rollback install failed"
  fi
  if ! pnpm build; then
    log "rollback build failed"
  fi
  systemctl restart devforge || log "rollback restart failed"
  mkdir -p "$(dirname "${FAILED_FILE}")" 2>/dev/null || true
  echo "${REMOTE}" > "${FAILED_FILE}" 2>/dev/null || true
  log "code rolled back; data directory was not modified"
}

if ! git pull --ff-only origin "${BRANCH}"; then
  log "git pull failed; code unchanged"
  exit 1
fi

log "installing dependencies"
if ! pnpm install --frozen-lockfile; then
  rollback "pnpm install failed"
  exit 1
fi

log "building frontend"
if ! pnpm build; then
  rollback "pnpm build failed"
  exit 1
fi

log "restarting service"
if ! systemctl restart devforge; then
  rollback "systemctl restart failed"
  exit 1
fi

log "waiting for health check"
HEALTH_OK=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done

if [[ "${HEALTH_OK}" != "1" ]]; then
  log "health check failed"
  journalctl -u devforge -n 50 --no-pager || true
  rollback "health check failed"
  exit 1
fi

rm -f "${FAILED_FILE}"
log "deployed ${REMOTE} successfully"
