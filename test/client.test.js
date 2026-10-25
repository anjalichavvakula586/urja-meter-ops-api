'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PortalClient } = require('../src/client');
const E = require('../src/errors');
const { testSettings, makeFetch, jsonRes, textRes, statusRes } = require('../testutil/fakeFetch');
const { GEO } = require('../testutil/samples');

const mk = (handler, fetchOpts, settings) => {
  const fetchImpl = makeFetch(handler, fetchOpts);
  return { client: new PortalClient(testSettings(settings), { fetchImpl }), fetchImpl };
};

test('login sends form fields + Origin; session cookie is reused on data requests', async () => {
  const { client, fetchImpl } = mk(() => jsonRes(GEO));
  await client.geo('J1');
  const login = fetchImpl.calls[0];
  assert.equal(login.method, 'POST');
  assert.equal(login.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(login.headers.origin, 'https://portal.test');
  assert.equal(new URLSearchParams(login.body).get('username'), 'user');
  assert.equal(fetchImpl.calls[1].headers.cookie, 'session=abc123');
});
test('session is reused across requests (one login)', async () => {
  const { client, fetchImpl } = mk(() => jsonRes(GEO));
  await client.geo('J1'); await client.geo('J2');
  assert.equal(fetchImpl.logins(), 1);
});
test('concurrent first requests share a single login', async () => {
  const { client, fetchImpl } = mk(() => jsonRes(GEO));
  await Promise.all([client.geo('J1'), client.geo('J2'), client.energy('J3')]);
  assert.equal(fetchImpl.logins(), 1);
});
test('expired session (401) triggers exactly one re-login and retry', async () => {
  let n = 0;
  const { client, fetchImpl } = mk(() => (++n === 1 ? statusRes(401) : jsonRes(GEO)));
  assert.deepEqual(await client.geo('J1'), GEO);
  assert.equal(fetchImpl.logins(), 2);
});
test('redirect to the login page counts as an expired session', async () => {
  let n = 0;
  const { client } = mk(() => (++n === 1 ? statusRes(303, { location: '/login' }) : jsonRes(GEO)));
  assert.deepEqual(await client.geo('J1'), GEO);
});
test('persistent auth failure does not loop', async () => {
  const { client, fetchImpl } = mk(() => statusRes(403));
  await assert.rejects(client.geo('J1'), E.UpstreamAuthError);
  assert.equal(fetchImpl.logins(), 2);
});
test('login rejected (401) -> UpstreamAuthError, password never in message', async () => {
  const { client } = mk(() => jsonRes(GEO), { loginStatus: 401 });
  await assert.rejects(client.geo('J1'), (err) => err instanceof E.UpstreamAuthError && !err.message.includes('pw'));
});
test('login "succeeds" with 200 but no cookie -> treated as failed login', async () => {
  const { client } = mk(() => jsonRes(GEO), { loginStatus: 200, loginCookies: [] });
  await assert.rejects(client.geo('J1'), E.UpstreamAuthError);
});
test('login server error -> UpstreamUnavailable', async () => {
  const { client } = mk(() => jsonRes(GEO), { loginStatus: 500 });
  await assert.rejects(client.geo('J1'), E.UpstreamUnavailable);
});
test('missing credentials -> NotConfigured (no upstream call)', async () => {
  const { client, fetchImpl } = mk(() => jsonRes(GEO), {}, { username: null, password: null });
  await assert.rejects(client.geo('J1'), E.NotConfigured);
  assert.equal(fetchImpl.calls.length, 0);
});
test('timeout -> UpstreamTimeout', async () => {
  const { client } = mk(() => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); });
  await assert.rejects(client.geo('J1'), E.UpstreamTimeout);
});
test('network failure -> UpstreamUnavailable', async () => {
  const { client } = mk(() => { throw new TypeError('fetch failed'); });
  await assert.rejects(client.geo('J1'), E.UpstreamUnavailable);
});
test('upstream 500 -> UpstreamUnavailable without leaking the body', async () => {
  const { client } = mk(() => textRes('Traceback secret stack trace', 500));
  await assert.rejects(client.geo('J1'), (err) => err instanceof E.UpstreamUnavailable && !err.message.includes('Traceback'));
});
test('upstream 404 -> UpstreamNotFound', async () => {
  const { client } = mk(() => statusRes(404));
  await assert.rejects(client.geo('J404'), E.UpstreamNotFound);
});
test('non-JSON body -> UpstreamDataError', async () => {
  const { client } = mk(() => textRes('<html>oops</html>'));
  await assert.rejects(client.energy('J1'), E.UpstreamDataError);
});
test('meter id is URL-encoded in the path template', async () => {
  const { client, fetchImpl } = mk(() => jsonRes(GEO));
  await client.geo('a b/c');
  assert.equal(fetchImpl.calls[1].url.pathname, '/api/meters/a%20b%2Fc/geo');
});
test('a configured path cannot leave the portal origin', async () => {
  const { client } = mk(() => jsonRes(GEO), {}, { searchPath: 'https://evil.example/x' });
  await assert.rejects(client.search('', 1), E.NotConfigured);
});
test('settings never print the password', () => {
  const s = testSettings();
  assert.ok(!JSON.stringify(s).includes('pw'));
  assert.ok(!require('node:util').inspect(s).includes("'pw'"));
});
