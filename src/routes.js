'use strict';
// Single source of truth for public routes (Express syntax + OpenAPI syntax).
// A test checks that openapi.json documents exactly these.
const ROUTES = {
  health: { express: '/health', openapi: '/health' },
  search: { express: '/meters', openapi: '/meters' },
  location: { express: '/meters/:meterId/location', openapi: '/meters/{meter_id}/location' },
  energy: { express: '/meters/:meterId/energy', openapi: '/meters/{meter_id}/energy' },
};
module.exports = { ROUTES };
