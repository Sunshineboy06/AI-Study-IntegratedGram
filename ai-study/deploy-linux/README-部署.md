# 公网部署版 · 部署说明（Alibaba Cloud Linux 3）

## 0. 上传代码
> 平台已迁入仓库的 `ai-study/` 子目录（仓库根目录现在是平台选择门户）。上传时只需传这个子目录：

把 `ai-study` 整个文件夹传上去，例如 `/opt/ai-platform`：
```bash
scp -r ai-study/* root@<服务器IP>:/opt/ai-platform/
```

## 1. 部署方式选择

**方式 A：无域名，IP 直连（推荐个人使用，免备案纠结）**
不装 nginx，应用直接监听 8796 端口，访问 `http://公网IP:8796/`：
```bash
cd /opt/ai-platform
PLATFORM_HOST=0.0.0.0 SKIP_NGINX=1 PORT=8796 bash deploy-linux/deploy.sh
```
安全组放行 **8796/TCP**，然后浏览器打开 `http://公网IP:8796/` 即可。
（大陆机房 80/443 无备案会被拦截，非标端口 IP 直连不受影响）

**方式 B：有已备案域名，走 80 端口 + nginx**
```bash
cd /opt/ai-platform
bash deploy-linux/deploy.sh
```
脚本自动：安装 python3/nginx → venv 装依赖 → systemd 常驻 → nginx 反代 80。
安全组放行 **80/TCP**，访问 `http://域名/`。

## 2. 安全组
阿里云控制台 → 实例 → 安全组 → 入方向规则：方式 A 放行 **8796/TCP**，方式 B 放行 **80/TCP**（授权对象 0.0.0.0/0）。另外保留 22 端口用于 SSH 上传/管理。

## 3. 访问
浏览器打开对应地址即可；把网址发给别人也能直接用。

## 4. 常用运维
```bash
systemctl status ai-platform    # 查看状态
systemctl restart ai-platform   # 重启
journalctl -u ai-platform -f    # 看日志
```

## 5. 可选：HTTPS
有域名并完成备案后，推荐用 certbot 免费签发证书，或在阿里云下载免费证书配置到 nginx（listen 443 ssl）。

## 6. 提醒
- 大陆服务器对外提供网站服务需**域名备案**；无域名时可先用 `http://IP/` 自用测试
- 平台数据存在**访问者各自浏览器**中，服务器不保存用户数据，重装系统也不影响
