#!/usr/bin/env bash
# AI学习一体化平台 · 公网部署版 一键部署（在服务器上以 root 执行）
#
# 用法一（无域名，IP 直连，跳过 nginx）——推荐个人使用:
#   PLATFORM_HOST=0.0.0.0 SKIP_NGINX=1 PORT=8796 bash deploy.sh
# 用法二（有已备案域名，走 80 端口 + nginx）:
#   bash deploy.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8796}"
PLATFORM_HOST="${PLATFORM_HOST:-127.0.0.1}"
SKIP_NGINX="${SKIP_NGINX:-0}"

echo "==> 部署目录: $APP_DIR"
echo "==> 监听: $PLATFORM_HOST:$PORT  (nginx: $([ "$SKIP_NGINX" = "1" ] && echo 跳过 || echo 启用))"

# 1) 系统依赖
if command -v dnf >/dev/null; then PKG=dnf; else PKG=yum; fi
# AL3 默认 python3 是 3.6，flask3/pypdf 需要更高版本：优先安装 Python 3.11
$PKG install -y python3.11 python3.11-pip >/dev/null 2>&1 || true
echo '==> 正在安装 python3 / nginx（首次约 1-3 分钟）…'
$PKG install -y python3 python3-pip nginx

# 2) 虚拟环境与依赖（优先使用新版 Python）
PYTHON_BIN="$(command -v python3.11 || command -v python3.9 || command -v python3)"
echo "==> 使用 Python: $PYTHON_BIN ($($PYTHON_BIN --version 2>&1))"
cd "$APP_DIR"
rm -rf venv
"$PYTHON_BIN" -m venv venv
./venv/bin/pip install --upgrade pip -i https://mirrors.cloud.aliyuncs.com/pypi/simple/ >/dev/null 2>&1 || true
./venv/bin/pip install -r requirements.txt

# 3) systemd 常驻服务
sed -e "s|__APP_DIR__|$APP_DIR|g" \
    -e "s|__PORT__|$PORT|g" \
    -e "s|__PLATFORM_HOST__|$PLATFORM_HOST|g" \
    deploy-linux/ai-platform.service > /etc/systemd/system/ai-platform.service
systemctl daemon-reload
systemctl enable --now ai-platform

# 4) nginx 反向代理（可选：有已备案域名/想走 80 端口时才需要；IP 直连请设 SKIP_NGINX=1）
if [ "$SKIP_NGINX" != "1" ]; then
  sed "s|__PORT__|$PORT|g" deploy-linux/ai-platform.nginx.conf > /etc/nginx/conf.d/ai-platform.conf
  nginx -t
  systemctl enable --now nginx >/dev/null 2>&1 || true
  systemctl restart nginx
fi

echo ""
if [ "$PLATFORM_HOST" = "0.0.0.0" ]; then
  echo "==> 部署完成！访问: http://<服务器公网IP>:$PORT/"
  echo "    安全组记得放行 $PORT/TCP 端口。"
else
  echo "==> 部署完成！nginx 反代 80 端口，访问: http://<服务器IP>/"
  echo "    安全组记得放行 80/TCP 端口。"
fi
echo "    服务管理: systemctl {status|restart|stop} ai-platform"
