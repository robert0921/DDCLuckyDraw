# DDCLuckyDraw — 技术文档

DDCLuckyDraw（包名：`ddc-luckydraw`）是一个基于 Vue 3 + Vite 的**企业级抽奖与名单管理前端应用**，支持 3D 粒子动效、卡牌翻转抽奖、实时 WebSocket 通信、多语言与多主题，并可通过 Tauri 打包为跨平台桌面应用。

---

## 目录

1. [技术栈总览](#技术栈总览)
2. [快速开始](#快速开始)
3. [架构与目录结构](#架构与目录结构)
4. [抽奖核心机制](#抽奖核心机制)
5. [3D 渲染与动效](#3d-渲染与动效)
6. [状态管理（Pinia）](#状态管理pinia)
7. [实时通信：WebSocket + Service Worker](#实时通信websocket--service-worker)
8. [Web Worker 加速](#web-worker-加速)
9. [构建系统与 Vite 插件](#构建系统与-vite-插件)
10. [UI 体系](#ui-体系)
11. [i18n 多语言](#i18n-多语言)
12. [数据持久化](#数据持久化)
13. [文件处理与 Excel 导入导出](#文件处理与-excel-导入导出)
14. [Tauri 桌面端支持](#tauri-桌面端支持)
15. [常见问题](#常见问题)
16. [发布与 Docker](#发布与-docker)
17. [开发者贡献指南](#开发者贡献指南)

---

## 技术栈总览

| 分类 | 技术 / 库 |
|------|-----------|
| 框架 | Vue 3.5 Composition API + TypeScript 5 |
| 构建 | Vite 7，vue-tsc 类型检查 |
| 路由 | vue-router 4，全懒加载 |
| 状态 | Pinia 3 + pinia-plugin-persist（持久化） |
| 3D 渲染 | Three.js + CSS3DRenderer + TWEEN.js + TrackballControls |
| 动效 | canvas-confetti（撒花）、Sparticles（粒子背景）、GSAP（可选） |
| 实时通信 | WebSocket（通过 Service Worker 代理） + vue-composable |
| 样式 | Tailwind CSS 4（@tailwindcss/vite）+ DaisyUI 5 + SCSS |
| 组件库 | Reka-UI（headless）+ 自定义 shadcn 风格组件 |
| i18n | vue-i18n v11（模块化 locale） |
| 数据持久化 | Pinia persist + Dexie（IndexedDB）+ localforage |
| Excel 处理 | xlsx + Web Worker（非阻塞解析） |
| 桌面端 | Tauri 2（@tauri-apps/cli） |
| 安全 | vue-dompurify-html（XSS 防护） |
| 测试 | Vitest + @vue/test-utils |

---

## 快速开始

要求：**Node >= 22**，推荐使用 pnpm。

```bash
# 安装依赖
pnpm install

# 本地开发（热更新）
pnpm run dev

# 类型检查 + 生产构建
pnpm run build

# 仅用 file:// 协议打开的构建（无需 http 服务器）
pnpm run build:file

# 依赖体积分析
pnpm run build:prebuild
```

---

## 架构与目录结构

```
src/
├── main.ts              # 应用入口：注册 vue/router/pinia/i18n
├── App.vue              # 根组件，挂载全局布局
├── router/index.ts      # 路由表（全懒加载，基路径 /ddc-luckydraw/）
├── store/               # Pinia 状态模块
│   ├── globalConfig.ts  # 全局视觉/行为配置（主题、行数、音乐等）
│   ├── personConfig.ts  # 参与人员名单与中奖记录
│   ├── prizeConfig.ts   # 奖项定义与抽奖规则
│   ├── serverConfig.ts  # 后端 API 地址与 Token
│   └── system.ts        # 系统级状态（全屏、loading 等）
├── views/
│   ├── Home/            # 抽奖主页（核心逻辑）
│   │   ├── index.vue    # 页面入口，卡牌网格 + AppMode 状态机
│   │   ├── useViewModel.ts  # 抽奖 ViewModel（Three.js + 状态机）
│   │   ├── type.ts      # LuckydrawStatus 枚举
│   │   └── components/  # OptionsButton、StarsBackground 等子组件
│   ├── Config/          # 配置页（人员/奖项/全局/服务器/说明）
│   ├── Demo/            # 演示页（WebSocket 测试）
│   └── Mobile/          # 手机端参与页
├── components/          # 全局可复用组件
│   ├── ui/              # shadcn 风格：Button、Dialog、Popover 等
│   ├── Dialog/          # 通用对话框
│   ├── FileUpload/      # 文件上传（支持 Excel、图片）
│   ├── Loading/         # 全局 Loading 遮罩
│   └── Waterfall/       # 瀑布流布局
├── hooks/
│   ├── useWebsocket.ts  # WebSocket + Service Worker 通信封装
│   ├── useLocalFonts.ts # 本地字体读取（Local Font Access API）
│   └── useTimerWorker/  # 基于 Web Worker 的高精度定时器
├── api/
│   └── request.ts       # axios 封装（拦截器、token 注入）
├── locales/             # i18n 文案（zh-CN / en 双语）
├── utils/               # 通用工具函数
│   ├── dexie/           # IndexedDB 封装
│   └── localforage/     # localforage 封装
└── layout/              # 全局布局（Header / Footer / RightButton）
```

---

## 抽奖核心机制

抽奖逻辑集中在 `src/views/Home/useViewModel.ts`，是整个项目最核心的模块（约 1300 行）。

### 状态机（LuckydrawStatus）

```
init(0) ──enterLuckydraw()──► ready(1) ──startLuckydraw()──► running(2)
                                                               │
                                              stopLuckydraw() ▼
                                                            end(3)
                                              continueLuckydraw() ──► init(0)
                                              quitLuckydraw()    ──► init(0)
```

- **`enterLuckydraw()`**：准备阶段，随机采样人员池，初始化 Three.js 场景中的标靶位置（grid/sphere/helix/table 四种布局）。
- **`startLuckydraw()`** / **`startLuckydrawForCard(idx)`**：启动 TWEEN 动画，人员卡牌在空间中随机飞舞；`ForCard` 版本针对卡牌网格中用户点击的指定位置抽奖。
- **`stopLuckydraw()`**：
  1. 从人员池中抽取中奖者（遵守奖项剩余次数限制）。
  2. 触发 TWEEN 飞入动画，将选中卡牌定位到预选卡位。
  3. 通过 `window.dispatchEvent(new CustomEvent('luckydraw:end', { detail }))` 通知页面层（解耦 ViewModel 与 View）。
  4. 内置 1600ms 回退机制：若 Three.js `onComplete` 未回调则强制派发事件，防止 UI 卡死。
- **`continueLuckydraw()`**：展示结果后，将获奖人员标记为已使用，重置 Three.js 场景，返回 init 状态。
- **`quitLuckydraw()`**：中途退出，重置所有状态，不记录结果。

### 自定义事件总线

ViewModel 与 View 通过 DOM CustomEvent 解耦，主要事件：

| 事件名 | 触发时机 |
|---|---|
| `luckydraw:end` | 抽奖停止，携带 `{ index, person }` |
| `luckydraw:returnToShowcase` | continueLuckydraw 完成，回到展示模式 |

### 定时自动停止

`globalConfig.definiteTime`（秒）> 0 时，启动 `setTimeout` 在指定秒数后自动调用 `stopLuckydraw()`，同时配合 Web Worker 定时器防止页面隐藏时 `setTimeout` 降频。

### 音乐控制

`startLuckydrawMusic()` / `stopLuckydrawMusic()` 动态创建 `HTMLAudioElement`，支持从 localforage（IndexedDB）加载自定义音频，播放时生成 ObjectURL，停止时及时 `revokeObjectURL` 防止内存泄漏。

---

## 3D 渲染与动效

### Three.js CSS3DRenderer

`useViewModel.ts` 使用 **CSS3DRenderer**（`three-css3d`）将 HTML 卡牌元素作为 CSS3D 对象挂入 Three.js 场景，实现真实 3D 旋转、透视投影，同时保留卡牌的 HTML/CSS 样式与交互能力。

四种展示布局通过预计算顶点位置切换，TWEEN.js 驱动补间动画过渡：

| 布局 | 说明 |
|---|---|
| `grid` | 正面网格排列（默认展示态） |
| `sphere` | 球形分布，配合 TrackballControls 可旋转交互 |
| `helix` | 螺旋线排布 |
| `table` | 平铺桌面视角 |

**TrackballControls** 允许用户在 sphere 模式下鼠标拖拽自由旋转球体。

### canvas-confetti

抽奖结束后在 `StarsBackground` 中调用 `confettiFire()` 触发彩屑动画，支持自定义颜色配合当前主题色。

### Sparticles

背景粒子效果由 `sparticles` 库提供，常驻运行在 `z-index: 0` 层，前景粒子层在 `z-index: 10`，位于抽奖网格（z: 1）上方、Three.js 容器（z: 5）之间，形成多层次空间感。

---

## 状态管理（Pinia）

所有 store 通过 `src/store/index.ts` 聚合导出，由 `pinia-plugin-persist` 自动序列化到 localStorage。

| Store | 关键字段 |
|---|---|
| `globalConfig` | `rowCount`（行数）、`theme`（主题色/字体/卡牌尺寸）、`musicList`、`imageList`、`definiteTime`、`language` |
| `personConfig` | 全员名单、已中奖名单、按奖项分组名单 |
| `prizeConfig` | 奖项列表（含图片）、当前奖项、临时奖项、`count`/`isUsedCount` 剩余次数追踪 |
| `serverConfig` | 后端 WebSocket URL + HTTP API 基地址 + Token |
| `system` | 全屏状态、全局 Loading 显示控制 |

奖项图片以 `{ id, name, url }` 对象存储，大图走 IndexedDB（Dexie）存取，`url` 字段为 `"Storage"` 时按 `id` 从 Dexie 中取 Blob 并生成 ObjectURL，有效控制 localStorage 体积。

---

## 实时通信：WebSocket + Service Worker

`src/hooks/useWebsocket.ts` 的亮点设计：

1. **Service Worker 代理**：WebSocket 连接跑在 `sw.js`（`public/sw.js`）的 Service Worker 里，主线程通过 `postMessage` 通信。页面刷新或切换时连接不中断。
2. **消息类型**：`CONNECT_WS` / `DISCONNECT_WS` / `SEND_WS_MESSAGE` / `GET_WS_STATUS`（主→SW），`WS_STATUS` / `WS_MESSAGE` / `WS_ERROR` / `WS_CLOSE` / `WS_OPEN`（SW→主）。
3. **心跳**：由 `useTimerWorker(30_000)` 在 Web Worker 中每 30 秒触发一次 `GET_WS_STATUS`，避免主线程休眠导致心跳失效。
4. **消息去重**：每条收到的消息附加 `uuid v4` 作为唯一 id，方便响应式系统检测变化。

---

## Web Worker 加速

### Timer Worker（`src/hooks/useTimerWorker/timerworker.worker.ts`）

使用 `setInterval` 在独立 Worker 线程中计时，主线程通过 `onmessage` 接收心跳回调。规避了浏览器对隐藏页面 `setTimeout`/`setInterval` 的限速（最低 1000ms），保证定时自动停止的精确性。

### Excel Import Worker（`importExcel.worker`）

人员名单批量导入时，xlsx 解析在 Worker 中执行，解析完成后将结构化数据 `postMessage` 给主线程，全程不阻塞 UI，支持千条以上记录的流畅导入。

---

## 构建系统与 Vite 插件

`vite.config.ts` 支持三种构建模式：

| 模式 | 命令 | 说明 |
|---|---|---|
| `production` | `pnpm build` | 标准构建，base = `/ddc-luckydraw/` |
| `file` | `pnpm build:file` | base = `./`，可直接用 `file://` 打开，适合 Tauri |
| `prebuild` | `pnpm build:prebuild` | 启用 rollup-plugin-visualizer，生成 bundle 体积分析报告 |

主要插件：

| 插件 | 作用 |
|---|---|
| `@vitejs/plugin-vue` | Vue SFC 支持 |
| `@tailwindcss/vite` | Tailwind CSS 4 原子类编译 |
| `unplugin-auto-import` | Vue/Router/Pinia API 自动导入（零 `import` 语句） |
| `unplugin-vue-components` | 自动注册 Vue 组件 |
| `unplugin-icons` + `@iconify-json/ep` + `@iconify-json/fluent` | 图标按需自动导入 |
| `vite-plugin-compression` | gzip 压缩所有 > 10KB 的输出产物 |
| `vite-plugin-svg-icons` | SVG sprite 合并，`<SvgIcon>` 组件统一使用 |
| `@vitejs/plugin-legacy` | file 模式下生成 legacy polyfill，兼容旧版浏览器 |
| `rollup-plugin-visualizer` | bundle 体积可视化（prebuild 模式） |

类型检查：构建前先执行 `vue-tsc --noEmit`，确保 TypeScript 类型正确再进入 Vite 打包。

---

## UI 体系

### Tailwind CSS 4 + DaisyUI 5

- Tailwind 原子类作为主要样式手段，配合 `tailwind-merge` 避免类名冲突。
- DaisyUI 5 提供多主题（`data-theme`），全局主题名存于 `globalConfig.theme.name`，通过 `document.documentElement.setAttribute('data-theme', ...)` 运行时切换。
- `tw-animate-css` 提供开箱即用的 CSS 动画类。

### Reka-UI + 自定义 shadcn 组件

`src/components/ui/` 下实现了 Button、Command、Dialog、DropdownMenu、Popover、Sonner、Switch 等无障碍 headless 组件（基于 Reka-UI），样式层完全由 Tailwind 控制，易于定制。

### 全局工具组件

| 组件 | 功能 |
|---|---|
| `<Loading>` | 全局遮罩，通过 `loading-context.ts` 跨组件控制显示/隐藏 |
| `<ErrorModal>` | 统一错误弹窗，带堆栈展示 |
| `<FileUpload>` | 拖拽/点击上传，支持图片预览与 Excel 解析 |
| `<HoverTip>` | 鼠标悬停提示（tooltip 封装） |
| `<ImageSync>` | 图片从 IndexedDB 异步加载，自动生成/释放 ObjectURL |
| `<Waterfall>` | 纯 CSS columns 实现的瀑布流布局 |
| `<SvgIcon>` | 统一 SVG sprite 图标使用方式 |
| `<NumberSeparate>` | 奖项分段设置（每次抽取人数配置） |

---

## i18n 多语言

`src/locales/` 使用 vue-i18n v11 composable 模式，支持 **中文（zh-CN）** 和 **英文（en）**：

```
locales/
├── i18n.ts           # createI18n 初始化，自动探测浏览器语言
├── zhCn.ts           # 中文根入口
├── en.ts             # 英文根入口
└── modules/          # 按功能拆分
    ├── button.ts     # 按钮文案
    ├── data.ts       # 数据标签
    ├── dialog.ts     # 弹窗文案
    ├── sidebar.ts    # 侧边栏菜单
    ├── table.ts      # 表格列名
    ├── tooltip.ts    # 提示文案
    └── viewTitle.ts  # 页面标题
```

语言偏好存储在 `globalConfig.language`，通过 Pinia persist 跨会话保持。构建时 `vue-tsc` 会为每个 `.ts` 生成 `.d.ts`，保证 `t('key')` 调用的类型安全。

---

## 数据持久化

| 方案 | 用途 |
|---|---|
| `pinia-plugin-persist` + localStorage | 所有 store 状态自动序列化/反序列化 |
| `Dexie`（IndexedDB） | 奖项/人员的大图 Blob 存储，避免 localStorage 超限（5MB） |
| `localforage` | 音频 Blob 存储（自定义抽奖音乐） |
| `localStorage` 原始读写 | `luckydraw:revealedMap`（卡牌已翻牌状态，跨刷新保持） |

Dexie 封装在 `src/utils/dexie/`，提供 `getItem` / `setItem` / `removeItem` 等接口；localforage 封装在 `src/utils/localforage/`，接口相同，底层优先使用 IndexedDB。

---

## 文件处理与 Excel 导入导出

### 导入
1. 用户通过 `<FileUpload>` 选择 `.xlsx`/`.csv` 文件。
2. 文件内容通过 `postMessage` 发送至 **importExcel.worker**（`src/components/FileUpload/` 内引用）。
3. Worker 使用 `xlsx` 库解析，将结构化 JSON 回传主线程。
4. 主线程调用 `personConfig.addPersonList()` 批量入库（同步到 Pinia + IndexedDB）。

### 导出
- 调用 `xlsx.utils.json_to_sheet` 生成工作表，`xlsx.writeFile` 触发浏览器下载。
- 支持导出已中奖人员名单（CSV/Excel 两种格式）。

---

## Tauri 桌面端支持

`vite.config.ts` 中检测 `process.env.TAURI_ENV_PLATFORM`，切换 `base` 为 `'./` 以支持 `file://` 协议。`@tauri-apps/plugin-dialog` 和 `@tauri-apps/plugin-fs` 使 Tauri 模式下可调用系统原生文件对话框与文件系统 API，替代浏览器的 `<input type="file">` 限制。

```bash
# 桌面端开发调试（需先安装 Rust 工具链）
pnpm tauri dev

# 桌面端打包
pnpm tauri build
```

---

## 常见问题

**Q：构建出现 `vue-tsc is not recognized`**
> 运行 `pnpm install` 确保 `node_modules` 已生成，`vue-tsc` 在 `node_modules/.bin/` 中。

**Q：`tsconfig.node.json` 找不到**
> 该文件已在仓库中，设置 `composite: true` 且 `include: ["vite.config.ts"]`，供 `tsconfig.json` references 使用，请勿删除。

**Q：某些 chunk 体积过大**
> 运行 `pnpm build:prebuild` 打开 bundle 分析页面，根据结果使用动态 `import()` 或配置 `build.rollupOptions.output.manualChunks` 分包。

**Q：WebSocket 连接不上**
> 先在 Config → Server 页填写正确的 WebSocket URL，然后在 Demo 页点击「Connect」测试。Service Worker 须在 HTTPS 或 localhost 环境下注册。

**Q：抽奖时页面卡住不动**
> 内置 1600ms 回退机制会强制派发 `luckydraw:end` 事件。若频繁出现，检查 Three.js 版本与 `CSS3DRenderer` 是否正常初始化（F12 控制台查看报错）。

---

## 发布与 Docker

### 静态站点部署

构建产物在 `dist/`，部署到任意静态文件服务器（Nginx、Cloudflare Pages 等），注意将 base 路径 `/ddc-luckydraw/` 与服务器路径一致，并配置 SPA 回退（`try_files $uri /ddc-luckydraw/index.html`）。

### 多阶段 Docker

```Dockerfile
# build stage
FROM node:22-bullseye AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm i -g pnpm@10.26.1
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# production stage
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```bash
docker build -t ddc-luckydraw:latest .
docker run -p 8080:80 ddc-luckydraw:latest
# 访问 http://localhost:8080/ddc-luckydraw/
```

---

## 开发者贡献指南

- **分支策略**：feature 分支 → PR → code review → 合并 `main`。
- **提交前**：
  ```bash
  pnpm lint       # ESLint 检查
  pnpm test       # Vitest 单元测试
  pnpm build      # 构建验证（含 vue-tsc 类型检查）
  ```
- **代码风格**：使用 `@antfu/eslint-config`，详见 `.eslintrc` 配置。
- **新增 i18n 文案**：在 `src/locales/modules/` 对应模块中同时添加 `zhCn` 和 `en` 两种语言。
- **新增 store**：继承 `defineStore` 模式，在 `src/store/index.ts` 聚合导出，并在需要时添加 `persist: true`。

