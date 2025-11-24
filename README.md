# 🌏 Universal Proxy (Vercel Edition)

一个基于 Vercel Serverless Functions 构建的轻量级、零依赖通用 HTTP 代理。

它主要用于解决前端开发中的 **CORS 跨域问题**，或者作为简单的 API 中转服务。内置了智能的链接重写功能，支持浏览简单的静态网页，并针对 Vercel 环境进行了深度优化。

## ✨ 主要特性

  * **⚡️ 零依赖架构**：基于 Node.js 原生 `fetch` API，无需 `node_modules`，部署速度极快。
  * **🔓 彻底解决 CORS**：自动添加 `Access-Control-Allow-Origin: *` 等头信息，允许任何前端项目直接调用。
  * **🔄 智能路由重写**：
      * 支持通过参数调用：`/api/index?url=...`
      * 支持路径透传（伪静态）：`/proxy/https://...` (配置于 `vercel.json`)
  * **🔗 链接自动修正**：智能识别并替换 HTML 中的 `href`、`src` 和 `action`，确保通过代理访问网页时跳转不中断。
  * **🛡 重定向跟踪**：自动处理 301/302 重定向，并在代理内部保持会话。
  * **🚀 高兼容性**：支持 GET, POST, PUT, DELETE 等全方法及 Body/Header 转发。

## 🚀 快速部署

### 方法一：一键部署 (推荐)

你需要拥有一个 Vercel 账号。

1.  Fork 本仓库到你的 GitHub。
2.  在 Vercel Dashboard 中点击 **"Add New Project"**。
3.  导入该仓库。
4.  **⚠️ 关键设置**：在 `Settings` -\> `General` -\> `Node.js Version` 中，**必须选择 18.x 或 20.x**（因为代码依赖原生 `fetch`）。
5.  点击 **Deploy**。

### 方法二：手动上传

使用 Vercel CLI 部署：

```bash
npm i -g vercel
vercel login
vercel deploy --prod
```

## 📖 使用指南

假设你的 Vercel 项目域名为 `https://your-proxy.vercel.app`。

### 1\. 基础用法 (API 代理)

最适合用于前端请求第三方 API，解决跨域问题。

**URL 参数模式：**

```http
GET https://your-proxy.vercel.app/api/index?url=https://api.github.com/users/vercel
```

**路径模式 (更简洁)：**

```http
GET https://your-proxy.vercel.app/proxy/https://api.github.com/users/vercel
```

### 2\. 前端代码调用示例

在你的 Vue/React/原生 JS 项目中：

```javascript
const proxyBase = "https://your-proxy.vercel.app/api/index";
const targetUrl = "https://api.openai.com/v1/models";

// 自动转发 Header 和 Body
fetch(`${proxyBase}?url=${encodeURIComponent(targetUrl)}`, {
    method: 'GET',
    headers: {
        'Authorization': 'Bearer sk-your-token...', // 这里的 Header 会被代理转发给目标
        'Content-Type': 'application/json'
    }
})
.then(response => response.json())
.then(data => console.log(data))
.catch(err => console.error(err));
```

### 3\. 在线测试工具

部署完成后，访问你的域名根目录（例如 `https://your-proxy.vercel.app/`），即可看到内置的测试界面。你可以在这里输入 URL 测试代理是否正常工作。

## ❓ 常见问题 (FAQ)

**Q: 为什么访问 IP 查询网站显示的不是我的真实 IP？**
**A:** 代理工作在服务端。当你通过代理访问 `httpbin.org/ip` 时，目标服务器看到的是 **Vercel 服务器的 IP**（通常位于美国），这正是代理的作用之一。

**Q: 为什么 YouTube、Twitter 或大型视频网站无法正常加载？**
**A:** 本项目主要针对 **API 接口** 和 **简单的静态网页**。
大型网站（SPA）依赖复杂的 JavaScript 动态加载、WebSocket 或特定的流媒体协议。本项目的正则替换逻辑只能处理基础的 HTML 链接，无法代理复杂的动态资源请求。

**Q: 部署后报错 500 或 `ReferenceError: fetch is not defined`？**
**A:** 请检查 Vercel 后台的 **Node.js Version**。必须设置为 **18.x** 或更高版本，因为低版本 Node.js 不支持原生 `fetch` API。

## 📂 项目结构

```text
.
├── api
│   └── index.js      # 核心代理逻辑 (Serverless Function)
├── public
│   └── index.html    # 在线测试与演示页面
├── vercel.json       # Vercel 路由重写配置 (/proxy/* -> /api/index)
└── README.md         # 说明文档
```

## ⚠️ 免责声明

本项目仅供技术学习、开发测试及个人 API 调试使用。

  * 请勿用于非法用途。
  * 请勿用于大规模内容分发或绕过付费墙。
  * Vercel 免费版有流量和执行时长限制，滥用可能导致账户被封禁。

## 📄 License

MIT
