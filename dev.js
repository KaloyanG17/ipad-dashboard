// Local preview without the Vercel CLI: serves index.html and runs api/*.js the way Vercel does.
import http from 'node:http';
import fs from 'node:fs';

// `npm run mock` works with no setup at all: sample data, key "demo", two public sites.
if (process.argv.includes('--mock')) {
  process.env.MOCK = '1';
  process.env.DASH_KEY = process.env.DASH_KEY || 'demo';
  process.env.SITES = process.env.SITES || 'https://example.com,https://github.com';
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const route = /^\/api\/([a-z]+)$/.exec(url.pathname);
  if (!route) {
    if (url.pathname !== '/') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream('index.html').pipe(res);
  }
  // MOCK=1 npm run dev: sample data instead of real Govee/Spotify, for trying the UI safely.
  if (process.env.MOCK && (route[1] === 'govee' || route[1] === 'spotify')) {
    const q = url.searchParams, out = req.method === 'POST' ? { ok: true }
      : route[1] === 'govee' ? (q.has('scenes') ? MOCK.scenes : MOCK.lights)
      : q.has('view') ? MOCK[q.get('view')] : MOCK.now;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(out));
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

const art = (a, b) => 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>').toString('base64');

const MOCK = {
  lights: [{ sku: 'H6056', device: 'AA:01', name: 'Desk light bars', online: true, on: true, brightness: 80 }, { sku: 'H6046', device: 'AA:02', name: 'Bed bar', online: true, on: false, brightness: 40 }],
  scenes: ['Sunrise', 'Sunset', 'Aurora', 'Forest', 'Ocean', 'Fire', 'Candlelight', 'Party', 'Romantic', 'Rainbow', 'Starry sky', 'Movie'].map((n, i) => ({ name: n, kind: 'scene', value: { id: i, paramId: i } }))
    .concat([{ name: 'My chill', kind: 'diyScene', value: 7 }]),
  now: { active: true, playing: true, title: 'Midnight Drive', artist: 'Sample Artist', art: art('#f2b04a', '#7a2d6b'), progress: 60000, duration: 200000, shuffle: false, device: 'Living room speaker', volume: 55 },
  playlists: [{ name: 'Liked Songs', sub: 'Your saved tracks', img: null, uri: 'liked' }, { name: 'Gym', sub: 'Playlist · me', img: art('#ff3b30', '#ff9500'), uri: 'spotify:playlist:aaaaaaaaaaaaaaaa' }, { name: 'Chill evening', sub: 'Playlist · me', img: art('#0a84ff', '#bf5af2'), uri: 'spotify:playlist:bbbbbbbbbbbbbbbb' }],
  search: [{ name: 'Lose Yourself', sub: 'Song · Eminem', img: null, uri: 'spotify:track:cccccccccccccccc' }, { name: 'Eminem', sub: 'Artist', img: null, uri: 'spotify:artist:dddddddddddddddd' }],
  devices: [{ id: 'dev1aaaaaaaaaa', name: 'Desktop PC', sub: 'Computer · playing here', active: true }, { id: 'dev2bbbbbbbbbb', name: 'Phone', sub: 'Smartphone' }],
};
