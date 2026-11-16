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
