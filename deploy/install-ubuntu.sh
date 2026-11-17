#!/usr/bin/env bash
# ==========================================================================
# DEVFORGE - Ubuntu 22.04 / 24.04 一键安装
# 适用：阿里云轻量应用服务器 / ECS，Ubuntu 22.04 或 24.04，2 核 2G 起步
#
# 使用：
#   1. 把 devforge 目录上传到 /opt/devforge
#   2. sudo bash /opt/devforge/deploy/install-ubuntu.sh
#   3. 在阿里云安全组放行 TCP 8080，然后用 http://公网IP:8080 打开
#
# 脚本会安装：Node 24、pnpm、Nginx、systemd 服务
# 不会自动开通阿里云安全组，也不会自动申请 HTTPS 证书。
# ==========================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/devforge}"
APP_USER="${APP_USER:-devforge}"
NODE_VERSION="${NODE_VERSION:-24.21.0}"
NODE_MIRROR="${NODE_MIRROR:-https://npmmirror.com/mirrors/node}"
PNPM_VERSION="${PNPM_VERSION:-11.28.5}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${CYAN}[DEVFORGE]${NC} $*"; }
ok() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
die() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

if [[ "${EUID}" -ne 0 ]]; then
  die "请用 root 运行：sudo bash $0"
fi

if [[ ! -f "${APP_DIR}/package.json" ]]; then
  die "找不到 ${APP_DIR}/package.json。请先把发布包解压到 ${APP_DIR}。"
fi

if ! grep -q "Ubuntu" /etc/os-release 2>/dev/null; then
  warn "这个脚本按 Ubuntu 24.04 编写，当前系统可能不是 Ubuntu。继续前请确认包管理器是 apt。"
fi

info "安装系统依赖..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl xz-utils ca-certificates unzip nginx openssl

ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64) NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *) die "不支持的 CPU 架构: ${ARCH}" ;;
esac

NODE_HOME="/opt/node-v${NODE_VERSION}-linux-${NODE_ARCH}"
if [[ ! -x /opt/node/bin/node ]] || ! /opt/node/bin/node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' 2>/dev/null; then
  if [[ ! -x "${NODE_HOME}/bin/node" ]]; then
    info "下载 Node ${NODE_VERSION} (${NODE_ARCH})..."
    TMP_FILE="$(mktemp /tmp/node-XXXXXX.tar.xz)"
    trap 'rm -f "${TMP_FILE}"' EXIT
    curl -fL --retry 3 --connect-timeout 20 \
      "${NODE_MIRROR}/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
      -o "${TMP_FILE}"
    tar -xJf "${TMP_FILE}" -C /opt
    rm -f "${TMP_FILE}"
    trap - EXIT
  fi
  ln -sfn "${NODE_HOME}" /opt/node
fi

ok "Node: $(/opt/node/bin/node --version)"
export PATH="/opt/node/bin:${PATH}"

if [[ ! -x /opt/node/bin/pnpm ]]; then
  info "安装 pnpm ${PNPM_VERSION}..."
  /opt/node/bin/npm install -g "pnpm@${PNPM_VERSION}" --registry="${NPM_REGISTRY}"
fi
ok "pnpm: $(/opt/node/bin/pnpm --version)"

info "安装生产依赖（不包含前端构建工具）..."
cd "${APP_DIR}"
export npm_config_registry="${NPM_REGISTRY}"
CI=1 /opt/node/bin/pnpm install --prod --frozen-lockfile

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  info "创建系统用户 ${APP_USER}..."
  useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

mkdir -p "${APP_DIR}/data/uploads" "${APP_DIR}/data/backups"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}/data"

if [[ ! -f "${APP_DIR}/.env" ]]; then
  info "生成 .env 与首次设置口令..."
  SETUP_TOKEN_VALUE="$(/opt/node/bin/node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
  cat > "${APP_DIR}/.env" <<EOF
HOST=127.0.0.1
PORT=3000
NODE_ENV=production
DATA_DIR=${APP_DIR}/data
SETUP_TOKEN=${SETUP_TOKEN_VALUE}
MAX_UPLOAD_MB=25
LOG_LEVEL=info
EOF
  chmod 600 "${APP_DIR}/.env"
else
  warn "检测到已有 .env，保留原配置。"
fi

if ! grep -q '^SETUP_TOKEN=' "${APP_DIR}/.env" || [[ -z "$(grep '^SETUP_TOKEN=' "${APP_DIR}/.env" | cut -d= -f2-)" ]]; then
  warn ".env 里的 SETUP_TOKEN 为空，首次打开页面时会从服务器日志生成一个临时口令。"
fi

info "安装 systemd 服务..."
sed \
  -e "s#/opt/devforge#${APP_DIR}#g" \
  -e "s/^User=devforge/User=${APP_USER}/" \
  -e "s/^Group=devforge/Group=${APP_USER}/" \
  "${APP_DIR}/deploy/devforge.service" > /etc/systemd/system/devforge.service
systemctl daemon-reload
systemctl enable devforge
systemctl restart devforge

info "配置 Nginx（8080 -> 3000）..."
install -m 0644 "${APP_DIR}/deploy/nginx-ip-test.conf" /etc/nginx/sites-available/devforge
ln -sfn /etc/nginx/sites-available/devforge /etc/nginx/sites-enabled/devforge
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 22/tcp >/dev/null || true
  ufw allow 8080/tcp >/dev/null || true
  ufw allow 80/tcp >/dev/null || true
  ufw allow 443/tcp >/dev/null || true
  ok "已在本机 ufw 放行 22 / 8080 / 80 / 443"
fi

health=""
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    health="ok"
    break
  fi
  sleep 1
done

if [[ -z "${health}" ]]; then
  warn "Node 服务没有在 30 秒内就绪。查看日志："
  journalctl -u devforge -n 80 --no-pager || true
  die "安装未完成。修复上面的报错后运行 systemctl restart devforge。"
fi

SETUP_TOKEN_VALUE="$(grep '^SETUP_TOKEN=' "${APP_DIR}/.env" | cut -d= -f2- || true)"

echo
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN} DEVFORGE 已安装并启动${NC}"
echo -e "${GREEN}============================================================${NC}"
echo " 本机健康检查:  http://127.0.0.1:3000/api/health"
echo " 公网访问地址:  http://<阿里云公网IP>:8080"
echo " 首次设置口令:  ${SETUP_TOKEN_VALUE:-见 /opt/devforge/.env}"
echo
echo " 下一步："
echo "   1. 在阿里云安全组放行 TCP 8080（22 也要保留）"
echo "   2. 打开 http://公网IP:8080，输入上面的口令完成初始化"
echo "   3. ICP 备案通过、域名解析完成后，运行："
echo "      sudo bash ${APP_DIR}/deploy/enable-https.sh 你的域名 你的邮箱"
echo
echo " 常用命令："
echo "   systemctl status devforge"
echo "   journalctl -u devforge -f"
echo "   sudo bash ${APP_DIR}/deploy/backup.sh"
echo -e "${GREEN}============================================================${NC}"
