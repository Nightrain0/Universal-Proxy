/**
 * Vercel Serverless Function - 智能网页代理
 * 功能：
 * 1. 支持跨域 (CORS)
 * 2. 自动重写 HTML 中的相对路径 (href, src, action)
 * 3. 自动重写 3xx 重定向跳转
 */

export default async function handler(req, res) {
  // --- 1. CORS 配置 (保持不变) ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // --- 2. 参数获取 ---
  const { url } = req.query;

  if (!url) {
    return res.status(400).send(`
      <style>body{font-family:sans-serif;padding:2rem;text-align:center;color:#333}</style>
      <h1>Vercel Proxy 运行正常</h1>
      <p>请在 URL 参数中提供目标地址。</p>
      <code>/api/index?url=https://www.google.com</code>
    `);
  }

  try {
    const targetUrl = new URL(url);
    
    // 构造请求头
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    
    // 转发请求体 (如果是 POST/PUT)
    const fetchOptions = {
      method: req.method,
      headers: headers,
      redirect: 'manual', // 禁止自动跟随重定向，我们需要手动修改 Location
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
        const contentType = req.headers['content-type'] || '';
        fetchOptions.headers['Content-Type'] = contentType;
        fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
    }

    // --- 3. 发起请求 ---
    const response = await fetch(targetUrl.toString(), fetchOptions);

    // --- 4. 处理重定向 (301, 302, 303, 307, 308) ---
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        // 将重定向的目标地址也包裹在代理中
        const absoluteRedirectUrl = new URL(location, targetUrl).toString();
        // 获取当前代理的根路径 (根据请求头推断)
        const host = req.headers['x-forwarded-host'] || req.headers['host'];
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const proxyBase = `${protocol}://${host}/api/index?url=`;
        
        res.setHeader('Location', proxyBase + encodeURIComponent(absoluteRedirectUrl));
        res.status(response.status).end();
        return;
      }
    }

    // --- 5. 处理响应 ---
    // 转发 content-type
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    // 如果是 HTML 页面，需要重写里面的链接
    if (contentType && contentType.includes('text/html')) {
      const htmlText = await response.text();
      
      // 获取当前代理的基础 URL，用于构建重写后的链接
      // 例如: https://my-app.vercel.app/api/index?url=
      const host = req.headers['x-forwarded-host'] || req.headers['host'];
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const proxyUrlBase = `${protocol}://${host}${req.url.split('?')[0]}?url=`;

      // 定义替换函数：将相对路径转为绝对路径，并套上代理外壳
      const rewriteUrl = (matchedAttribute, rawUrl) => {
        try {
          // 忽略已经是代理过的链接、空链接、以及特殊的协议 (data:, javascript:, #, mailto:)
          if (!rawUrl || rawUrl.startsWith(proxyUrlBase) || rawUrl.startsWith('#') || rawUrl.startsWith('data:') || rawUrl.startsWith('javascript:') || rawUrl.startsWith('mailto:')) {
            return `${matchedAttribute}="${rawUrl}"`;
          }

          // 将相对路径解析为绝对路径 (基于 targetUrl)
          const absoluteUrl = new URL(rawUrl, targetUrl).toString();
          
          // 返回编码后的代理链接
          return `${matchedAttribute}="${proxyUrlBase}${encodeURIComponent(absoluteUrl)}"`;
        } catch (e) {
          return `${matchedAttribute}="${rawUrl}"`;
        }
      };

      // 使用正则替换 href, src, action 属性
      // 注意：这种正则替换比较粗暴，对于复杂 JS 动态加载的资源可能无效
      const newHtml = htmlText
        .replace(/(href|src|action)=["']([^"']+)["']/g, (match, attr, url) => rewriteUrl(attr, url))
        // 尝试修复 CSS 中的 url(...)
        .replace(/url\((['"]?)([^'")]+)\1\)/g, (match, quote, url) => {
            try {
                 if (url.startsWith('data:') || url.startsWith('#')) return match;
                 const absoluteUrl = new URL(url, targetUrl).toString();
                 return `url(${quote}${proxyUrlBase}${encodeURIComponent(absoluteUrl)}${quote})`;
            } catch(e) { return match; }
        });

      res.status(response.status).send(newHtml);

    } else {
      // 如果不是 HTML (是图片、JS、JSON 等)，直接转发二进制数据
      const buffer = await response.arrayBuffer();
      res.status(response.status).send(Buffer.from(buffer));
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Proxy Request Failed', message: error.message });
  }
}
