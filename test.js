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
