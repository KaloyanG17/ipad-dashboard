import { denied, fail } from './_lib.js';

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative user-library-read';
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

async function spotify(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + (await accessToken()), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 204 || r.status === 202) return null;
  const j = await r.json().catch(() => ({}));
  const player = path.startsWith('/me/player');
  if (r.status === 404 && player) throw new Error('No active device: start Spotify somewhere, or pick a device in Browse → Devices');
  if (r.status === 403) throw new Error(player ? 'Spotify Premium is needed for playback control' : 'Reconnect Spotify to allow this: open /api/spotify?login on your PC');
  if (!r.ok) throw new Error('Spotify: ' + ((j.error && j.error.message) || 'HTTP ' + r.status));
  return j;
}

const smallest = (imgs) => (imgs && imgs.length ? imgs[imgs.length - 1].url : null);
const names = (a) => (a || []).map((x) => x.name).join(', ');
const page = (body) => new Response('<!doctype html><meta name=viewport content="width=device-width"><body style="font:16px system-ui;padding:24px;max-width:640px">' + body, { headers: { 'Content-Type': 'text/html' } });

async function view(name, q) {
  if (name === 'playlists') {
    const j = await spotify('GET', '/me/playlists?limit=50');
    return [{ name: 'Liked Songs', sub: 'Your saved tracks', img: null, uri: 'liked' }].concat(
      (j.items || []).filter(Boolean).map((p) => ({ name: p.name, sub: 'Playlist · ' + ((p.owner && p.owner.display_name) || ''), img: smallest(p.images), uri: p.uri })));
  }
  if (name === 'search') {
    if (!q) return [];
    const j = await spotify('GET', '/search?limit=10&type=track,artist,album,playlist&q=' + encodeURIComponent(q.slice(0, 100)));
    const out = [];
    for (const t of (j.tracks && j.tracks.items) || []) if (t) out.push({ name: t.name, sub: 'Song · ' + names(t.artists), img: smallest(t.album && t.album.images), uri: t.uri });
    for (const a of (j.artists && j.artists.items) || []) if (a) out.push({ name: a.name, sub: 'Artist', img: smallest(a.images), uri: a.uri });
    for (const a of (j.albums && j.albums.items) || []) if (a) out.push({ name: a.name, sub: 'Album · ' + names(a.artists), img: smallest(a.images), uri: a.uri });
    for (const p of (j.playlists && j.playlists.items) || []) if (p) out.push({ name: p.name, sub: 'Playlist', img: smallest(p.images), uri: p.uri });
    return out;
  }
  if (name === 'devices') {
    const j = await spotify('GET', '/me/player/devices');
    return (j.devices || []).map((d) => ({ id: d.id, name: d.name, sub: d.type + (d.is_active ? ' · playing here' : ''), active: d.is_active }));
  }
  throw new Error('Unknown view');
}

export async function GET(request) {
  const url = new URL(request.url);
  const redirect = url.origin + '/api/spotify';
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret, SPOTIFY_REFRESH_TOKEN: refresh } = process.env;

  // Setup / reconnect: /api/spotify?login. Whoever logs in only ever gets a token for their own account.
  if (url.searchParams.has('login') || url.searchParams.has('code')) {
    if (!id || !secret) return page('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first.');
    if (url.searchParams.has('login')) {
      return Response.redirect(ACCOUNTS + '/authorize?' + new URLSearchParams({ response_type: 'code', client_id: id, scope: SCOPES, redirect_uri: redirect, show_dialog: 'true' }), 302);
    }
    try {
      const j = await tokenRequest({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: redirect });
      return page('<h2>Spotify connected</h2><p>Put this in the <b>SPOTIFY_REFRESH_TOKEN</b> environment variable in Vercel (replace the old one), then redeploy:</p><textarea rows=6 style="width:100%">' + j.refresh_token + '</textarea>');
    } catch (e) {
      return page('Login failed: ' + e.message);
    }
  }

  const no = denied(request); if (no) return no;
  if (!refresh) return fail('Spotify is not connected yet: open /api/spotify?login on your PC', 503);
  try {
    if (url.searchParams.has('view')) return Response.json(await view(url.searchParams.get('view'), url.searchParams.get('q')));
    const p = await spotify('GET', '/me/player');
    if (!p || !p.item) return Response.json({ active: false });
    const it = p.item, imgs = (it.album && it.album.images) || it.images || [];
    const d = p.device || {};
    return Response.json({
      active: true,
      playing: p.is_playing,
      title: it.name,
      artist: names(it.artists) || (it.show && it.show.name) || '',
      art: imgs.length ? imgs[Math.max(0, imgs.length - 2)].url : null,
      progress: p.progress_ms || 0,
      duration: it.duration_ms || 0,
      shuffle: !!p.shuffle_state,
      device: d.name || '',
      volume: d.supports_volume === false ? null : d.volume_percent,
    });
  } catch (e) {
    return fail(e);
  }
}

const SIMPLE = { play: ['PUT', '/me/player/play'], pause: ['PUT', '/me/player/pause'], next: ['POST', '/me/player/next'], previous: ['POST', '/me/player/previous'] };
const URI = /^spotify:(track|album|playlist|artist|show|episode):[A-Za-z0-9]{10,40}$/;

// Turns a dashboard action into a Spotify call: [method, path, body]. Exported for the self-check.
export function command(b) {
  if (SIMPLE[b.action]) return SIMPLE[b.action];
  if (b.action === 'playUri') {
    if (b.uri === 'liked') return ['LIKED'];
    if (!URI.test(b.uri || '')) return null;
    return ['PUT', '/me/player/play', /^spotify:(track|episode):/.test(b.uri) ? { uris: [b.uri] } : { context_uri: b.uri }];
  }
  if (b.action === 'volume' && Number.isFinite(b.value)) return ['PUT', '/me/player/volume?volume_percent=' + Math.min(100, Math.max(0, Math.round(b.value)))];
  if (b.action === 'shuffle') return ['PUT', '/me/player/shuffle?state=' + (b.value ? 'true' : 'false')];
  if (b.action === 'device' && /^[\w-]{10,80}$/.test(b.id || '')) return ['PUT', '/me/player', { device_ids: [b.id], play: true }];
  return null;
}

export async function POST(request) {
  const no = denied(request); if (no) return no;
  const b = await request.json().catch(() => ({}));
  const c = command(b);
  if (!c) return fail('Bad request', 400);
  try {
    if (c[0] === 'LIKED') {
      const j = await spotify('GET', '/me/tracks?limit=50');
      const uris = (j.items || []).map((i) => i.track && i.track.uri).filter(Boolean);
      if (!uris.length) throw new Error('No liked songs yet');
      await spotify('PUT', '/me/player/play', { uris });
    } else {
      await spotify(c[0], c[1], c[2]);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
