'use strict';
// Upstream portal client: login, session cookie jar, timeouts, re-login once on expired session.
// Uses Node's built-in fetch (no extra dependency). `fetchImpl` is injectable for tests.
const {
  NotConfigured, UpstreamAuthError, UpstreamDataError,
  UpstreamNotFound, UpstreamTimeout, UpstreamUnavailable,
} = require('./errors');

const isTimeout = (err) => err && (err.name === 'TimeoutError' || err.name === 'AbortError');

class PortalClient {
  constructor(settings, { fetchImpl = globalThis.fetch, log = () => {} } = {}) {
    this.s = settings;
    this.fetch = fetchImpl;
    this.log = log;
    this.cookies = new Map(); // name -> value. Never exposed to API consumers, never logged.
    this.loggedIn = false;
    this.loginPromise = null; // dedupes concurrent logins
  }

  buildUrl(path, query) {
    const url = new URL(path, this.s.baseUrl);
    if (url.origin !== new URL(this.s.baseUrl).origin) throw new NotConfigured('Upstream path must stay on the base URL');
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, String(v));
    return url;
  }

  storeCookies(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of list) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      if (i < 1) continue;
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (value === '') this.cookies.delete(name); else this.cookies.set(name, value);
    }
  }

  async send(method, path, { query, form } = {}) {
    const url = this.buildUrl(path, query);
    const headers = { accept: form ? 'text/html,application/xhtml+xml' : 'application/json' };
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      headers.origin = new URL(this.s.baseUrl).origin; // SvelteKit rejects cross-origin form POSTs
      body = new URLSearchParams(form).toString();
    }
    let res;
    try {
      res = await this.fetch(url, {
        method, headers, body,
        redirect: 'manual', // so a redirect-to-login is detectable
        signal: AbortSignal.timeout(this.s.timeoutMs),
      });
    } catch (err) {
      if (isTimeout(err)) throw new UpstreamTimeout('Upstream portal timed out');
      throw new UpstreamUnavailable('Could not reach upstream portal');
    }
    this.log(`upstream ${method} ${url.pathname} -> ${res.status}`);
    this.storeCookies(res);
    return res;
  }

  async login() {
    if (!this.s.username || !this.s.password) {
      throw new NotConfigured('UPSTREAM_USERNAME / UPSTREAM_PASSWORD are not set');
    }
    this.cookies.clear();
    const res = await this.send('POST', this.s.loginPath, {
      form: { [this.s.loginUserField]: this.s.username, [this.s.loginPassField]: this.s.password },
    });
    if (res.status >= 500) throw new UpstreamUnavailable('Upstream login failed with a server error');
    if (res.status >= 400) throw new UpstreamAuthError('Upstream rejected the configured credentials');
    // A successful login must give us a session cookie; a 200 page without one is a failed login.
    if (this.cookies.size === 0) throw new UpstreamAuthError('Upstream login did not return a session');
    this.loggedIn = true;
  }

  async ensureLogin() {
    if (this.loggedIn) return;
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => { this.loginPromise = null; });
    }
    await this.loginPromise;
  }

  isAuthFailure(res) {
    if (res.status === 401 || res.status === 403) return true;
    return res.status >= 300 && res.status < 400 && (res.headers.get('location') || '').includes(this.s.loginPath);
  }

  async getJson(path, query) {
    let res;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await this.ensureLogin();
      res = await this.send('GET', path, { query });
      if (!this.isAuthFailure(res)) break;
      this.loggedIn = false; // session expired -> log in again once
      if (attempt === 2) throw new UpstreamAuthError('Upstream refused the session after re-login');
    }
    if (res.status === 404) throw new UpstreamNotFound('Upstream has no such resource');
    if (res.status >= 400) throw new UpstreamUnavailable(`Upstream returned HTTP ${res.status}`);
    if (res.status >= 300) throw new UpstreamUnavailable(`Upstream redirected unexpectedly (HTTP ${res.status})`);
    try {
      return await res.json();
    } catch (err) {
      if (isTimeout(err)) throw new UpstreamTimeout('Upstream portal timed out');
      throw new UpstreamDataError('Upstream did not return valid JSON');
    }
  }

  search(q, page) { return this.getJson(this.s.searchPath, { q, page }); }
  geo(meterId) { return this.getJson(this.s.geoPath.replace('{meter_id}', encodeURIComponent(meterId))); }
  energy(meterId) { return this.getJson(this.s.energyPath.replace('{meter_id}', encodeURIComponent(meterId))); }
}

module.exports = { PortalClient };
