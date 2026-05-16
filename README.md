# 桌面小小英雄 · desktop-pet

基于 Electron + Three.js 的 LoL 风格桌面宠物。把英雄联盟"小小英雄（TFT Chibi）"模型搬到桌面，陪你工作、提醒休息、提示饭点。

> macOS Apple Silicon 友好。Windows / Linux 理论上也能跑，但当前 dmg 未提供。

---

## 安装

### 直接下载（推荐）

到 [Releases](https://github.com/zhangjingjing962464-glitch/desktop-pet/releases) 页下载最新版 `desktop-pet-X.X.X-arm64.dmg`：

1. 双击 dmg，把 `desktop-pet.app` 拖到「应用程序」文件夹
2. 第一次启动若被 Gatekeeper 拦下，到「系统设置 → 隐私与安全性」点"仍要打开"

---

## 主要特性

- **28 个 LoL Chibi 角色**：阿狸、格温、莫甘娜、悠米、塞拉芬、伊瑞莉雅、索娜、拉克丝、悠娜拉、佐伊、莉莉娅、露露、内可、瑞文、索娜、永恩 等多套皮肤
- **丰富动作**：每个角色 20-40 种动作（Idle / Run / Joke / Taunt / Laugh / Dance / Cast / Finisher / 玩偶变身 等）
- **智能提醒**：
  - 工作 60 分钟 / 休息 5 分钟循环
  - 早 / 午 / 晚饭点提醒
  - 双模式可同开：**通知 + 提示音**（8 个 macOS 系统音 + 自定义音频文件） / **招牌动作**（模型放最大切到最顶层，演 5 分钟）
- **Apple Liquid Glass 风格设置面板**：浅色 / 深色 / 跟随系统
- **状态栏图标**：圆形 + 五角星（模板图，自动适配明暗主题）
- **右键菜单**：快速切角色 / 窗口置顶 / 暂停提醒 / 退出

---

## 截图

> Coming soon — 启动应用后用 ⌘+⇧+4 截一张，PR 上来。

---

## 开发

### 依赖

- Node.js 18+
- macOS（其他平台未测）
- 模型文件：由于 LoL Chibi 模型版权问题，本仓库**不含** `.glb` 文件，需自行准备到 `assets/models/`

### 本地运行

```bash
npm install
npm run scripts:link-models  # 把 assets/models/ 链接到你的模型目录
npm run scripts:manifest     # 扫描模型生成 manifest
npm run dev                  # 启动 Vite + Electron
```

### 打包 dmg

```bash
npm run dist:mac
# 产物：release/desktop-pet-X.X.X-arm64.dmg
```

### 状态栏图标 / 应用图标重新生成

```bash
node scripts/build-tray-icon.mjs   # 输出 assets/icons/tray*.png
node scripts/build-app-icon.mjs    # 需要 assets/icons/app-source.png 源图
```

### 测试

```bash
npm run typecheck   # TypeScript 类型检查
npm test            # vitest 单元测试
npm run lint        # ESLint
```

---

## 技术栈

- **渲染**：Three.js（正交相机，蒙皮动画，KHR_materials_unlit）
- **应用框架**：Electron 32（透明窗口、IPC、托盘、单实例锁）
- **构建**：Vite 5 + vite-plugin-electron
- **类型**：TypeScript 5
- **状态持久化**：electron-store（Zod schema 校验）
- **打包**：electron-builder（macOS Apple Silicon DMG）

---

## 项目结构

```
src/
├── main/          # Electron 主进程
│   ├── bootstrap.ts
│   ├── windows/   # 主窗口 / 设置窗口
│   ├── reminder/  # 工作休息 / 饭点调度
│   ├── services/  # store / notifier / tray / shortcuts
│   └── ipc/       # IPC handlers
├── preload/       # 安全桥
├── renderer/      # Three.js 渲染层
│   ├── character/ # 角色加载与控制
│   ├── animation/ # 随机动作调度
│   ├── settings/  # Liquid Glass 设置面板
│   └── input/     # 鼠标穿透/拖拽/点击
└── shared/        # main + renderer 共享（schema/常量/IPC 契约）
```

---

## 许可

代码 MIT。**模型文件版权归 Riot Games 所有，本项目仅作个人桌面装饰使用，不包含模型文件分发。**

---

## 致谢

- [Riot Games](https://www.riotgames.com/) 提供的 LoL Chibi 角色资源
- [Three.js](https://threejs.org/) / [Electron](https://www.electronjs.org/) 社区
