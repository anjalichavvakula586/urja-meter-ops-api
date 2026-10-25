'use strict';
// Configuration comes from environment variables only. No secrets in code.
function loadSettings(env = process.env) {
  const settings = {
    port: Number(env.PORT || 3000),
    baseUrl: (env.UPSTREAM_BASE_URL || 'https://urja-ops.flockenergy.tech').replace(/\/+$/, ''),
    username: env.UPSTREAM_USERNAME || null,
    loginPath: env.UPSTREAM_LOGIN_PATH || '/login',
    loginUserField: env.UPSTREAM_LOGIN_USER_FIELD || 'username',
    loginPassField: env.UPSTREAM_LOGIN_PASS_FIELD || 'password',
    // UNVERIFIED defaults: confirm full Request URLs in DevTools (see PROTOCOL.md)
    searchPath: env.UPSTREAM_SEARCH_PATH || '/api/search',
    geoPath: env.UPSTREAM_GEO_PATH || '/api/meters/{meter_id}/geo',
    energyPath: env.UPSTREAM_ENERGY_PATH || '/api/meters/{meter_id}/energy',
    timeoutMs: Number(env.UPSTREAM_TIMEOUT_MS || 10000),
  };
  // Not enumerable, so console.log(settings) / JSON.stringify never print the password.
  Object.defineProperty(settings, 'password', { value: env.UPSTREAM_PASSWORD || null, enumerable: false });
  return Object.freeze(settings);
}

module.exports = { loadSettings };
