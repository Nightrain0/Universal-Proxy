/**
 * Vercel Serverless Function - 流式传输终极修复版
 * * 修复: Node.js 18+ fetch 挂起问题 (添加 duplex: 'half')
 * * 优化: 使用 stream.pipeline 替代循环，提高流式传输稳定性
 * * 优化: 增加禁用缓存头，防止 SSE 被缓冲
 */

const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

module.exports = async (req, res) => {
  try {
    // --- 1. CORS 和 基础 Header 设置 ---
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-goog-api-key'
    );

    // 禁用 Vercel 和 Nginx 的缓冲，确保流式输出能立即发送
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // --- 2. 参数解析 ---
    const { url } = req.query;
    const targetUrlRaw = Array.isArray(url) ? url[0] : url;

    if (!targetUrlRaw) {
      return res.status(400).send('Missing "url" parameter');
    }

    let targetUrl;
    try {
      targetUrl = new URL(targetUrlRaw);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL', details: e.message });
    }

    // --- 3. 构建请求 ---
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // 转发白名单 Header
    const allowHeaders = ['authorization', 'content-type', 'accept', 'x-goog-api-key'];
    allowHeaders.forEach(key => {
        if (req.headers[key]) headers[key] = req.headers[key]; // 注意：req.headers key 都是小写
    });

    const fetchOptions = {
      method: req.method,
      headers: headers,
      redirect: 'manual',
      // 关键修复：Node.js 18+ 发送带 Body 的请求必须设为 'half'，否则会挂起
      duplex: 'half', 
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
    }

    // --- 4. 发起请求 ---
    const response = await fetch(targetUrl.toString(), fetchOptions);

    // --- 5. 处理重定向 ---
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

    // --- 6. 转发响应头 ---
    response.headers.forEach((value, key) => {
      // 剔除可能导致问题的头
      if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) return;
      try {
        res.setHeader(key, value);
      } catch (e) {}
    });

    // --- 7. 响应内容处理 ---
    const contentType = response.headers.get('content-type') || '';
    
    // 场景 A: 网页浏览 (HTML 重写)
    if (contentType.includes('text/html')) {
      const htmlText = await response.text();
      // ... (保持原有的 HTML 重写逻辑) ...
      const host = req.headers['x-forwarded-host'] || req.headers['host'];
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const currentPath = req.url ? req.url.split('?')[0] : '/api/index';
      const proxyUrlBase = `${protocol}://${host}${currentPath}?url=`;

      const rewriteUrl = (rawUrl) => {
          try {
            if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('#')) return rawUrl;
            if (rawUrl.includes(host)) return rawUrl;
            const absoluteUrl = new URL(rawUrl, targetUrl).toString();
            return `${proxyUrlBase}${encodeURIComponent(absoluteUrl)}`;
          } catch (e) { return rawUrl; }
      };

      const newHtml = htmlText.replace(/(href|src|action)=["']([^"']+)["']/g, (match, attr, url) => {
        return `${attr}="${rewriteUrl(url)}"`;
      });
      res.status(response.status).send(newHtml);
    } 
    // 场景 B: API/流式数据 (直接管道转发)
    else {
      res.status(response.status);
      
      if (!response.body) {
        res.end();
        return;
      }

      // 将 Web ReadableStream 转换为 Node Readable Stream 并通过管道转发
      // 这种方式比 for await 循环更稳定，通过 pipeline 自动管理背压
      const nodeStream = Readable.fromWeb(response.body);
      
      try {
        await pipeline(nodeStream, res);
      } catch (err) {
        // pipeline 会自动处理流关闭，但在 Vercel 中如果客户端断开可能会抛错，这里忽略即可
        console.log('Stream pipeline ended:', err.code);
      }
    }

  } catch (error) {
    console.error('Proxy Error:', error);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Proxy Error', message: error.message });
    } else {
        res.end();
    }
  }
};
