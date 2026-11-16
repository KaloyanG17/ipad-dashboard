import { denied, fail } from './_lib.js';

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
let token = null, tokenExp = 0;

async function tokenRequest(params) {
  const auth = Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64');
  const r = await fetch(ACCOUNTS + '/api/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Spotify: ' + (j.error_description || j.error || 'HTTP ' + r.status));
  return j;
}

async function accessToken() {
  if (token && Date.now() < tokenExp) return token;
  const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: process.env.SPOTIFY_REFRESH_TOKEN });
  token = j.access_token;
  tokenExp = Date.now() + (j.expires_in - 60) * 1000;
  return token;
}

async function spotify(method, path) {
  const r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + (await accessToken()) }, signal: AbortSignal.timeout(8000) });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (r.status === 404) throw new Error('Open Spotify on a phone, PC or speaker first');
  if (r.status === 403) throw new Error('Spotify Premium is needed for playback control');
  if (!r.ok) throw new Error('Spotify: ' + ((j.error && j.error.message) || 'HTTP ' + r.status));
  return j;
}

const page = (body) => new Response('<!doctype html><meta name=viewport content="width=device-width"><body style="font:16px system-ui;padding:24px;max-width:640px">' + body, { headers: { 'Content-Type': 'text/html' } });

export async function GET(request) {
  const url = new URL(request.url);
  const redirect = url.origin + '/api/spotify';
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret, SPOTIFY_REFRESH_TOKEN: refresh } = process.env;

  // One-time setup: /api/spotify?login. Turned off once a refresh token is saved.
  if (!refresh && (url.searchParams.has('login') || url.searchParams.has('code'))) {
    if (!id || !secret) return page('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first.');
    if (url.searchParams.has('login')) {
      return Response.redirect(ACCOUNTS + '/authorize?' + new URLSearchParams({ response_type: 'code', client_id: id, scope: SCOPES, redirect_uri: redirect }), 302);
    }
    try {
      const j = await tokenRequest({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: redirect });
      return page('<h2>Spotify connected</h2><p>Add this as the <b>SPOTIFY_REFRESH_TOKEN</b> environment variable in Vercel, then redeploy:</p><textarea rows=6 style="width:100%">' + j.refresh_token + '</textarea>');
    } catch (e) {
      return page('Login failed: ' + e.message);
    }
  }

  const no = denied(request); if (no) return no;
  if (!refresh) return fail('Spotify is not connected yet: open /api/spotify?login on your PC', 503);
  try {
    const p = await spotify('GET', '/me/player/currently-playing');
    if (!p || !p.item) return Response.json({ active: false });
    const it = p.item, imgs = (it.album && it.album.images) || (it.images || []);
    return Response.json({
      active: true,
      playing: p.is_playing,
      title: it.name,
      artist: (it.artists || []).map((a) => a.name).join(', ') || (it.show && it.show.name) || '',
      art: imgs.length ? imgs[Math.max(0, imgs.length - 2)].url : null,
      progress: p.progress_ms || 0,
      duration: it.duration_ms || 0,
    });
  } catch (e) {
    return fail(e);
  }
}

const ACTIONS = { play: ['PUT', '/me/player/play'], pause: ['PUT', '/me/player/pause'], next: ['POST', '/me/player/next'], previous: ['POST', '/me/player/previous'] };

export async function POST(request) {
  const no = denied(request); if (no) return no;
  const b = await request.json().catch(() => ({}));
  const a = ACTIONS[b.action];
  if (!a) return fail('Bad request', 400);
  try {
    await spotify(a[0], a[1]);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
