/**
 * Vercel Serverless Function - 流式增强版
 * * 变更说明:
 * 1. 支持流式响应 (Streaming Response)，解决 LLM/SSE 响应延迟和无内容问题。
 * 2. 保留了 x-goog-api-key 转发支持。
 * 3. 优化了 Body 处理。
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

    // 转发部分客户端 Header
    if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'];
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
    if (req.headers['accept']) headers['Accept'] = req.headers['accept'];
    if (req.headers['x-goog-api-key']) headers['x-goog-api-key'] = req.headers['x-goog-api-key'];

    const fetchOptions = {
      method: req.method,
      headers: headers,
      redirect: 'manual',
    };

    // 处理 Body
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
    }

    // --- 4. 发起请求 ---
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
        const redirectUrl = `${protocol}://${host}/api/index?url=${encodeURIComponent(absoluteRedirectUrl)}`;
        
        res.setHeader('Location', redirectUrl);
        res.status(response.status).end();
        return;
      }
    }

    // --- 6. 处理响应头 ---
    response.headers.forEach((value, key) => {
      // 过滤掉 Content-Length 和 Content-Encoding，因为我们要重新流式输出
      if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key)) return;
      try {
        res.setHeader(key, value);
      } catch (e) {}
    });

    // --- 7. 响应内容处理 (区分 HTML 和 API) ---
    const contentType = response.headers.get('content-type') || '';
    
    // 如果是 HTML，需要缓冲整个页面来做链接替换 (Browsing Mode)
    if (contentType.includes('text/html')) {
      const htmlText = await response.text();
      
      const host = req.headers['x-forwarded-host'] || req.headers['host'];
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const currentPath = req.url ? req.url.split('?')[0] : '/api/index';
      const proxyUrlBase = `${protocol}://${host}${currentPath}?url=`;

      const rewriteUrl = (rawUrl) => {
        try {
          if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('#') || rawUrl.startsWith('javascript:') || rawUrl.startsWith('mailto:')) {
            return rawUrl;
          }
          if (rawUrl.includes(host)) return rawUrl;
          const absoluteUrl = new URL(rawUrl, targetUrl).toString();
          return `${proxyUrlBase}${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
          return rawUrl;
        }
      };

      const newHtml = htmlText.replace(/(href|src|action)=["']([^"']+)["']/g, (match, attr, url) => {
        return `${attr}="${rewriteUrl(url)}"`;
      });

      res.status(response.status).send(newHtml);
    } 
    // ✨✨✨ 核心修改：非 HTML 内容 (API/Image/SSE) 使用流式透传 ✨✨✨
    else {
      res.status(response.status);
      
      // Node.js 18+ 原生 fetch 的 body 是 ReadableStream
      if (response.body) {
        // 使用 for await 语法进行流式读取和写入
        for await (const chunk of response.body) {
          res.write(chunk);
        }
      }
      res.end();
    }

  } catch (error) {
    console.error('Proxy Error:', error);
    // 只有在 header 还没发送的情况下才发送 500 JSON
    if (!res.headersSent) {
        res.status(500).json({
            error: 'Proxy Error',
            message: error.message
        });
    } else {
        res.end();
    }
  }
};
