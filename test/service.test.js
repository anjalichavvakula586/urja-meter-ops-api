'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/service');
const { PortalClient } = require('../src/client');
const { ValidationError, UpstreamDataError } = require('../src/errors');
const { testSettings, makeFetch, jsonRes } = require('../testutil/fakeFetch');
const { GEO, ENERGY, SEARCH } = require('../testutil/samples');

const clientFor = (handler) => {
  const fetchImpl = makeFetch(handler);
  return { client: new PortalClient(testSettings(), { fetchImpl }), fetchImpl };
};

test('search: sends q and page upstream and normalizes items', async () => {
  const { client, fetchImpl } = clientFor(() => jsonRes(SEARCH));
  const out = await service.searchMeters(client, { q: 'J100000', page: '2' });
  assert.equal(out.query, 'J100000'); assert.equal(out.page, 2); assert.equal(out.count, 2);
  assert.equal(out.items[0].meter_id, 'J100000');
  const get = fetchImpl.calls.find((c) => c.method === 'GET');
  assert.equal(get.url.searchParams.get('q'), 'J100000');
  assert.equal(get.url.searchParams.get('page'), '2');
});
test('search: empty query and default page', async () => {
  const { client } = clientFor(() => jsonRes({ data: [] }));
  assert.deepEqual(await service.searchMeters(client, {}), { query: '', page: 1, count: 0, items: [] });
});
test('search: invalid params are rejected before any upstream call', async () => {
  const { client, fetchImpl } = clientFor(() => jsonRes(SEARCH));
  for (const query of [{ page: '0' }, { page: 'abc' }, { page: '1.5' }, { page: '-1' }, { page: '10001' }, { q: 'x'.repeat(101) }, { q: ['a', 'b'] }, { page: ['1', '2'] }]) {
    await assert.rejects(service.searchMeters(client, query), ValidationError, JSON.stringify(query));
  }
  assert.equal(fetchImpl.calls.length, 0);
});
test('search: boundary values are accepted', async () => {
  const { client } = clientFor(() => jsonRes({ data: [] }));
  assert.equal((await service.searchMeters(client, { page: '10000', q: 'x'.repeat(100) })).page, 10000);
});
test('location: meter id goes into the upstream path; coordinates are numbers', async () => {
  const { client, fetchImpl } = clientFor(() => jsonRes(GEO));
  assert.deepEqual(await service.getLocation(client, 'J100007'), { meter_id: 'J100007', latitude: 26.938961002479868, longitude: 75.83095696146852 });
  assert.equal(fetchImpl.calls.find((c) => c.method === 'GET').url.pathname, '/api/meters/J100007/geo');
});
test('location: invalid coordinates from upstream -> UpstreamDataError, never zero', async () => {
  for (const [lat, lon] of [['999', '75'], ['abc', '75'], ['26', '']]) {
    const { client } = clientFor(() => jsonRes({ data: { latitude: lat, longitude: lon } }));
    await assert.rejects(service.getLocation(client, 'J1'), UpstreamDataError);
  }
});
test('invalid meter ids are rejected without calling upstream', async () => {
  const { client, fetchImpl } = clientFor(() => jsonRes(GEO));
  for (const id of ['bad id!', '../etc', '', 'a'.repeat(65), undefined, 'J1?x=1']) {
    await assert.rejects(service.getLocation(client, id), ValidationError, String(id));
    await assert.rejects(service.getEnergy(client, id), ValidationError, String(id));
  }
  assert.equal(fetchImpl.calls.length, 0);
});
test('energy: normalized with numbers and ISO-style local timestamps', async () => {
  const { client } = clientFor(() => jsonRes(ENERGY));
  const out = await service.getEnergy(client, 'J100000');
  assert.equal(out.count, 2); assert.equal(out.meter_id, 'J100000');
  assert.deepEqual(out.readings[0], { timestamp: '2026-06-24T00:30:00', timestamp_raw: '24/06/2026 00:30', kwh: 48439.58, kvah: 52314.75, volt_r: 220 });
});
test('energy: empty array', async () => {
  const { client } = clientFor(() => jsonRes({ data: [] }));
  assert.deepEqual(await service.getEnergy(client, 'J1'), { meter_id: 'J1', count: 0, readings: [] });
});
test('energy: unexpected shapes -> UpstreamDataError', async () => {
  for (const body of [{ unexpected: true }, { data: {} }, { data: [{ timestamp: '2026-06-24' }] }]) {
    const { client } = clientFor(() => jsonRes(body));
    await assert.rejects(service.getEnergy(client, 'J1'), UpstreamDataError);
  }
});
