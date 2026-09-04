# 修改域名与构建

## 修改检测域名

检测列表位于 `app/line-config.ts`，修改 `LINE_DOMAINS` 数组即可：

```ts
export const LINE_DOMAINS = [
  "example.com",
  "backup.example.com",
] as const;
```

每行填写一个线路入口，不需要填写 `http://` 或 `https://`。

## 构建 GitHub Pages 版本

环境要求：Node.js 22.13.0 或更高版本。

```bash
npm ci
npm run build:pages
```

构建结果位于 `pages-dist/`。当前 `vite.pages.config.ts` 中的 `base` 是 `/VPNLine_Checker/`，对应本仓库的 GitHub Pages 地址。如果更改仓库名，请同步修改该 `base`。

## 构建服务器根目录版本

部署到域名根目录时，使用：

```bash
npm ci
npm run build:pages -- --base /
```

将 `pages-dist/` 中的全部文件上传到 Nginx、Apache 或服务器面板配置的网站根目录即可。
