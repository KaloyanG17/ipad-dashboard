// Zero-dependency dashboard server: node server.js  (node server.js --test runs the self-check)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const LOGS = path.join(os.homedir(), '.claude', 'projects');

function aggregate(lines, now) {
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const weekStart = dayStart.getTime() - 6 * 864e5;
  const seen = new Set();
  const s = {
    today: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, total: 0, messages: 0 },
    week: { total: 0, messages: 0 },
    hourly: new Array(24).fill(0),
    days: new Array(7).fill(0),
    models: {},
    lastActivity: null,
  };
  for (const line of lines) {
    if (line.indexOf('"usage"') < 0) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const m = e.message, u = m && m.usage;
    if (!u || !e.timestamp) continue;
    // Claude Code writes the same message several times while streaming; count it once.
    const key = m.id + ':' + (e.requestId || '');
    if (seen.has(key)) continue;
    seen.add(key);
    const t = Date.parse(e.timestamp);
    if (t < weekStart || t > now + 6e4) continue;
    const inp = u.input_tokens || 0, out = u.output_tokens || 0;
    const cw = u.cache_creation_input_tokens || 0, cr = u.cache_read_input_tokens || 0;
    const total = inp + out + cw + cr;
    s.week.total += total; s.week.messages++;
    s.days[Math.min(6, Math.floor((t - weekStart) / 864e5))] += total;
    if (!s.lastActivity || t > s.lastActivity) s.lastActivity = t;
    if (t < dayStart.getTime()) continue;
    const d = s.today;
    d.input += inp; d.output += out; d.cacheWrite += cw; d.cacheRead += cr; d.total += total; d.messages++;
    s.hourly[new Date(t).getHours()] += total;
    const model = (m.model || 'unknown').replace(/^claude-/, '');
    if (model !== '<synthetic>') s.models[model] = (s.models[model] || 0) + total;
  }
  return s;
}

function readLines() {
  // shortcut: re-reads every log on each request; fine for hundreds of files, add mtime caching if it gets slow.
  const lines = [];
  const cutoff = Date.now() - 8 * 864e5;
  let files = [];
  try { files = fs.readdirSync(LOGS, { recursive: true }); } catch { return lines; }
  for (const f of files) {
    if (!f.endsWith('.jsonl')) continue;
    const p = path.join(LOGS, f);
    try {
      if (fs.statSync(p).mtimeMs < cutoff) continue;
      for (const l of fs.readFileSync(p, 'utf8').split('\n')) lines.push(l);
    } catch {}
  }
  return lines;
}

if (process.argv.includes('--test')) {
  const assert = require('assert');
  const now = new Date(2026, 10, 16, 15, 0).getTime();
  const msg = (id, ts, model, u) => JSON.stringify({ timestamp: new Date(ts).toISOString(), requestId: 'r' + id, message: { id, model, usage: u } });
  const u = { input_tokens: 1, output_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000 };
  const s = aggregate([
    msg('a', now - 36e5, 'claude-opus-5-5', u),
    msg('a', now - 36e5, 'claude-opus-5-5', u),          // streaming duplicate
    msg('b', now - 2 * 864e5, 'claude-sonnet-5-5', u),   // earlier this week
    msg('c', now - 9 * 864e5, 'claude-opus-5-5', u),     // outside the week
    'not json', '{"type":"user"}',
  ], now);
  assert.strictEqual(s.today.total, 1111);
  assert.strictEqual(s.today.messages, 1);
  assert.strictEqual(s.week.total, 2222);
  assert.strictEqual(s.hourly[14], 1111);
  assert.deepStrictEqual(s.models, { 'opus-5-5': 1111 });
  assert.strictEqual(s.days[6], 1111);
  console.log('self-check ok');
  process.exit(0);
}

const page = path.join(__dirname, 'index.html');
http.createServer((req, res) => {
  if (req.url === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(Object.assign(aggregate(readLines(), Date.now()), { now: Date.now() })));
  } else if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(page).pipe(res);
  } else {
    res.writeHead(404); res.end();
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log('Dashboard running. Open one of these on the iPad:');
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list) if (a.family === 'IPv4' && !a.internal) console.log('  http://' + a.address + ':' + PORT);
});
