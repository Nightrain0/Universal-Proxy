# ⚡️ Universal Proxy (Edge Edition)

一个基于 **Vercel Edge Runtime** 构建的高性能通用 API 代理。

相比传统的 Node.js 版代理，Edge 版本启动速度更快（冷启动几乎为零），延迟更低，并且专门针对 **API 转发**、**流式传输 (SSE/Stream)** 和 **复杂参数透传** 进行了深度优化。

## ✨ 核心特性

  * **⚡️ Edge Runtime 驱动**：运行在全球边缘节点，基于 Web Standard API，速度极快。
  * **🔧 参数完美透传**：修复了传统代理中 URL 参数丢失的问题（例如 `&key=xxx` 或 `?alt=sse`），完美支持 OpenAI 等需要复杂 Query 参数的接口。
  * **🔓 自动 CORS 处理**：自动添加跨域头，允许前端项目直接调用任何第三方 API。
  * **🌊 流式响应支持**：直接透传 `response.body`，完美支持 ChatGPT 类 AI 接口的打字机效果。
  * **🛡 隐私净化**：自动移除 `x-forwarded-for`、`x-real-ip` 等特征头，隐藏真实客户端 IP。
  * **📍 智能重定向**：自动处理 301/302 跳转，并修正 `Location` 头以保持代理路径。

## 🚀 部署指南

### 方法一：一键部署

1.  Fork 本仓库。
2.  在 Vercel 中导入项目。
3.  **无需特殊配置**：代码中已指定 `runtime: 'edge'`，Vercel 会自动识别。
4.  点击 **Deploy**。

### 方法二：手动部署

```bash
npm i -g vercel
vercel deploy --prod
```

## 📖 使用方法

假设你的域名是 `https://proxy.your-domain.com`。

### 1\. 通用 API 代理

支持 GET, POST, PUT, DELETE 等所有方法。

**方式 A：URL 参数模式 (推荐)**

```http
GET https://proxy.your-domain.com/api/index?url=https://api.openai.com/v1/chat/completions
```

**方式 B：路径透传模式**
*(需要在 `vercel.json` 中配置 rewrite)*

```http
GET https://proxy.your-domain.com/proxy/https://api.github.com/users/vercel
```

### 2\. 前端调用示例 (JS/TS)

```javascript
const proxyUrl = "https://proxy.your-domain.com/api/index";
const target = "https://api.openai.com/v1/chat/completions";

// 代理会自动处理 ?url= 后面的参数拼接
fetch(`${proxyUrl}?url=${encodeURIComponent(target)}`, {
    method: "POST",
    headers: {
        "Authorization": "Bearer sk-xxxx",
        "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: "gpt-3.5-turbo", messages: [...] })
})
.then(res => res.json())
.then(console.log);
```

## ❓ 常见问题

**Q: 这个版本能用来浏览网页吗？**
**A:** 可以，但不推荐。代码主要针对 **API 数据** 进行了优化。虽然支持返回 HTML，但去除了复杂的网页链接重写逻辑，以换取更高的处理速度。如果用来加载大型网站，可能会出现部分静态资源无法加载的情况。

**Q: 为什么选择 Edge Runtime？**
**A:** 1. **更便宜**：Vercel Edge 的计费模式通常对轻量级代理更友好。
2\. **更快**：没有 Node.js 繁重的冷启动过程。
3\. **更强**：原生支持 Web Streams API，处理 AI 流式响应更稳定。

## 📂 目录结构

  * `api/index.js`: 核心 Edge Function 代码。
  * `public/index.html`: 简单的在线测试工具。
  * `vercel.json`: 路由配置。

-----
