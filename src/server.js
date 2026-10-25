'use strict';
const { loadSettings } = require('./config');
const { PortalClient } = require('./client');
const { createApp } = require('./app');

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);
const settings = loadSettings();
if (!settings.username || !settings.password) {
  log('WARNING: UPSTREAM_USERNAME / UPSTREAM_PASSWORD not set - portal routes will return 503');
}
const app = createApp({ client: new PortalClient(settings, { log }), log });
app.listen(settings.port, () => log(`Urja Meter Ops API listening on http://localhost:${settings.port} (docs: /docs)`));
