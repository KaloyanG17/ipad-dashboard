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
