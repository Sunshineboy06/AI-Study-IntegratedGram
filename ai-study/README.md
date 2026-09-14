# AI学习一体化平台 · 公网部署版

一个开箱即用的学习平台：**刷题、背单词、总复习脑图、错题本**四大功能闭环，数据全部保存在访客自己的浏览器里。服务器只做静态托管与文档解析，**不做任何 AI 计算**——访客用内置提示词在自己的第三方 AI（Kimi / ChatGPT / 豆包等）里生成学习内容，回来上传导入即可。

> 纯原生 JavaScript 单页应用，零构建工具、零前端框架；服务端仅 Flask + 文档解析，2核2G 即可部署。

## 功能一览

| 板块 | 说明 |
|---|---|
| ✏️ 刷题练习 | 单选 / 多选 / 填空 / 简答自由组卷，章节筛选、随机顺序、限时倒计时 |
| 🔤 背单词 | 艾宾浩斯曲线安排复习，陌生/学习中/完全背诵三色标签，首页三词轮盘速览，支持 Azure 神经语音朗读 |
| 🧠 总复习脑图 | Markdown 大纲一键生成交互式思维导图，知识点可直接关联题目即点即练 |
| 📓 错题本 | 答错自动归集，按题库溯源、错误次数累计，一键重做 |
| 🗂️ 数据管理 | 课程文件夹分组；题库/大纲/词库导入导出，一键备份迁移 |

**设计特点**：全站蓝色页头 + 常驻透明玻璃顶栏、深浅色主题、移动端动画降级优化（窄屏/触屏设备自动砍掉高开销模糊效果）。

## 访客三步上手

1. **复制提示词**：「数据管理」→「🧠 第三方 AI 生成文件提示词」，复制题库 / 大纲 / 单词表三份提示词之一
2. **第三方 AI 生成**：粘贴到任意 AI，把末尾「素材」换成自己的笔记内容
3. **上传导入**：回到「数据管理」上传生成的 `.json` / `.md` / `.txt` 文件，自动校验导入

> 防重复：词库已有单词自动跳过并保留学习进度；题库重复导入请先删除旧题库。

详见 [使用说明-公网版.md](使用说明-公网版.md)，配套提示词在 [提示词/](提示词/) 目录。

## 本地运行

```bash
pip install -r requirements.txt
python server.py            # 默认 http://127.0.0.1:8796
# 自定义端口/地址：PLATFORM_HOST=0.0.0.0 PLATFORM_PORT=9000 python server.py
```

浏览器打开即用，无需任何构建步骤。`server.py` 只提供两件事：

- 静态托管整个目录（SPA 本体）
- `POST /api/extract-text`：PDF / DOCX / TXT / MD 文档文本提取（供导入功能解析）

## 服务器部署（Alibaba Cloud Linux 3）

一条命令完成部署，详见 [deploy-linux/README-部署.md](deploy-linux/README-部署.md)：

```bash
# 方式 A：无域名，IP 直连（推荐个人使用）
PLATFORM_HOST=0.0.0.0 SKIP_NGINX=1 PORT=8796 bash deploy-linux/deploy.sh
# 浏览器打开 http://公网IP:8796/

# 方式 B：有已备案域名，走 80 端口 + nginx 反代
bash deploy-linux/deploy.sh
```

自动完成：安装 python3/nginx → venv 装依赖 → systemd 常驻 → nginx 反代。常用运维：`systemctl status/restart ai-platform`、`journalctl -u ai-platform -f`。

## 技术栈

- **前端**：原生 HTML / CSS / JavaScript（无框架、无构建工具、无外部依赖），深浅色主题用 CSS 令牌 + 深色反转实现
- **后端**：Flask（`flask>=3.0`）静态托管 + 文档解析接口（`python-docx`、`pypdf`）
- **持久化**：访客数据全部存浏览器 localStorage，服务器不保存任何用户数据
- **语音**：浏览器 SpeechSynthesis 免费朗读；可选配置 Azure 神经语音

## 目录结构

```
├── index.html              # SPA 入口
├── css/style.css           # 全部样式（设计令牌 + 深浅色主题 + 响应式）
├── js/                     # 模块化原生 JS（views/quiz/vocab/mindmap/storage/importer…）
├── server.py               # Flask 静态托管 + /api/extract-text
├── parsers.py              # PDF/DOCX/TXT/MD 解析
├── prompts/                # 第三方 AI 生成题库/大纲/单词表的提示词
├── deploy-linux/           # 一键部署脚本 + systemd/nginx 配置
└── 使用说明-公网版.md       # 访客使用指引
```

## 隐私

所有学习数据（词库、刷题记录、错题）只存在**访客各自设备的浏览器**中，不跨设备同步、服务器不留存；清空浏览器数据即彻底删除。
