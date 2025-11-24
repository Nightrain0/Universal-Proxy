🌏 Universal Proxy (Vercel Edition)

一个基于 Vercel Serverless Functions 构建的轻量级、零依赖通用 HTTP 代理。

它主要用于解决前端开发中的 CORS 跨域问题，或者作为简单的 API 中转服务。支持基本的网页链接重写，可浏览简单的静态网页。

✨ 主要特性

⚡️ 零依赖：基于 Node.js 原生 fetch API，无需安装 node_modules，秒级部署。

🔓 CORS 解锁：自动处理跨域头（Access-Control-Allow-Origin），允许任何前端项目调用。

🔗 智能重写：尝试自动替换 HTML 中的 href 和 src 链接，保持浏览体验。

🔄 全方法支持：支持 GET, POST, PUT, DELETE 等 HTTP 方法及 Body 转发。

🛡 隐私保护：不做日志记录，Serverless 阅后即焚。

🚀 快速开始

1. 部署到 Vercel

你不需要任何服务器，只需要一个 Vercel 账号。

Fork/Clone 本项目到你的 GitHub。

登录 Vercel Dashboard。

点击 "Add New..." -> "Project"。

导入你刚才的 GitHub 仓库。

重要设置：在 Settings -> General 中，确保 Node.js Version 设置为 18.x 或更高（因为代码使用了原生的 fetch）。

点击 Deploy。

2. 使用方法

假设你的 Vercel 域名为 https://your-proxy.vercel.app。

基础用法 (API 代理)

直接在 URL 参数中拼接目标地址：

GET https://your-proxy.vercel.app/api/index?url=https://api.github.com/users/vercel


前端调用示例 (JavaScript)

解决跨域问题：

const proxy = "https://your-proxy.vercel.app/api/index";
const target = "https://api.openai.com/v1/models";

fetch(`${proxy}?url=${encodeURIComponent(target)}`, {
    method: 'GET',
    headers: {
        'Authorization': 'Bearer sk-...' // Headers 会被自动转发
    }
})
.then(res => res.json())
.then(data => console.log(data));


❓ 常见问题 (FAQ)

1. 为什么访问 IP 检测网站 (如 ip.cn) 显示的还是我的真实 IP？

这是因为现代网页通常包含 Client-side JavaScript。

代理服务只转发了 HTML 文件。

网页加载后，其中的 JavaScript 脚本会在你的浏览器中直接运行。

脚本发起的 AJAX 请求没有经过代理，直接连接了目标服务器。

如何验证代理是否生效？

请访问纯 API 接口，例如：
https://your-proxy.vercel.app/api/index?url=http://httpbin.org/ip
你会看到返回的是 Vercel 服务器的 IP (通常是美国的 IP)。

2. 为什么 YouTube/Twitter 无法播放或加载？

这些是复杂的 SPA (单页应用)，依赖大量的动态资源加载和复杂的 WebSocket/流媒体协议。
本项目的“链接重写”功能仅通过简单的正则替换 HTML 字符串，无法处理复杂的 JS 动态请求。

本项目适用于： 纯文本网站、文档站、API 接口、简单的图片资源。

3. 部署后报错 500 / FUNCTION_INVOCATION_FAILED？

请检查 Vercel 的 Node.js Version 设置。代码使用了 Node.js 18+ 才支持的原生 fetch API。请在 Vercel 后台将 Node 版本设置为 18.x 或 20.x。

📂 项目结构

.
├── api
│   └── index.js      # 核心代理逻辑 (Serverless Function)
├── public
│   └── index.html    # 简单的在线测试前端页面
├── vercel.json       # 路由重写配置
└── README.md         # 说明文档


⚠️ 免责声明

本项目仅供学习、开发测试及个人 API 中转使用。
请勿用于非法用途或大规模分发内容。Vercel 免费版有流量和运行时间限制，滥用可能导致封号。

📄 License

MIT
