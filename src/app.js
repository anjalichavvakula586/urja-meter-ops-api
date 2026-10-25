'use strict';
const path = require('node:path');
const express = require('express');
const { ApiError } = require('./errors');
const service = require('./service');
const { ROUTES } = require('./routes');

const errorBody = (code, message) => ({ error: { code, message } });

const DOCS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Urja Meter Ops API</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css"></head>
<body><div id="ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/openapi.json', dom_id: '#ui' });</script></body></html>`;

function createApp({ client, log = () => {} }) {
  const app = express();
  app.disable('x-powered-by');
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  
app.get('/', (req, res) => {
  res.json({
    name: 'Urja Meter Ops API',
    status: 'running',
    docs: '/docs',
    health: '/health'
  });
});
  app.get(ROUTES.health.express, (req, res) => res.json({ status: 'ok' }));
  app.get(ROUTES.search.express, wrap(async (req, res) => res.json(await service.searchMeters(client, req.query))));
  app.get(ROUTES.location.express, wrap(async (req, res) => res.json(await service.getLocation(client, req.params.meterId))));
  app.get(ROUTES.energy.express, wrap(async (req, res) => res.json(await service.getEnergy(client, req.params.meterId))));

  app.get('/openapi.json', (req, res) => res.sendFile(path.join(__dirname, '..', 'openapi.json')));
  app.get('/docs', (req, res) => res.type('html').send(DOCS_HTML));

  app.use((req, res) => res.status(404).json(errorBody('route_not_found', 'No such route')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) return res.status(err.statusCode).json(errorBody(err.code, err.message));
    if (err && err.status >= 400 && err.status < 500) return res.status(err.status).json(errorBody('bad_request', 'Malformed request'));
    log(`unhandled error: ${err && err.stack ? err.stack : err}`);
    return res.status(500).json(errorBody('internal_error', 'Unexpected server error'));
  });

  return app;
}

module.exports = { createApp };
