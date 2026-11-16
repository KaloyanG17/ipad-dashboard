import { denied, fail, hasDb, db, log } from './_lib.js';

const DAY = 864e5;

function top(rows, kind, n) {
  const counts = {};
  for (const r of rows) if (r.kind === kind) counts[r.name] = (counts[r.name] || 0) + 1;
  return Object.keys(counts).map((name) => ({ name, count: counts[name] })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, n);
}

// Turns raw events into what the stats page shows. Exported for the self-check.
export function aggregate(rows, now) {
  const days = [];
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) days.push({ day: new Date(start.getTime() - i * DAY).toISOString().slice(5, 10), songs: 0 });
  let focusWeek = 0, focusMinutes = 0;
  for (const r of rows) {
    const t = Date.parse(r.at);
    if (r.kind === 'song') {
      const i = 13 - Math.floor((start.getTime() + DAY - 1 - t) / DAY);
      if (days[i]) days[i].songs++;
    }
    if (r.kind === 'focus' && now - t < 7 * DAY) { focusWeek++; focusMinutes += Number(r.name) || 0; }
  }
  return { songs: top(rows, 'song', 15), scenes: top(rows, 'scene', 15), days, focusWeek, focusMinutes, total: rows.length };
}

export async function GET(request) {
  const no = denied(request); if (no) return no;
  if (!hasDb()) return fail('Stats need a database: SUPABASE_URL and SUPABASE_SECRET_KEY are not set', 503);
  try {
    // shortcut: aggregates the last 30 days in JS, capped at 5000 events; move to a SQL view if you outgrow that.
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const rows = await db('dash_events?select=kind,name,at&at=gte.' + since + '&order=at.desc&limit=5000');
    return Response.json(aggregate(rows, Date.now()));
  } catch (e) {
    return fail(e);
  }
}

// The page reports things only it can see: the song that just started, a finished focus session.
export async function POST(request) {
  const no = denied(request); if (no) return no;
  const b = await request.json().catch(() => ({}));
  if (!['song', 'focus'].includes(b.kind) || typeof b.name !== 'string' || !b.name || b.name.length > 120) return fail('Bad request', 400);
  // Two screens showing the dashboard both report the same song; the 10-minute key keeps one.
  await log(b.kind, b.name, b.kind === 'song' ? 'song:' + b.name + ':' + Math.floor(Date.now() / 6e5) : null);
  return Response.json({ ok: true });
}
