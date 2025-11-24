/**
 * Vercel Serverless Function - 通用代理
 * * 使用方法:
 * GET /api?url=https://api.example.com/data
 * POST /api?url=https://api.example.com/submit (Body会被转发)
 */

export default async function handler(req, res) {
  // 1. 设置 CORS 头部，允许跨域访问
  // 这允许你在本地开发环境或其他域名下调用此代理
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // 2. 处理 OPTIONS 预检请求 (浏览器跨域检查)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 3. 获取目标 URL
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ 
      error: '缺少 url 参数', 
      usage: '/api?url=https://target-url.com' 
    });
  }

  try {
    // 验证 URL 格式
    const targetUrl = new URL(url);

    // 4. 构建转发请求的选项
    const options = {
      method: req.method,
      headers: {
        ...req.headers,
        // 覆盖 Host 头部，避免目标服务器拒绝
        host: targetUrl.host, 
      },
    };

    // 移除 Vercel 自动添加的一些干扰性头部或不需要转发的头部
    delete options.headers['host'];
    delete options.headers['connection'];
    delete options.headers['x-forwarded-for'];
    delete options.headers['x-vercel-deployment-url'];
    delete options.headers['x-vercel-forwarded-for'];

    // 如果有请求体 (POST/PUT等)，且不是 GET/HEAD，则转发 body
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      // Vercel 解析 body 为对象，fetch 需要字符串或 Buffer
      // 如果 header 是 json，stringify；否则直接传
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        options.body = JSON.stringify(req.body);
      } else {
        options.body = req.body;
      }
    }

    // 5. 发起请求到目标服务器
    const response = await fetch(targetUrl.toString(), options);

    // 6. 处理响应
    // 将目标服务器的响应头转发回客户端
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      // 避免跨域问题，部分头部可能需要过滤，这里暂且全量转发
      // 但通常 Transfer-Encoding 和 Content-Encoding 需要小心
      if (key !== 'content-encoding' && key !== 'transfer-encoding') {
         res.setHeader(key, value);
      }
    });

    // 读取响应内容
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 发送响应状态码和内容
    res.status(response.status).send(buffer);

  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ 
      error: '代理请求失败', 
      details: error.message 
    });
  }
}