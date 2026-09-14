# 我的学习平台（仓库入口）

这个仓库现在放着**两个独立的学习平台**，根目录 `index.html` 是选择门户，打开后点卡片进入：

| 平台 | 路径 | 说明 |
|---|---|---|
| 🧠 AI 学习一体化平台 | [`ai-study/`](ai-study/) | 刷题、背单词、总复习脑图、错题本。Flask 静态托管 + 文档解析，可部署到服务器。详见 [ai-study/README.md](ai-study/README.md) |
| ⚛️ 大学物理知识点自测 | [`physics/`](physics/) | 按课件 YYF 19–45 梳理的 26 讲、219 个知识点、486 道检测题，单文件离线可用，支持多终端同步 |

两个平台数据彼此独立，互不干扰。

---

## 一、开启 GitHub Pages（只需做一次）

推送后网页不会自动上线，需要在 GitHub 开启 Pages：

1. 打开仓库页面 → **Settings** → 左侧 **Pages**
2. **Source** 选 `Deploy from a branch`
3. **Branch** 选 `main`，目录选 `/ (root)` → **Save**
4. 等 1–2 分钟，访问 `https://Sunshineboy06.github.io/AI-Study-IntegratedGram/`

首页就是平台选择页，两个卡片分别进入对应平台。

## 二、本地使用

**大学物理知识点自测**：直接双击 `physics/index.html`，或用浏览器打开即可，无需任何环境。

**AI 学习一体化平台**：
```bash
cd ai-study
pip install -r requirements.txt
python server.py          # 默认 http://127.0.0.1:8796
```

## 三、物理自测的多终端同步

答题进度默认存在各自浏览器里。要跨设备同步：

1. 在物理自测页点右上角 **☁ 云同步**
2. 填一个 GitHub 个人访问令牌（[创建地址](https://github.com/settings/personal-access-tokens)，只需给 **Gists: Read and write** 权限）
3. 填一个自定义的**同步码**（如 `physics-2026`），**每台设备填一样的**
4. 点「双向同步」

- 数据存进你的**私密 Gist**（`public: false`，只有持令牌的人能读），令牌只留在本机浏览器
- 同一道题两台设备都答过时，以**较新的一次作答**为准
- 也可以「以本地覆盖云端」或「以云端覆盖本地」做单向强制同步
- 更换设备只需重复：填同一令牌 + 同一同步码 → 双向同步

## 四、目录结构

```
├── index.html            # 平台选择门户（两个入口）
├── physics/
│   └── index.html        # 大学物理知识点自测（单文件，含知识点/题库/同步）
└── ai-study/             # AI 学习一体化平台（原根目录内容整体迁入，未删改）
    ├── index.html        # 平台 SPA 入口
    ├── css/ js/          # 样式与模块
    ├── server.py         # Flask 静态托管 + /api/extract-text
    ├── parsers.py        # PDF/DOCX/TXT/MD 解析
    ├── 提示词/            # 第三方 AI 生成题库/大纲/单词表的提示词
    ├── deploy-linux/     # 一键部署脚本 + systemd/nginx 配置
    └── README.md         # 平台完整说明
```

> `server.py` 与 `deploy-linux/deploy.sh` 都是基于**自身所在目录**解析路径，因此迁入 `ai-study/` 后无需改动即可正常运行；服务器部署请传 `ai-study/` 这个子目录（见 [ai-study/deploy-linux/README-部署.md](ai-study/deploy-linux/README-部署.md)）。

## 五、隐私

两个平台的学习数据默认只存在各自设备的浏览器中；物理自测选择云同步后，进度会写入你本人的私密 GitHub Gist。服务器不保存任何用户数据。
