# DDCLuckyDraw — 代码与模块说明

本仓库实现一个基于 Vue 3 + Vite 的抽奖 / 日志管理前端应用（包名：`ddc-luckydraw`）。此文档聚焦于代码结构与主要模块功能，方便维护者快速上手和二次开发。

## 主要特性
- 多页面与路由管理（`vue-router`）
- 状态管理使用 `pinia`，并持久化部分配置
- 多语言支持（`src/locales`）
- 常用工具与 API 封装（`src/api/`、`src/utils/`）
- 支持导入导出（Excel/CSV）、音频播放与 worker 加速
- 可打包为静态站点，也支持与 Tauri 集成构建桌面应用

## 运行与构建

- 本地开发：
```bash
pnpm install
pnpm run dev
```
- 生产构建：
```bash
pnpm run build
```

要求：Node >= 22，pnpm 推荐使用（项目使用 pnpm lock）。

## 目录与关键文件说明

- `src/`：应用源码
	- `main.ts`：应用入口，初始化 `vue`、`router`、`pinia` 等
	- `App.vue`：根组件
	- `router/index.ts`：路由定义与懒加载
	- `store/`：Pinia 状态管理，包含 `data.ts`, `personConfig.ts`, `prizeConfig.ts`, `serverConfig.ts`, `globalConfig.ts` 等模块
	- `views/`：页面集合（`Home`、`Config`、`Demo`、`Mobile` 等），每个视图包含对应的页面逻辑与子组件
	- `components/`：可复用组件库（Dialog、Drawer、FileUpload、Loading、SvgIcon、Waterfall 等）
	- `api/`：HTTP 请求封装（`request.ts`）和消息相关接口（`api/msg/index.ts`）
	- `assets/`：项目静态资源（图片、音频、markdown 文档）
	- `hooks/`：复用逻辑（`useLocalFonts`, `useWebsocket`, `useTimerWorker` 等）
	- `layout/`：页面布局（Header/Footer/RightButton）及全局挂载逻辑
	- `utils/`：通用工具（颜色、文件、auth、store helpers、dexie 库包装等）

## 关键模块功能细节

- `src/store/`：将各类配置拆分为模块化 store，方便持久化与复用。
	- `personConfig.ts`：用户个人配置（昵称、头像、显示偏好）
	- `prizeConfig.ts`：奖项定义与抽奖规则
	- `serverConfig.ts`：后端 API 地址、鉴权信息

- `src/api/request.ts`：对 `fetch`/`axios` 的封装（项目使用 axios），包含 token 注入、错误统一处理与重试策略（如有）

- `src/hooks/useTimerWorker/`：将耗时定时任务交给 Web Worker（`timerworker.worker.ts`），减少主线程阻塞

- `src/components/FileUpload/index.vue`：实现文件读取、预览与上传抽象（支持 Excel 解析并通过 `importExcel.worker` 做处理）

- `src/locales/`：i18n 文案拆分为模块（`modules` 下为页面/组件专属文案），构建时会生成 `.d.ts` 声明以保证类型安全

## 常见问题与调试提示

- 构建时若出现 `vue-tsc: is not recognized`：确保已运行 `pnpm install`，并且 `node_modules/.bin` 在 PATH 中（通常在终端运行构建即可）。
- 若 `tsconfig.node.json` 丢失或报找不到：项目依赖 `tsconfig.json` 的 references，仓库已包含 `tsconfig.node.json` 用于构建时解析 `vite.config.ts`，不要删除。
- 构建后发现某些 chunk 过大：考虑使用动态 import 或优化 `build.rollupOptions.output.manualChunks`。

## 发布与 Docker

- 发布目录说明：项目包含 `publish/`（由脚本导出最小可运行集）。发布流程（示例）：
```bash
cd publish
git init
git add .
git commit -m "Initial minimal publish"
git remote add origin https://github.com/yourname/your-repo.git
git branch -M main
git push -u origin main
```

- 多阶段 Docker 示例（简略）：
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

## 开发者说明与贡献

- 分支策略：请使用 feature 分支并通过 PR 合并到 `main`。
- 代码风格：参考项目内 ESLint/Prettier 配置。
- 提交前运行：`pnpm lint`、`pnpm test`（如有测试套件）。

## 联系与额外说明

如需我把本 README 的变更提交到本地仓库（`git add && git commit`），或把示例 `Dockerfile` 自动添加到仓库并提交，请回复我将执行相应操作。

