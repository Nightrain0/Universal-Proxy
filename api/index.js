/**
 * Vercel Serverless Function - 高兼容修复版
 * * 变更说明:
 * 1. 使用 module.exports 替代 export default，确保在所有 Vercel 环境下兼容。
 * 2. 增加了全局错误捕获，防止函数直接崩溃。
 * 3. 优化了 Header 的处理逻辑。
 * 4. 新增: 支持 x-goog-api-key 转发 (适配 Gemini)。
 */

module.exports = async (req, res) => {
  // --- 1. 全局错误处理包装 ---
  try {
    // 设置 CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-goog-api-key'
    );

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // --- 2. 参数校验 ---
    const { url } = req.query;
    // 处理 url 参数可能是数组的情况 (例如 ?url=a&url=b)
    const targetUrlRaw = Array.isArray(url) ? url[0] : url;

    if (!targetUrlRaw) {
      return res.status(400).send('<h1>Missing "url" parameter</h1><p>Usage: /api/index?url=https://example.com</p>');
    }

    // 检查 URL 有效性
    let targetUrl;
    try {
      targetUrl = new URL(targetUrlRaw);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format', details: e.message });
    }

    // --- 3. 准备请求 ---
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // 转发部分客户端 Header (鉴权等)
    if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'];
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
    if (req.headers['accept']) headers['Accept'] = req.headers['accept'];
    
    // ✨ 新增：转发 Google API Key Header (适配 Gemini)
    if (req.headers['x-goog-api-key']) headers['x-goog-api-key'] = req.headers['x-goog-api-key'];

    const fetchOptions = {
      method: req.method,
      headers: headers,
      redirect: 'manual', // 手动处理重定向
    };

    // 处理 Body
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      // Vercel 可能会自动解析 body 为 object，如果是 object 则转回 string
      fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
    }

    // --- 4. 发起请求 ---
    // 兼容性检查：确保 fetch 存在 (Node 18+ 原生支持，旧版本可能需要 polyfill)
    if (typeof fetch === 'undefined') {
        throw new Error('Node.js version too low. Please set Node.js Version to 18.x or 20.x in Vercel Settings.');
    }

    const response = await fetch(targetUrl.toString(), fetchOptions);

    // --- 5. 处理重定向 (3xx) ---
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        const absoluteRedirectUrl = new URL(location, targetUrl).toString();
        const host = req.headers['x-forwarded-host'] || req.headers['host'];
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        // 构建新的代理跳转链接
        const redirectUrl = `${protocol}://${host}/api/index?url=${encodeURIComponent(absoluteRedirectUrl)}`;
        
        res.setHeader('Location', redirectUrl);
        // 保持原来的重定向状态码
        res.status(response.status).end();
        return;
      }
    }

    // --- 6. 处理响应头 ---
    response.headers.forEach((value, key) => {
      // 过滤掉可能引起问题的头
      if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key)) return;
      // 允许设置 header
      try {
        res.setHeader(key, value);
      } catch (e) {
        // 忽略无效 header 错误
      }
    });

    // --- 7. 响应内容处理 (智能重写) ---
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('text/html')) {
      const htmlText = await response.text();
      
      const host = req.headers['x-forwarded-host'] || req.headers['host'];
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      // 计算当前代理的基础路径，例如: https://my-app.vercel.app/api/index?url=
      // 使用 split('?') 确保不包含之前的 query 参数
      const currentPath = req.url ? req.url.split('?')[0] : '/api/index';
      const proxyUrlBase = `${protocol}://${host}${currentPath}?url=`;

      const rewriteUrl = (rawUrl) => {
        try {
          if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('#') || rawUrl.startsWith('javascript:') || rawUrl.startsWith('mailto:')) {
            return rawUrl;
          }
          // 如果已经是代理链接，跳过
          if (rawUrl.includes(host)) return rawUrl;

          const absoluteUrl = new URL(rawUrl, targetUrl).toString();
          return `${proxyUrlBase}${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
          return rawUrl;
        }
      };

      // 简单的正则替换 (href, src, action)
      const newHtml = htmlText.replace(/(href|src|action)=["']([^"']+)["']/g, (match, attr, url) => {
        return `${attr}="${rewriteUrl(url)}"`;
      });

      res.status(response.status).send(newHtml);
    } else {
      // 非 HTML 内容直接透传 Buffer
      const buffer = await response.arrayBuffer();
      res.status(response.status).send(Buffer.from(buffer));
    }

  } catch (error) {
    console.error('Proxy Error:', error);
    // 返回 JSON 格式错误，方便调试
    res.status(500).json({
      error: 'Proxy Error',
      message: error.message,
      stack: error.stack
    });
  }
};
