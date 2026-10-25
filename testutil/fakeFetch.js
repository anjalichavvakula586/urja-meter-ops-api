'use strict';
// Test doubles: a fake upstream portal. No network, no credentials.
const { loadSettings } = require('../src/config');

function testSettings(overrides = {}) {
  const { password = 'pw', ...rest } = overrides;
  const base = loadSettings({ UPSTREAM_BASE_URL: 'https://portal.test', UPSTREAM_USERNAME: 'user',
    UPSTREAM_PASSWORD: 'x', UPSTREAM_TIMEOUT_MS: '1000' });
  const settings = { ...base, ...rest }; // spread drops the non-enumerable password
  Object.defineProperty(settings, 'password', { value: password, enumerable: false });
  return settings;
}

function mkRes(status, { body, rawText, headers = {}, setCookie = [] } = {}) {
  return {
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null, getSetCookie: () => setCookie },
    json: async () => { if (rawText !== undefined) throw new SyntaxError('Unexpected token <'); return body; },
  };
}
const jsonRes = (body, status = 200) => mkRes(status, { body });
const textRes = (text, status = 200) => mkRes(status, { rawText: text });
const statusRes = (status, headers) => mkRes(status, { body: {}, headers });
const SESSION = ['session=abc123; Path=/; HttpOnly'];

// handler(call) -> response. Login POSTs are answered automatically (loginStatus / loginCookies).
function makeFetch(handler, { loginStatus = 303, loginCookies = SESSION, loginPath = '/login' } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const call = { method: opts.method, url: new URL(url), headers: opts.headers || {}, body: opts.body };
    calls.push(call);
    if (call.url.pathname === loginPath) return mkRes(loginStatus, { body: {}, setCookie: loginStatus < 400 ? loginCookies : [] });
    return handler(call);
  };
  fetchImpl.calls = calls;
  fetchImpl.logins = () => calls.filter((c) => c.url.pathname === loginPath).length;
  return fetchImpl;
}

module.exports = { testSettings, mkRes, jsonRes, textRes, statusRes, makeFetch, SESSION };
