'use strict';
// Guards against drift between openapi.json and the implemented routes.
const test = require('node:test');
const assert = require('node:assert/strict');
const spec = require('../openapi.json');
const { ROUTES } = require('../src/routes');

test('openapi.json documents exactly the implemented routes', () => {
  assert.deepEqual(Object.keys(spec.paths).sort(), Object.values(ROUTES).map((r) => r.openapi).sort());
});
test('openapi.json is OpenAPI 3.x and every $ref resolves', () => {
  assert.match(spec.openapi, /^3\./);
  const refs = JSON.stringify(spec).match(/"\$ref":\s*"([^"]+)"/g).map((s) => s.split('"')[3]);
  for (const ref of refs) {
    const target = ref.replace('#/', '').split('/').reduce((o, k) => o && o[k], spec);
    assert.ok(target, `unresolved ${ref}`);
  }
});
test('every operation documents success and error responses', () => {
  for (const [p, item] of Object.entries(spec.paths)) {
    assert.ok(item.get.responses['200'], p);
    if (p !== '/health') for (const code of ['422', '502', '503', '504']) assert.ok(item.get.responses[code], `${p} ${code}`);
  }
});
