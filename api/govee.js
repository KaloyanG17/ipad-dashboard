import { denied, fail, log } from './_lib.js';

// Govee Open API. Key: Govee Home app → Profile → Settings → Apply for API Key.
const BASE = 'https://openapi.api.govee.com/router/api/v1';
let devices = null, devicesAt = 0;

async function govee(path, body) {
  const r = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Govee-API-Key': process.env.GOVEE_API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.code && j.code !== 200)) throw new Error('Govee: ' + (j.message || j.msg || 'HTTP ' + r.status));
  return j;
}

export function capability(action, value) {
  if (action === 'scene') {
    return value && Number.isFinite(value.id) && Number.isFinite(value.paramId)
      ? { type: 'devices.capabilities.dynamic_scene', instance: 'lightScene', value: { id: value.id, paramId: value.paramId } } : null;
  }
  // The light's own microphone drives it; rgb fixes the colour it pulses in, otherwise the light picks colours itself.
  if (action === 'music') {
    if (!value || !Number.isFinite(value.mode)) return null;
    const v = { musicMode: value.mode, sensitivity: Number.isFinite(value.sensitivity) ? Math.min(100, Math.max(0, Math.round(value.sensitivity))) : 100 };
    if (Number.isFinite(value.rgb)) { v.autoColor = 0; v.rgb = value.rgb & 0xffffff; } else v.autoColor = 1;
    return { type: 'devices.capabilities.music_setting', instance: 'musicMode', value: v };
  }
  if (action === 'diyScene') return Number.isFinite(value) ? { type: 'devices.capabilities.dynamic_scene', instance: 'diyScene', value } : null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  switch (action) {
    case 'power': return { type: 'devices.capabilities.on_off', instance: 'powerSwitch', value: v ? 1 : 0 };
    case 'brightness': return { type: 'devices.capabilities.range', instance: 'brightness', value: Math.min(100, Math.max(1, Math.round(v))) };
    case 'color': return { type: 'devices.capabilities.color_setting', instance: 'colorRgb', value: v & 0xffffff };
    case 'colorTemp': return { type: 'devices.capabilities.color_setting', instance: 'colorTemperatureK', value: Math.round(v) };
    default: return null;
  }
}

const stateOf = (caps, instance) => {
  const c = (caps || []).find((c) => c.instance === instance);
  return c && c.state ? c.state.value : undefined;
};

const options = (res) => [].concat(...((res.payload && res.payload.capabilities) || []).map((c) => (c.parameters && c.parameters.options) || []));
const sceneCache = {};

// Built-in scenes + the user's DIY scenes for one light. Cached an hour: they rarely change and count against the daily limit.
async function scenes(sku, device) {
  const key = sku + device, hit = sceneCache[key];
  if (hit && Date.now() - hit.at < 36e5) return hit.list;
  const payload = { sku, device };
  const [built, diy] = await Promise.all([
    govee('/device/scenes', { requestId: crypto.randomUUID(), payload }).catch(() => ({})),
    govee('/device/diy-scenes', { requestId: crypto.randomUUID(), payload }).catch(() => ({})),
  ]);
  const list = options(built).map((o) => ({ name: o.name, kind: 'scene', value: o.value }))
    .concat(options(diy).map((o) => ({ name: o.name, kind: 'diyScene', value: o.value })));
  sceneCache[key] = { at: Date.now(), list };
  return list;
}

// The music modes a light offers (Energic, Rhythm…), read from its capability list.
export function musicModes(d) {
  const cap = (d.capabilities || []).find((c) => c.instance === 'musicMode');
  const field = cap && cap.parameters && (cap.parameters.fields || []).find((f) => f.fieldName === 'musicMode');
  return ((field && field.options) || []).filter((o) => Number.isFinite(o.value)).map((o) => ({ name: o.name, value: o.value }));
}

export async function GET(request) {
  const no = denied(request); if (no) return no;
  if (!process.env.GOVEE_API_KEY) return fail('GOVEE_API_KEY is not set', 503);
  const q = new URL(request.url).searchParams;
  try {
    if (q.has('scenes')) {
      const sku = q.get('sku') || '', device = q.get('device') || '';
      if (!/^[\w-]{2,20}$/.test(sku) || !/^[\w:]{2,40}$/.test(device)) return fail('Bad request', 400);
      return Response.json(await scenes(sku, device));
    }
    // The device list rarely changes and counts against Govee's daily limit, so keep it for 10 min.
    if (!devices || Date.now() - devicesAt > 6e5) {
      devices = ((await govee('/user/devices')).data || []).filter((d) => d.type === 'devices.types.light');
      devicesAt = Date.now();
    }
    const lights = await Promise.all(devices.map(async (d) => {
      const base = { sku: d.sku, device: d.device, name: d.deviceName || d.sku, music: musicModes(d) };
      try {
        const s = await govee('/device/state', { requestId: crypto.randomUUID(), payload: { sku: d.sku, device: d.device } });
        const caps = s.payload && s.payload.capabilities;
        return Object.assign(base, {
          online: stateOf(caps, 'online') !== false,
          on: stateOf(caps, 'powerSwitch') === 1,
          brightness: stateOf(caps, 'brightness'),
          color: stateOf(caps, 'colorRgb'),
        });
      } catch (e) {
        return Object.assign(base, { online: false, error: e.message });
      }
    }));
    return Response.json(lights);
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request) {
  const no = denied(request); if (no) return no;
  if (!process.env.GOVEE_API_KEY) return fail('GOVEE_API_KEY is not set', 503);
  const b = await request.json().catch(() => ({}));
  const cap = capability(b.action, b.value);
  if (!cap || typeof b.sku !== 'string' || typeof b.device !== 'string') return fail('Bad request', 400);
  try {
    await govee('/device/control', { requestId: crypto.randomUUID(), payload: { sku: b.sku, device: b.device, capability: cap } });
    if ((b.action === 'scene' || b.action === 'diyScene') && typeof b.label === 'string' && b.label) await log('scene', b.label);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
