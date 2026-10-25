'use strict';
// HTTP-level tests through real Express (needs `npm install`). Upstream is still faked.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { PortalClient } = require('../src/client');
const { testSettings, makeFetch, jsonRes, textRes, statusRes } = require('../testutil/fakeFetch');
const { GEO, ENERGY, SEARCH } = require('../testutil/samples');

async function withServer(handler, fn, fetchOpts) {
  const fetchImpl = makeFetch(handler, fetchOpts);
  const app = createApp({ client: new PortalClient(testSettings(), { fetchImpl }) });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try { return await fn(`http://127.0.0.1:${server.address().port}`, fetchImpl); }
  finally { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); }
}
const get = async (base, path) => { const r = await fetch(base + path); return { status: r.status, headers: r.headers, body: await r.json() }; };
const assertError = (r, status, code) => {
  assert.equal(r.status, status);
  assert.deepEqual(Object.keys(r.body), ['error']);
  assert.deepEqual(Object.keys(r.body.error).sort(), ['code', 'message']);
  assert.equal(r.body.error.code, code);
};

test('health works and never calls upstream', () => withServer(() => jsonRes({}), async (base, f) => {
  const r = await get(base, '/health');
  assert.deepEqual([r.status, r.body], [200, { status: 'ok' }]);
  assert.equal(f.calls.length, 0);
}));
test('GET /meters returns normalized items', () => withServer(() => jsonRes(SEARCH), async (base) => {
  const r = await get(base, '/meters?q=J1&page=1');
  assert.equal(r.status, 200); assert.equal(r.body.items[0].serial_no, 'SE33962');
}));
test('GET /meters rejects bad params with 422', () => withServer(() => jsonRes(SEARCH), async (base, f) => {
  assertError(await get(base, '/meters?page=0'), 422, 'validation_error');
  assertError(await get(base, '/meters?q=a&q=b'), 422, 'validation_error');
  assert.equal(f.calls.length, 0);
}));
test('location and energy happy paths', () => withServer((c) => jsonRes(c.url.pathname.endsWith('/geo') ? GEO : ENERGY), async (base) => {
  assert.deepEqual((await get(base, '/meters/J100000/location')).body, { meter_id: 'J100000', latitude: 26.938961002479868, longitude: 75.83095696146852 });
  assert.equal((await get(base, '/meters/J100000/energy')).body.readings[1].kwh, 48440);
}));
test('invalid meter id -> 422', () => withServer(() => jsonRes(GEO), async (base) => {
  assertError(await get(base, '/meters/bad%20id!/location'), 422, 'validation_error');
}));
test('upstream failures map to consistent errors', async () => {
  await withServer(() => textRes('<html>', 200), async (b) => assertError(await get(b, '/meters/J1/energy'), 502, 'upstream_bad_response'));
  await withServer(() => textRes('boom', 500), async (b) => assertError(await get(b, '/meters/J1/energy'), 502, 'upstream_error'));
  await withServer(() => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }, async (b) => assertError(await get(b, '/meters/J1/energy'), 504, 'upstream_timeout'));
  await withServer(() => statusRes(404), async (b) => assertError(await get(b, '/meters/J1/location'), 404, 'not_found'));
  await withServer(() => jsonRes(GEO), async (b) => assertError(await get(b, '/meters/J1/location'), 502, 'upstream_auth_failed'), { loginStatus: 401 });
});
test('no cookie or upstream details leak to API consumers', () => withServer(() => jsonRes(GEO), async (base) => {
  const r = await get(base, '/meters/J1/location');
  assert.equal(r.headers.get('set-cookie'), null);
  assert.ok(!JSON.stringify(r.body).includes('abc123'));
}));
test('unknown route -> JSON 404; openapi.json is served', () => withServer(() => jsonRes({}), async (base) => {
  assertError(await get(base, '/nope'), 404, 'route_not_found');
  const spec = await get(base, '/openapi.json');
  assert.equal(spec.status, 200); assert.match(spec.body.openapi, /^3\./);
}));
