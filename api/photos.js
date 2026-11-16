import { denied, fail } from './_lib.js';

// Photos for the idle slideshow, from an iCloud Shared Album with "Public Website" turned on.
// ICLOUD_ALBUM = the album's public link (https://www.icloud.com/sharedalbum/#B0abc…) or just the part after #.
// Apple has no official API for this; these are the calls the public album web page itself makes.
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
let cache = null, cacheAt = 0;

export function albumToken(v) {
  const t = String(v || '').split('#').pop().split(';')[0].trim();
  return /^[A-Za-z0-9_-]{10,40}$/.test(t) ? t : null;
}

// The server that holds an album is encoded in the first characters of its token.
export function albumHost(token) {
  const n = token[0] === 'A' ? B62.indexOf(token[1]) : B62.indexOf(token[1]) * 62 + B62.indexOf(token[2]);
  return 'p' + String(n).padStart(2, '0') + '-sharedstreams.icloud.com';
}

// Smallest version that still looks sharp on a 2048px-wide screen, to go easy on an old iPad's memory.
export function pick(derivatives) {
  const list = Object.values(derivatives || {}).filter((d) => d.checksum).sort((a, b) => Number(a.height) - Number(b.height));
  return list.find((d) => Number(d.height) >= 1000) || list[list.length - 1] || null;
}

async function post(host, token, path, body) {
  const r = await fetch('https://' + host + '/' + token + '/sharedstreams/' + path, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 330 && j['X-Apple-MMe-Host']) return { moved: j['X-Apple-MMe-Host'] };
  if (!r.ok) throw new Error('iCloud album: HTTP ' + r.status + ' (is "Public Website" on for the album?)');
  return j;
}

export async function GET(request) {
  const no = denied(request); if (no) return no;
  const token = albumToken(process.env.ICLOUD_ALBUM);
  if (!token) return fail('ICLOUD_ALBUM is not set (or is not a shared-album link)', 503);
  if (cache && Date.now() - cacheAt < 18e5) return Response.json(cache); // the photo links expire, so only 30 min
  try {
    let host = albumHost(token);
    let stream = await post(host, token, 'webstream', { streamCtag: null });
    if (stream.moved) { host = stream.moved; stream = await post(host, token, 'webstream', { streamCtag: null }); }
    const photos = (stream.photos || []).filter((p) => p.mediaAssetType !== 'video').slice(-60);
    const wanted = photos.map((p) => pick(p.derivatives)).filter(Boolean);
    if (!wanted.length) return Response.json([]);
    const assets = await post(host, token, 'webasseturls', { photoGuids: photos.map((p) => p.photoGuid) });
    const items = assets.items || {};
    cache = wanted.map((d) => items[d.checksum] && 'https://' + items[d.checksum].url_location + items[d.checksum].url_path).filter(Boolean);
    cacheAt = Date.now();
    return Response.json(cache);
  } catch (e) {
    return fail(e);
  }
}
