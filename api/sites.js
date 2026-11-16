import { denied } from './_lib.js';

// SITES env var: comma-separated URLs, e.g. "https://mysite.com,https://api.mysite.com/health"
export async function GET(request) {
  const no = denied(request); if (no) return no;
  const urls = (process.env.SITES || '').split(',').map((s) => s.trim()).filter(Boolean);
  const results = await Promise.all(urls.map(async (url) => {
    const t = Date.now();
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'uptime-dashboard' } });
      if (r.body) r.body.cancel();
      return { url, up: r.status < 400, status: r.status, ms: Date.now() - t };
    } catch {
      return { url, up: false, status: 0, ms: Date.now() - t };
    }
  }));
  return Response.json(results);
}
