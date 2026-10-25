'use strict';
// Use-cases: validate client input, call the portal, normalize the answer.
// Framework-free, so it is tested without Express.
const { ValidationError } = require('./errors');
const parsing = require('./parsing');

const METER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_Q = 100;
const MAX_PAGE = 10000;

function validateMeterId(id) {
  if (typeof id !== 'string' || !METER_ID.test(id)) {
    throw new ValidationError("Invalid 'meter_id': must match ^[A-Za-z0-9_-]{1,64}$");
  }
  return id;
}

function validateSearch(query = {}) {
  const q = query.q === undefined ? '' : query.q;
  if (typeof q !== 'string' || q.length > MAX_Q) {
    throw new ValidationError(`Invalid 'q': must be a string of at most ${MAX_Q} characters`);
  }
  const rawPage = query.page === undefined ? '1' : query.page;
  if (typeof rawPage !== 'string' || !/^\d+$/.test(rawPage) || Number(rawPage) < 1 || Number(rawPage) > MAX_PAGE) {
    throw new ValidationError(`Invalid 'page': must be an integer from 1 to ${MAX_PAGE}`);
  }
  return { q, page: Number(rawPage) };
}

async function searchMeters(client, query) {
  const { q, page } = validateSearch(query);
  const items = parsing.parseSearch(await client.search(q, page));
  return { query: q, page, count: items.length, items };
}

async function getLocation(client, meterId) {
  validateMeterId(meterId);
  const coords = parsing.parseCoordinates(await client.geo(meterId));
  return { meter_id: meterId, ...coords };
}

async function getEnergy(client, meterId) {
  validateMeterId(meterId);
  const readings = parsing.parseEnergy(await client.energy(meterId));
  return { meter_id: meterId, count: readings.length, readings };
}

module.exports = { validateMeterId, validateSearch, searchMeters, getLocation, getEnergy };
