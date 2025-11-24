/**
 * Vercel Proxy - Edge Runtime Edition (终极版)
 * * * 架构变更: 切换到 Vercel Edge Runtime。
 * * 优势: 原生支持流式传输 (Streaming)，彻底解决 SSE/打字机效果卡顿、无内容的问题。
 * * 兼容性: 完美支持 Gemini/OpenAI 的流式 API 调用。
 */

export const config = {
  runtime: 'edge', // ✨ 启用边缘运行时
};

export default async function handler(req) {
  const url = new URL(req.url);
  const targetUrlRaw = url.searchParams.get('url');

  // --- 1. 处理 CORS (Preflight) ---
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
        'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-goog-api-key',
      },
    });
  }

  // --- 2. 参数校验 ---
  if (!targetUrlRaw) {
    return new Response('<h1>Missing "url" parameter</h1><p>Usage: /api/index?url=https://example.com</p>', {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  let targetUrl;
  try {
    targetUrl = new URL(targetUrlRaw);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid URL', details: e.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- 3. 构建请求对象 ---
  // 提取请求头
  const requestHeaders = new Headers();
  const allowHeaders = ['authorization', 'content-type', 'accept', 'x-goog-api-key'];
  
  // Edge Runtime 中 req.headers 是标准 Headers 对象
  allowHeaders.forEach(key => {
    const value = req.headers.get(key);
    if (value) requestHeaders.set(key, value);
  });

  // 必须设置 User-Agent，否则某些 API 会拒绝
  requestHeaders.set('User-Agent', 'Mozilla/5.0 (compatible; Universal-Proxy/1.0)');

  // 构建 fetch 选项
  const fetchOptions = {
    method: req.method,
    headers: requestHeaders,
    redirect: 'manual', // 手动处理重定向
  };

  // 处理 Body：GET/HEAD 不带 body，其他方法直接透传流
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    fetchOptions.body = req.body;
  }

  try {
    // --- 4. 发起请求 ---
    const response = await fetch(targetUrl.toString(), fetchOptions);

    // --- 5. 处理响应头 ---
    const responseHeaders = new Headers(response.headers);
    
    // 设置 CORS
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');

    // 清理可能导致问题的头
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');

    // 处理重定向
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = responseHeaders.get('location');
      if (location) {
        const absoluteRedirectUrl = new URL(location, targetUrl).toString();
        // 构造新的跳转地址
        const protocol = req.headers.get('x-forwarded-proto') || 'https';
        const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
        // 注意：Edge Runtime URL 结构可能不同，稳妥起见我们硬编码基础路径逻辑
        const proxyUrl = `${protocol}://${host}/api/index?url=${encodeURIComponent(absoluteRedirectUrl)}`;
        
        responseHeaders.set('Location', proxyUrl);
        return new Response(null, {
          status: response.status,
          headers: responseHeaders,
        });
      }
    }

    // --- 6. 响应内容处理 ---
    const contentType = responseHeaders.get('content-type') || '';

    // 场景 A: 网页 HTML (需要缓冲重写)
    if (contentType.includes('text/html')) {
      const htmlText = await response.text();
      
      const protocol = req.headers.get('x-forwarded-proto') || 'https';
      const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
      const proxyUrlBase = `${protocol}://${host}/api/index?url=`;

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

      return new Response(newHtml, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    // 场景 B: API / SSE / 图片 (直接流式透传)
    // ✨✨✨ 这是解决“无内容”的关键 ✨✨✨
    // Edge Runtime 允许直接返回 response.body (ReadableStream)，不需要 pipeline，不需要等待
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Proxy Error',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
