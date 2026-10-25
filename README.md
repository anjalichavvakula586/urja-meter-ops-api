# Urja Meter Ops API

A read-only REST API built with Node.js and Express that provides structured meter search, geographic coordinates, and energy readings from the Urja Meter Ops portal.

The API normalizes the portal's responses into predictable JSON, validates inputs, handles session-based authentication, and documents its contract using OpenAPI 3.1.

## Project Status

- Search, location, and energy endpoints have been manually verified against the live portal for meter `J100000`.
- Automated test suite: **55 passed, 0 failed**.
- OpenAPI specification: `openapi.json`.
- Portal investigation and observed request behavior: `PROTOCOL.md`.
- Automated tests use a fake upstream server. The live endpoint checks described here were performed separately.

## Features

- Search meters by meter number or serial number.
- Retrieve latitude and longitude for a meter.
- Retrieve normalized energy readings.
- Reuse an upstream session cookie and re-authenticate once when a session expires.
- Validate request parameters and meter identifiers.
- Convert numeric strings into numbers without silently converting invalid values to zero.
- Validate timestamps and geographic coordinate ranges.
- Return consistent JSON errors without exposing credentials, cookies, or upstream response bodies.
- Provide Swagger UI and an OpenAPI specification.

## Technology Stack

- Node.js 20.6 or newer
- Express 4
- Built-in `fetch`
- Built-in `node:test`
- OpenAPI 3.1
- Swagger UI

## Project Structure

```text
flock-energy-node/
├── src/
│   ├── app.js
│   ├── server.js
│   ├── routes.js
│   ├── client.js
│   ├── config.js
│   ├── service.js
│   ├── parsing.js
│   └── errors.js
├── test/
│   ├── client.test.js
│   ├── http.test.js
│   ├── openapi.test.js
│   ├── parsing.test.js
│   └── service.test.js
├── testutil/
│   ├── fakeFetch.js
│   └── samples.js
├── .env.example
├── .gitignore
├── openapi.json
├── package.json
├── README.md
└── PROTOCOL.md
```

## Architecture

```text
Client
  |
  v
Express API
  |
  v
Routes and input validation
  |
  v
Service layer
  |
  +---- Portal client
  |       |
  |       +---- Login and session cookie
  |       +---- Timeout and error handling
  |       +---- Session retry
  |
  +---- Response parsing and normalization
          |
          v
      Clean JSON response
```

The route layer handles HTTP requests, the service layer coordinates operations, the client communicates with the upstream portal, and the parsing layer validates and normalizes upstream data.

## Setup and Installation

### Prerequisites

Install Node.js 20.6 or newer.

Verify the installation:

```bash
node --version
npm --version
```

### 1. Install dependencies

Open a terminal in the project directory:

```bash
npm install
```

### 2. Configure environment variables

Copy the example configuration.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Open `.env` and enter the portal credentials provided for the assignment. Keep the configured upstream paths consistent with the observed portal requests documented in `PROTOCOL.md`.

The relevant configuration is:

| Variable | Purpose |
|---|---|
| `PORT` | Local API port; default is `3000` |
| `UPSTREAM_BASE_URL` | Base URL of the Urja Meter Ops portal |
| `UPSTREAM_USERNAME` | Credential variable used by this project for the portal login value |
| `UPSTREAM_PASSWORD` | Portal password |
| `UPSTREAM_TIMEOUT_MS` | Upstream request timeout in milliseconds |
| `UPSTREAM_LOGIN_PATH` | Portal login endpoint |
| `UPSTREAM_LOGIN_USER_FIELD` | Login form field name; observed as `email` |
| `UPSTREAM_LOGIN_PASS_FIELD` | Login password field name |
| `UPSTREAM_SEARCH_PATH` | Upstream meter search path |
| `UPSTREAM_GEO_PATH` | Upstream meter coordinate path |
| `UPSTREAM_ENERGY_PATH` | Upstream energy readings path |

The environment variable name `UPSTREAM_USERNAME` is retained for configuration compatibility; the actual form field sent to the portal is `email`.

**Never commit `.env` or publish credentials.**

### 3. Start the API

```bash
npm start
```

Expected startup message:

```text
Urja Meter Ops API listening on http://localhost:3000
```

Open the interactive API documentation:

- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/openapi.json`

## API Endpoints

### 1. Health Check

```http
GET /health
```

Checks whether the local API process is running. It does not contact the upstream portal.

Example response:

```json
{
  "status": "ok"
}
```

### 2. Search Meters

```http
GET /meters?q=J100000&page=1
```

Query parameters:

| Parameter | Description |
|---|---|
| `q` | Optional meter ID or serial number search text |
| `page` | Page number; defaults to `1` |

The API validates search parameters before calling the upstream service.

Example response:

```json
{
  "query": "J100000",
  "page": 1,
  "count": 1,
  "items": [
    {
      "meter_id": "J100000",
      "serial_no": "SE33962",
      "make": "HPL",
      "phase_type": "single",
      "install_status": "Decommissioned",
      "dt_code": "DT-001"
    }
  ]
}
```

### 3. Get Meter Location

```http
GET /meters/J100000/location
```

Example response:

```json
{
  "meter_id": "J100000",
  "latitude": 26.938961002479868,
  "longitude": 75.83095696146852
}
```

The API converts coordinate strings to numbers and validates latitude and longitude ranges.

### 4. Get Meter Energy Readings

```http
GET /meters/J100000/energy
```

Example response:

```json
{
  "meter_id": "J100000",
  "count": 1,
  "readings": [
    {
      "timestamp": "2026-06-24T00:30:00",
      "timestamp_raw": "24/06/2026 00:30",
      "kwh": 48439.58,
      "kvah": 52314.75,
      "volt_r": 220
    }
  ]
}
```

The example shows one reading for illustration. The live response observed for `J100000` contained 337 readings.

The API returns numeric measurements where valid. Missing or invalid measurements become `null`, not zero. The original timestamp is preserved in `timestamp_raw`.

The normalized timestamp does not include a timezone offset because the portal's timezone has not been independently confirmed.

## Error Handling

Errors use a consistent structure:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid request parameters"
  }
}
```

Relevant HTTP status codes include:

| Status | Meaning |
|---|---|
| `404` | Resource or API route not found |
| `422` | Invalid request parameters |
| `502` | Upstream authentication, response, or service error |
| `503` | Required upstream configuration is missing |
| `504` | Upstream request timed out |

Error messages are intentionally generic. The API does not expose upstream HTML, raw response bodies, session cookies, passwords, or stack traces to API consumers.

## Testing

Run the automated test suite:

```bash
npm test
```

The suite uses a fake upstream rather than making live portal requests. It covers:

- Login form construction and session cookie reuse
- Shared login for concurrent requests
- Session expiry and one-time re-login
- Timeout and upstream failure handling
- Search parameter validation
- Meter ID validation
- Location and energy response parsing
- Numeric conversion and timestamp validation
- OpenAPI structure and route coverage
- Consistent HTTP error responses

**Observed test result:** 55 tests passed, 0 failed.

Separately, the following endpoints were manually tested against the portal using meter `J100000`:

- Search returned one matching meter.
- Location returned numeric latitude and longitude.
- Energy returned 337 readings.

Manual live checks and automated fake-upstream tests are different forms of verification; the automated suite does not guarantee the portal will always be available.

## Assumptions and Trade-offs

1. **Unknown timezone:** The API preserves the portal's day-first timestamp and emits an ISO-style local timestamp without inventing a timezone.
2. **Measurement parsing:** Valid numeric strings become numbers. Missing or malformed measurements become `null` rather than misleading zeros.
3. **Coordinate validation:** Invalid or out-of-range coordinates are treated as upstream data errors.
4. **Session handling:** Login is performed lazily, session cookies are reused, concurrent first requests share a login, and an expired session triggers at most one re-login and retry.
5. **Limited retry policy:** A persistent authentication failure does not trigger an infinite retry loop.
6. **No caching:** Requests are not cached, keeping behavior straightforward and avoiding unverified staleness assumptions.
7. **No invented pagination metadata:** The API exposes the requested page and the number of items returned on that page. Portal-wide totals and page-size semantics have not been fully established.
8. **Configurable upstream paths:** Portal paths and login field names are environment-configurable to reduce coupling to the portal's implementation.

## Intentionally Deferred Work

The following items were not implemented because the core read-only API and reliable response handling were the priority:

- Meter detail and distribution-network hierarchy endpoints
- Bulk meter retrieval
- Caching and a local search index
- Date-range filtering for energy readings
- A separate frontend dashboard
- API-key authentication and rate limiting

These features should be added only after their requirements and upstream behavior are established.

## Limitations and Known Issues

- The portal's behavior may change, including its login/session handling and internal URLs.
- Pagination edge cases and no-match behavior need further investigation.
- Timezone and measurement unit semantics have not been independently documented.
- Automated tests use recorded samples and a fake upstream, not the live portal.
- The OpenAPI specification is maintained manually; tests verify its structure and route alignment, but not every possible documentation mismatch.
- There is no caching, so every data request depends on the upstream portal being available.

## Security

- Keep credentials in `.env`; never commit them.
- Keep `.env` excluded through `.gitignore`.
- Do not print passwords or session cookies in logs.
- Validate input before making upstream requests.
- Restrict configured upstream paths to the expected portal origin.
- The API is read-only and does not intentionally modify meter records.

## Future Improvements

With more development time, I would:

1. Investigate the portal's page-load data to expose verified meter details and network hierarchy.
2. Add a short-lived cache with explicit freshness behavior.
3. Add contract tests using sanitized, recorded upstream responses.
4. Investigate date-range filtering if the portal supports it.
5. Improve structured logging and request tracing without recording secrets.
6. Add integration tests for session expiry and portal contract changes in a controlled environment.

## Reflection

### 1. What assumptions did you make?

I assumed the portal's login uses a form submission and a session cookie, that the meter ID can be used in the location and energy URL paths, and that the portal returns numeric measurements as strings. I preserved timestamps without a timezone because the portal does not provide a confirmed timezone. I verified the login, search, geo, and energy request paths using Chrome DevTools and kept unverified behavior explicit rather than inventing it.

### 2. What was the hardest part, and how did you get unstuck?

The hardest part was identifying the actual upstream requests and understanding the portal's login/session behavior. My initial configuration used guessed paths and a `username` form field. I used Chrome DevTools Network to inspect the real login, search, geo, and energy requests. I found that the login form uses `email` and `password`, updated the configuration, and manually verified all three data endpoints.

### 3. If you had one more day, what would you improve?

I would investigate the portal's page-load data to expose meter details and the distribution hierarchy, add a short-lived cache with explicit freshness rules, and build contract tests around sanitized real responses. I would also investigate date-range filtering and pagination behavior before adding those capabilities to the public API.

### 4. What mistake did you make, and what did you learn?

I initially guessed the portal's API paths and used `username` as the login form field. This led to integration failures even though the credentials were available. I learned to verify request URLs, methods, form field names, redirects, and session behavior in DevTools before treating an integration as correct. I also added automated tests for login, cookie reuse, session expiry, and error handling.

### 5. What would you criticise about your own solution?

The solution prioritizes the core read-only endpoints rather than providing the complete portal data model. Pagination metadata, date-range filtering, and meter hierarchy are not exposed. The OpenAPI document is maintained manually, and automated tests use a fake upstream, so they cannot guarantee compatibility with future portal changes. I would address these limitations with verified contract tests, clearer upstream documentation, and carefully scoped integration tests.
