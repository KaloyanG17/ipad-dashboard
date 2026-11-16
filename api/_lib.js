// Files starting with _ are not deployed as routes by Vercel.

// Every route that controls something or calls a paid/limited API needs the dashboard key,
// otherwise anyone who finds the URL could switch your lights or skip your songs.
export function denied(request) {
  const key = process.env.DASH_KEY;
  if (!key) return Response.json({ error: 'DASH_KEY is not set on the server' }, { status: 500 });
  const got = request.headers.get('x-dash-key') || new URL(request.url).searchParams.get('key');
  return got === key ? null : Response.json({ error: 'Wrong or missing dashboard key' }, { status: 401 });
}

export function fail(e, status = 502) {
  return Response.json({ error: String((e && e.message) || e) }, { status });
}

// Supabase over its REST API. The secret key stays on the server; the tables have row-level
// security on with no policies, so nothing but this server can read or write them.
export const hasDb = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

// A publishable/anon key looks like it works (reads just come back empty), so catch it by name.
export function keyProblem(key) {
  const k = String(key || '').trim();
  let role = '';
  if (k.startsWith('eyJ')) try { role = JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role; } catch {}
  if (k.startsWith('sb_publishable_') || role === 'anon') return 'SUPABASE_SECRET_KEY holds the publishable key. Paste the secret key instead (Supabase → Settings → API Keys → Secret keys).';
  if (!k.startsWith('sb_secret_') && role !== 'service_role') return 'SUPABASE_SECRET_KEY does not look like a Supabase secret key (it should start with sb_secret_).';
  return null;
}

export async function db(path, { method = 'GET', body, prefer } = {}) {
  const key = process.env.SUPABASE_SECRET_KEY.trim();
  const problem = keyProblem(key);
  if (problem) throw new Error(problem);
  const r = await fetch(process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path, {
    method,
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error('Database: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
  return r.status === 204 || method !== 'GET' ? null : r.json();
}

// Record one usage event. Never throws: stats must not break the lights or the music.
export async function log(kind, name, dedupe) {
  if (!hasDb()) return;
  try {
    await db('dash_events?on_conflict=dedupe', { method: 'POST', body: { kind, name: String(name).slice(0, 120), dedupe: dedupe || null }, prefer: 'resolution=ignore-duplicates,return=minimal' });
  } catch (e) {
    console.error('usage log failed:', e.message);
  }
}
