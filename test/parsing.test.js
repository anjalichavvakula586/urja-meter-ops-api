'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../src/parsing');
const { UpstreamDataError } = require('../src/errors');
const { GEO, ENERGY, SEARCH } = require('../testutil/samples');

test('timestamp: explicit DD/MM/YYYY HH:mm, no timezone suffix', () => {
  assert.equal(p.parsePortalTimestamp('24/06/2026 00:30'), '2026-06-24T00:30:00');
  assert.doesNotMatch(p.parsePortalTimestamp('24/06/2026 00:30'), /Z|[+]\d\d:\d\d$/);
});
test('timestamp: day-first, not month-first', () => {
  assert.equal(p.parsePortalTimestamp('03/04/2026 10:00'), '2026-04-03T10:00:00');
});
test('timestamp: rejects ISO, garbage, impossible dates and non-strings', () => {
  for (const bad of ['2026-06-24 00:30', 'nope', '', null, undefined, 123, '31/02/2026 10:00', '24/06/2026 25:00', '24/06/2026 00:60']) {
    assert.equal(p.parsePortalTimestamp(bad), null, String(bad));
  }
});
test('numbers: strings become finite numbers, junk becomes null (never 0)', () => {
  assert.equal(p.toFiniteNumber('48439.58'), 48439.58);
  assert.equal(p.toFiniteNumber(' 220 '), 220);
  assert.equal(p.toFiniteNumber(7), 7);
  for (const bad of ['', '  ', 'abc', 'NaN', 'Infinity', '-Infinity', '0x10', '1,5', null, undefined, true, {}, [], NaN, Infinity]) {
    assert.equal(p.toFiniteNumber(bad), null, String(bad));
  }
});
test('energy: observed samples become numbers', () => {
  const out = p.parseEnergy(ENERGY);
  assert.deepEqual(out[0], { timestamp: '2026-06-24T00:30:00', timestamp_raw: '24/06/2026 00:30', kwh: 48439.58, kvah: 52314.75, volt_r: 220 });
  assert.deepEqual(out[1], { timestamp: '2026-06-24T01:00:00', timestamp_raw: '24/06/2026 01:00', kwh: 48440, kvah: 52315.2, volt_r: 230 });
});
test('energy: empty array is fine', () => assert.deepEqual(p.parseEnergy({ data: [] }), []));
test('energy: bad or missing measurements become null', () => {
  const out = p.parseEnergy({ data: [{ timestamp: '24/06/2026 00:30', kwh: 'abc', kvah: 'NaN', voltR: null }, { timestamp: '24/06/2026 01:00' }] });
  assert.deepEqual([out[0].kwh, out[0].kvah, out[0].volt_r, out[1].kwh], [null, null, null, null]);
});
test('energy: invalid timestamp is a contract error', () => {
  assert.throws(() => p.parseEnergy({ data: [{ timestamp: 'bad', kwh: '1' }] }), UpstreamDataError);
});
test('energy: wrong shapes are contract errors', () => {
  for (const bad of [{}, [], { data: {} }, { data: ['x'] }, { data: [null] }, 'text', null]) {
    assert.throws(() => p.parseEnergy(bad), UpstreamDataError);
  }
});
test('geo: observed sample', () => {
  assert.deepEqual(p.parseCoordinates(GEO), { latitude: 26.938961002479868, longitude: 75.83095696146852 });
});
test('geo: boundaries accepted, beyond rejected', () => {
  assert.deepEqual(p.parseCoordinates({ data: { latitude: '90', longitude: '-180' } }), { latitude: 90, longitude: -180 });
  for (const [lat, lon] of [['90.1', '0'], ['-90.1', '0'], ['0', '180.1'], ['0', '-180.1']]) {
    assert.throws(() => p.parseCoordinates({ data: { latitude: lat, longitude: lon } }), UpstreamDataError);
  }
});
test('geo: malformed values never become zero', () => {
  for (const [lat, lon] of [['abc', '1'], ['NaN', '1'], ['Infinity', '1'], ['', '1'], [null, '1'], ['1', null], [undefined, undefined]]) {
    assert.throws(() => p.parseCoordinates({ data: { latitude: lat, longitude: lon } }), UpstreamDataError);
  }
});
test('geo: missing data key / wrong shape', () => {
  for (const bad of [{ latitude: '1', longitude: '2' }, { data: [] }, { data: 'x' }, null]) {
    assert.throws(() => p.parseCoordinates(bad), UpstreamDataError);
  }
});
test('search: observed sample renamed to snake_case', () => {
  const out = p.parseSearch(SEARCH);
  assert.deepEqual(out[0], { meter_id: 'J100000', serial_no: 'SE33962', make: 'HPL', phase_type: 'single', install_status: 'Decommissioned', dt_code: 'DT-001' });
  assert.equal(out[1].make, 'L&T');
});
test('search: empty list and missing optional fields', () => {
  assert.deepEqual(p.parseSearch({ data: [] }), []);
  assert.deepEqual(p.parseSearch({ data: [{ meterId: 'J1' }] })[0], { meter_id: 'J1', serial_no: null, make: null, phase_type: null, install_status: null, dt_code: null });
});
test('search: bad shapes are contract errors', () => {
  for (const bad of [{}, { data: {} }, { data: ['x'] }, { data: [{ serialNo: 'A' }] }, { data: [{ meterId: 5 }] }, { data: [{ meterId: '' }] }, null]) {
    assert.throws(() => p.parseSearch(bad), UpstreamDataError);
  }
});
