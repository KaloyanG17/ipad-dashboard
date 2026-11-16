// Local preview without the Vercel CLI: serves index.html and runs api/*.js the way Vercel does.
import http from 'node:http';
import fs from 'node:fs';


http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const route = /^\/api\/([a-z]+)$/.exec(url.pathname);
  if (!route) {
    if (url.pathname !== '/') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream('index.html').pipe(res);
  }
  try {
    const mod = await import('./api/' + route[1] + '.js');
    const fn = mod[req.method];
    if (!fn) { res.writeHead(405); return res.end(); }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const out = await fn(new Request(url, { method: req.method, headers: req.headers, body }));
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) {
    res.writeHead(404); res.end(String(e));
  }
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000) + '/?key=' + (process.env.DASH_KEY || '')));

