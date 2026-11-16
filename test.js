import assert from 'node:assert';
import { capability } from './api/govee.js';
import { denied } from './api/_lib.js';

assert.deepStrictEqual(capability('power', 1), { type: 'devices.capabilities.on_off', instance: 'powerSwitch', value: 1 });
assert.strictEqual(capability('brightness', 250).value, 100);
assert.strictEqual(capability('brightness', 0).value, 1);
assert.strictEqual(capability('color', 0xff3b30).value, 0xff3b30);
assert.strictEqual(capability('delete', 1), null);
assert.strictEqual(capability('power', 'abc'), null);

process.env.DASH_KEY = 'secret';
assert.strictEqual(denied(new Request('http://x/api/govee', { headers: { 'x-dash-key': 'secret' } })), null);
assert.strictEqual(denied(new Request('http://x/api/govee?key=secret')), null);
assert.strictEqual(denied(new Request('http://x/api/govee')).status, 401);
assert.strictEqual(denied(new Request('http://x/api/govee', { headers: { 'x-dash-key': 'nope' } })).status, 401);
delete process.env.DASH_KEY;
assert.strictEqual(denied(new Request('http://x/api/govee?key=')).status, 500);
console.log('self-check ok');

// Govee scenes
assert.deepStrictEqual(capability('scene', { id: 3853, paramId: 4280 }).value, { id: 3853, paramId: 4280 });
assert.strictEqual(capability('scene', { id: 'x' }), null);
assert.strictEqual(capability('diyScene', 12).instance, 'diyScene');

// Spotify commands
const { command } = await import('./api/spotify.js');
assert.deepStrictEqual(command({ action: 'playUri', uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' }), ['PUT', '/me/player/play', { context_uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' }]);
assert.deepStrictEqual(command({ action: 'playUri', uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC' })[2], { uris: ['spotify:track:4uLU6hMCjMI75M1A2tKUQC'] });
assert.deepStrictEqual(command({ action: 'playUri', uri: 'liked' }), ['LIKED']);
assert.strictEqual(command({ action: 'playUri', uri: 'https://evil.example' }), null);
assert.strictEqual(command({ action: 'volume', value: 150 })[1], '/me/player/volume?volume_percent=100');
assert.strictEqual(command({ action: 'shuffle', value: true })[1], '/me/player/shuffle?state=true');
assert.strictEqual(command({ action: 'device', id: '../../x' }), null);
assert.strictEqual(command({ action: 'nope' }), null);
console.log('scenes + spotify self-check ok');
assert.ok(command({ action: 'device', id: 'bf240235-73c9-48e1-b5f3-8c964a313834_amzn_1' }), 'Echo-style device ids are allowed');
console.log('device id check ok');

// Usage stats
const { aggregate } = await import('./api/usage.js');
const now2 = Date.UTC(2026, 10, 16, 15);
const ev = (kind, name, daysAgo) => ({ kind, name, at: new Date(now2 - daysAgo * 864e5).toISOString() });
const st = aggregate([ev('song', 'A', 0), ev('song', 'A', 1), ev('song', 'B', 0), ev('scene', 'Aurora', 2), ev('focus', '25', 1), ev('focus', '25', 9)], now2);
assert.deepStrictEqual(st.songs[0], { name: 'A', count: 2 });
assert.deepStrictEqual(st.scenes, [{ name: 'Aurora', count: 1 }]);
assert.strictEqual(st.days.length, 14);
assert.strictEqual(st.days[13].songs + st.days[12].songs, 3);
assert.strictEqual(st.focusWeek, 1);
assert.strictEqual(st.focusMinutes, 25);

// Phone reports
const { parse } = await import('./api/phone.js');
assert.deepStrictEqual(parse({ battery: '82', charging: 'Yes' }), [{ key: 'phone.battery', value: { level: 82, charging: true } }]);
assert.deepStrictEqual(parse({ event: 'home' }), [{ key: 'phone.presence', value: { home: true } }]);
assert.strictEqual(parse({ battery: 140 }), null);
assert.strictEqual(parse({ event: 'party' }), null);
assert.strictEqual(parse({}), null);

// iCloud album helpers
const { albumToken, albumHost, pick } = await import('./api/photos.js');
assert.strictEqual(albumToken('https://www.icloud.com/sharedalbum/#B0aGWZuqDGIuXyz'), 'B0aGWZuqDGIuXyz');
assert.strictEqual(albumToken('not a link!'), null);
assert.strictEqual(albumHost('B0aGWZuqDGIuXyz'), 'p36-sharedstreams.icloud.com');
assert.strictEqual(albumHost('A5xyzxyzxyzxyz'), 'p05-sharedstreams.icloud.com');
assert.strictEqual(pick({ 342: { checksum: 'a', height: '342' }, 1536: { checksum: 'b', height: '1536' }, 2049: { checksum: 'c', height: '2049' } }).checksum, 'b');
assert.strictEqual(pick({}), null);
console.log('stats + phone + photos self-check ok');

// Supabase key type check
const { keyProblem } = await import('./api/_lib.js');
const jwt = (role) => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.sig';
assert.strictEqual(keyProblem('sb_secret_abc123'), null);
assert.strictEqual(keyProblem(jwt('service_role')), null);
assert.match(keyProblem('sb_publishable_abc123'), /publishable/);
assert.match(keyProblem(jwt('anon')), /publishable/);
assert.match(keyProblem('hello'), /does not look like/);
console.log('key check ok');

// Govee music mode
const { musicModes } = await import('./api/govee.js');
assert.deepStrictEqual(capability('music', { mode: 5, rgb: 0xff0000 }).value, { musicMode: 5, sensitivity: 100, autoColor: 0, rgb: 0xff0000 });
assert.deepStrictEqual(capability('music', { mode: 3, sensitivity: 250 }).value, { musicMode: 3, sensitivity: 100, autoColor: 1 });
assert.strictEqual(capability('music', {}), null);
assert.deepStrictEqual(musicModes({ capabilities: [{ instance: 'musicMode', parameters: { fields: [{ fieldName: 'musicMode', options: [{ name: 'Energic', value: 5 }, { name: 'Rhythm', value: 3 }] }, { fieldName: 'sensitivity' }] } }] }), [{ name: 'Energic', value: 5 }, { name: 'Rhythm', value: 3 }]);
assert.deepStrictEqual(musicModes({}), []);
console.log('music mode check ok');
