import { denied, fail, hasDb, db } from './_lib.js';

// Your phone reports here from an iOS Shortcut (see README): battery level and arriving/leaving home.
export function parse(b) {
  const rows = [];
  if (b.battery !== undefined) {
    const level = Math.round(Number(b.battery));
    if (!Number.isFinite(level) || level < 0 || level > 100) return null;
    rows.push({ key: 'phone.battery', value: { level, charging: b.charging === true || b.charging === 'true' || b.charging === 1 || b.charging === 'Yes' } });
  }
  if (b.event !== undefined) {
    if (b.event !== 'home' && b.event !== 'away') return null;
    rows.push({ key: 'phone.presence', value: { home: b.event === 'home' } });
  }
  return rows.length ? rows : null;
}

export async function GET(request) {
  const no = denied(request); if (no) return no;
  if (!hasDb()) return fail('Phone status needs a database: SUPABASE_URL and SUPABASE_SECRET_KEY are not set', 503);
  try {
    const out = {};
    for (const r of await db('dash_state?select=key,value,at&key=like.phone.*')) out[r.key.slice(6)] = Object.assign({ at: Date.parse(r.at) }, r.value);
    return Response.json(out);
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request) {
  const no = denied(request); if (no) return no;
  if (!hasDb()) return fail('Phone status needs a database', 503);
  const rows = parse(await request.json().catch(() => ({})));
  if (!rows) return fail('Send {"battery": 0-100, "charging": true/false} and/or {"event": "home" | "away"}', 400);
  try {
    const at = new Date().toISOString();
    await db('dash_state?on_conflict=key', { method: 'POST', body: rows.map((r) => Object.assign(r, { at })), prefer: 'resolution=merge-duplicates,return=minimal' });
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
