/**
 * Vercel Proxy - Edge Runtime Edition (参数修复版)
 * * 修复: 解决了 URL 参数 (如 ?alt=sse, ?key=...) 在转发过程中丢失的问题。
 * * 机制: 自动提取并拼接所有剩余查询参数。
 */

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const reqUrl = new URL(req.url);
  const targetUrlRaw = reqUrl.searchParams.get('url');

  // --- 1. 处理 CORS ---
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  // --- 2. 参数校验与重组 (核心修复) ---
  if (!targetUrlRaw) {
    return new Response('Missing "url" parameter', { status: 400 });
  }

  let targetUrl;
  try {
    targetUrl = new URL(targetUrlRaw);

    // ✨✨✨ 关键修复：补回丢失的 URL 参数 ✨✨✨
    // 遍历当前请求的所有参数，除了 'url' 本身，其他都加回目标 URL
    // 这能解决 ?alt=sse 或 &key=xxx 丢失导致流式失败的问题
    reqUrl.searchParams.forEach((value, key) => {
      if (key !== 'url') {
        targetUrl.searchParams.append(key, value);
      }
    });

  } catch (e) {
    return new Response(`Invalid URL: ${e.message}`, { status: 400 });
  }

  // --- 3. 构建请求头 ---
  const requestHeaders = new Headers(req.headers);
  
  // 这里的清理逻辑参照了你提供的 gemini-proxy
  requestHeaders.delete('host');
  requestHeaders.delete('content-length');
  requestHeaders.delete('connection');
  requestHeaders.delete('accept-encoding');
  requestHeaders.delete('x-vercel-id');
  requestHeaders.delete('x-forwarded-for');
  requestHeaders.delete('x-forwarded-proto');
  requestHeaders.delete('x-forwarded-host');
  requestHeaders.delete('x-real-ip');
  
  // 确保 User-Agent 存在
  if (!requestHeaders.get('user-agent')) {
    requestHeaders.set('User-Agent', 'Mozilla/5.0 (compatible; Universal-Proxy/2.0)');
  }

  const fetchOptions = {
    method: req.method,
    headers: requestHeaders,
    redirect: 'manual',
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null,
  };

  try {
    // --- 4. 发起请求 ---
    const response = await fetch(targetUrl.toString(), fetchOptions);

    // --- 5. 处理响应头 ---
    const responseHeaders = new Headers(response.headers);
    
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Access-Control-Expose-Headers', '*');

    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');

    // 处理重定向
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = responseHeaders.get('location');
      if (location) {
        const absoluteRedirectUrl = new URL(location, targetUrl).toString();
        // 简单处理：直接返回 Location 头，让客户端自己去跳（如果通过代理跳太复杂）
        // 或者构造代理跳转链接：
        const protocol = req.headers.get('x-forwarded-proto') || 'https';
        const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
        // 这里需要注意，如果在 Vercel Edge 中，host 可能不准确，尽量使用相对路径
        const proxyUrl = `/api/index?url=${encodeURIComponent(absoluteRedirectUrl)}`;
        
        responseHeaders.set('Location', proxyUrl);
        return new Response(null, {
          status: response.status,
          headers: responseHeaders,
        });
      }
    }

    // --- 6. 响应内容处理 ---
    const contentType = responseHeaders.get('content-type') || '';

    // 网页 HTML 重写
    if (contentType.includes('text/html')) {
      const htmlText = await response.text();
      // 简单重写逻辑...
      // Edge 环境下获取 host 比较麻烦，这里简化处理，主要服务于 API 场景
      return new Response(htmlText, {
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
