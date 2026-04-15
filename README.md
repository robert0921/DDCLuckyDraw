# publish 目录说明

本目录由 `tools/export_minimal_repo.ps1` 或 `tools/export_minimal_repo.sh` 生成，包含要上传到 GitHub 的最小运行相关源码与配置。

推荐的后续步骤（在本地运行）：

1. 进入 `publish` 目录：

```
cd publish
```

2. 初始化 git 并提交：

```
git init
git add .
git commit -m "Initial minimal publish"
```

3. 在 GitHub 创建一个空仓库（例如通过网站），然后添加远程并推送：

```
git remote add origin https://github.com/yourname/your-repo.git
git branch -M main
git push -u origin main
```

如果需要用 token 推送，可使用 `git remote set-url origin https://<TOKEN>@github.com/yourname/your-repo.git` 或使用 `gh` / SSH。

注意：脚本尽可能排除了 `node_modules`、构建产物、Tauri 目标等大体积目录，但最终请在 push 前再检查 `publish/` 中的内容与敏感信息（.env 等）。

如何运行（在本地）:

- 安装依赖（推荐使用 `pnpm`，也可以用 `npm`/`yarn`）：

```bash
pnpm install
```

- 开发服务器：

```bash
pnpm run dev
```

注意事项：
- `package.json` 指定 `node >= 22` 和 `pnpm`，请确保本机满足要求。
- 若要构建桌面应用或使用 Tauri 功能，需安装 Rust 与 Tauri 相关工具链。

安全与敏感信息检查：
- 请确认仓库根或 `publish/` 下没有未被忽略的敏感文件，例如：`.env`、私钥 (`*.pem`/`*.key`)、凭证文件或包含 secrets 的配置文件。若有请立即移除并在远程仓库中强制删除历史提交或使用 GitHub 的密钥扫描工具。

Docker 构建与运行（示例）:

下面给出一个多阶段 Dockerfile 示例：先在 Node 环境中构建静态文件，再用 Nginx 提供服务。

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

构建并运行示例：

```bash
# 在 publish/ 目录下构建镜像
docker build -t ddcluckydraw:latest .

# 运行容器
docker run -p 8080:80 ddcluckydraw:latest

# 访问 http://localhost:8080
```

使用 docker-compose 示例（可选）：

```yaml
version: '3.8'
services:
	web:
		build: .
		ports:
			- '8080:80'
```

部署注意事项：
- 若使用 CDN 或反向代理（Nginx、Cloudflare 等），请根据 `index.html` 中的基础路径调整 `vite` 的 `base` 配置。 
- 若项目使用后端 API，请确认生产环境的后端地址与 CORS 策略已配置正确。

如需我把上述 `Dockerfile` 加入仓库并提交推送，请回复“添加 Dockerfile”。
