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

const MOCK = {
  lights: [{ sku: 'H6056', device: 'AA:01', name: 'Desk bars', online: true, on: true, brightness: 80 }, { sku: 'H6046', device: 'AA:02', name: 'Bed bar', online: true, on: false, brightness: 40 }],
  scenes: ['Sunrise', 'Sunset', 'Aurora', 'Forest', 'Ocean', 'Fire', 'Candlelight', 'Party', 'Romantic', 'Rainbow', 'Starry sky', 'Movie'].map((n, i) => ({ name: n, kind: 'scene', value: { id: i, paramId: i } }))
    .concat([{ name: 'My chill', kind: 'diyScene', value: 7 }]),
  now: { active: true, playing: true, title: 'Mock Song Title', artist: 'Some Artist', art: null, progress: 60000, duration: 200000, shuffle: false, device: 'Kaloyan PC', volume: 55 },
  playlists: [{ name: 'Liked Songs', sub: 'Your saved tracks', img: null, uri: 'liked' }, { name: 'Gym', sub: 'Playlist · me', img: null, uri: 'spotify:playlist:aaaaaaaaaaaaaaaa' }, { name: 'Chill evening', sub: 'Playlist · me', img: null, uri: 'spotify:playlist:bbbbbbbbbbbbbbbb' }],
  search: [{ name: 'Lose Yourself', sub: 'Song · Eminem', img: null, uri: 'spotify:track:cccccccccccccccc' }, { name: 'Eminem', sub: 'Artist', img: null, uri: 'spotify:artist:dddddddddddddddd' }],
  devices: [{ id: 'dev1aaaaaaaaaa', name: 'Kaloyan PC', sub: 'Computer · playing here', active: true }, { id: 'dev2bbbbbbbbbb', name: 'Phone', sub: 'Smartphone' }],
};
