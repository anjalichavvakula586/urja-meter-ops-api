'use strict';
// Every error maps to one HTTP status and a stable machine-readable code.
class ApiError extends Error {
  constructor(message) { super(message); this.name = this.constructor.name; }
}
class ValidationError extends ApiError { statusCode = 422; code = 'validation_error'; }
class NotConfigured extends ApiError { statusCode = 503; code = 'service_not_configured'; }
class UpstreamAuthError extends ApiError { statusCode = 502; code = 'upstream_auth_failed'; }
class UpstreamTimeout extends ApiError { statusCode = 504; code = 'upstream_timeout'; }
class UpstreamUnavailable extends ApiError { statusCode = 502; code = 'upstream_error'; }
// The portal answered, but the payload broke the contract we expect.
class UpstreamDataError extends ApiError { statusCode = 502; code = 'upstream_bad_response'; }
class UpstreamNotFound extends ApiError { statusCode = 404; code = 'not_found'; }

module.exports = {
  ApiError, ValidationError, NotConfigured, UpstreamAuthError,
  UpstreamTimeout, UpstreamUnavailable, UpstreamDataError, UpstreamNotFound,
};
