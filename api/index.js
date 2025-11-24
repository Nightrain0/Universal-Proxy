/**
 * Vercel Proxy - Edge Runtime Edition (宽容模式)
 * * 参照 gemini-proxy 的成功经验进行了核心修正。
 * * 修正点: Header 处理策略从“白名单”改为“黑名单”。
 * * 效果: 能够转发 NewAPI/OneAPI 发出的所有自定义 Header，兼容性极大幅度提升。
 */

export const config = {
  runtime: 'edge', // 保持 Edge Runtime 以支持流式
};

export default async function handler(req) {
  const url = new URL(req.url);
  const targetUrlRaw = url.searchParams.get('url');

  // --- 1. 处理 CORS ---
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204, // 参照 gemini-proxy 改为 204
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
        'Access-Control-Allow-Headers': '*', // 允许所有 Header，防止 CORS 拦截
      },
    });
  }

  // --- 2. 参数校验 ---
  if (!targetUrlRaw) {
    return new Response('Missing "url" parameter', { status: 400 });
  }

  let targetUrl;
  try {
    targetUrl = new URL(targetUrlRaw);
  } catch (e) {
    return new Response(`Invalid URL: ${e.message}`, { status: 400 });
  }

  // --- 3. 构建请求头 (关键修改) ---
  // 参照 gemini-proxy: 复制所有 Header，然后剔除禁用的
  const requestHeaders = new Headers(req.headers);
  
  // 剔除 Vercel/Node 自动添加的、可能导致上游拒绝的 Header
  requestHeaders.delete('host');
  requestHeaders.delete('content-length');
  requestHeaders.delete('connection'); // 参照 gemini-proxy
  requestHeaders.delete('accept-encoding'); // 参照 gemini-proxy
  requestHeaders.delete('x-vercel-id');
  requestHeaders.delete('x-forwarded-for');
  requestHeaders.delete('x-forwarded-proto');
  requestHeaders.delete('x-forwarded-host');
  requestHeaders.delete('x-real-ip');
  
  // 确保 User-Agent 存在 (有些 API 必须要有 UA)
  if (!requestHeaders.get('user-agent')) {
    requestHeaders.set('User-Agent', 'Mozilla/5.0 (compatible; Universal-Proxy/2.0)');
  }

  const fetchOptions = {
    method: req.method,
    headers: requestHeaders,
    redirect: 'manual',
    // 开启流式传输：只有非 GET/HEAD 才带 body
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null,
  };

  try {
    // --- 4. 发起请求 ---
    const response = await fetch(targetUrl.toString(), fetchOptions);

    // --- 5. 处理响应头 ---
    const responseHeaders = new Headers(response.headers);
    
    // 强制覆盖 CORS，确保浏览器/前端能读到
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Access-Control-Expose-Headers', '*'); // 允许前端读取所有返回头

    // 清理可能导致 Vercel 错误的响应头
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');

    // 处理重定向
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = responseHeaders.get('location');
      if (location) {
        const absoluteRedirectUrl = new URL(location, targetUrl).toString();
        const protocol = req.headers.get('x-forwarded-proto') || 'https';
        const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
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

    // 网页 HTML 重写 (保留功能)
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

    // 直接透传 Body (流式)
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
