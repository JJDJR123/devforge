#!/usr/bin/env bash
# ==========================================================================
# DEVFORGE - 绑定域名并自动申请 HTTPS
#
# 前置条件：
#   1. 域名已经完成 ICP 备案（大陆服务器）
#   2. 域名 A 记录已经指向这台服务器的公网 IP
#   3. 阿里云安全组已放行 TCP 80 和 443
#   4. Nginx 正在运行
#
# 使用：
#   sudo bash /opt/devforge/deploy/enable-https.sh dev.example.com you@example.com
# ==========================================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="${APP_DIR:-/opt/devforge}"

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
  die "请用 root 运行：sudo bash $0 域名 邮箱"
fi

if [[ -z "${DOMAIN}" || -z "${EMAIL}" ]]; then
  die "用法：sudo bash $0 域名 邮箱，例如 sudo bash $0 dev.example.com me@example.com"
fi

if ! [[ "${DOMAIN}" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
  die "域名格式看起来不正确：${DOMAIN}"
fi

if ! command -v nginx >/dev/null 2>&1; then
  die "Nginx 未安装。请先运行 install-ubuntu.sh。"
fi

info "检查 DNS 解析..."
RESOLVED="$(getent ahostsv4 "${DOMAIN}" 2>/dev/null | awk 'NR==1{print $1}' || true)"
if [[ -z "${RESOLVED}" ]]; then
  warn "暂时解析不到 ${DOMAIN}。请确认 A 记录已生效，否则证书申请会失败。"
else
  ok "${DOMAIN} -> ${RESOLVED}"
fi

info "安装 certbot..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y certbot python3-certbot-nginx

info "写入域名站点配置..."
sed "s/__DOMAIN__/${DOMAIN}/g" "${APP_DIR}/deploy/nginx-domain.conf" > /etc/nginx/sites-available/devforge-domain
ln -sfn /etc/nginx/sites-available/devforge-domain /etc/nginx/sites-enabled/devforge-domain
nginx -t
systemctl reload nginx

info "申请 Let's Encrypt 证书并配置 HTTPS..."
if certbot --nginx \
  -d "${DOMAIN}" \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  --redirect; then
  ok "HTTPS 配置完成。"
else
  warn "证书申请失败。常见原因："
  warn "  - 域名没有解析到这台服务器"
  warn "  - 大陆服务器还没完成 ICP 备案，80 端口无法访问"
  warn "  - 阿里云安全组没有放行 80 / 443"
  warn "现在仍可通过 http://公网IP:8080 访问。修复后重新运行本脚本。"
  exit 1
fi

# 域名 HTTPS 正常后，关闭 8080 的明文入口（如需保留 IP 测试入口，注释掉下面两行）
rm -f /etc/nginx/sites-enabled/devforge
nginx -t
systemctl reload nginx

echo
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN} 域名与 HTTPS 已启用${NC}"
echo -e "${GREEN}============================================================${NC}"
echo " 访问地址: https://${DOMAIN}"
echo " 证书续期: systemctl status certbot.timer"
echo
echo " 如果 8080 入口已关闭，请只保留安全组的 22 / 80 / 443。"
echo -e "${GREEN}============================================================${NC}"
