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
