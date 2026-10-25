'use strict';
// Pure functions: upstream JSON -> normalized objects. No HTTP, no framework.
// Contract violations throw UpstreamDataError (-> HTTP 502).
const { UpstreamDataError } = require('./errors');

const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

// Number or numeric string -> finite number, else null (never 0, never NaN).
function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!NUMERIC.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function dataOf(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || !('data' in payload)) {
    throw new UpstreamDataError("Upstream response is missing the 'data' key");
  }
  return payload.data;
}

function parseCoordinates(payload) {
  const data = dataOf(payload);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new UpstreamDataError("Upstream 'data' for geo is not an object");
  }
  const latitude = toFiniteNumber(data.latitude);
  const longitude = toFiniteNumber(data.longitude);
  if (latitude === null || longitude === null) {
    throw new UpstreamDataError('Upstream coordinates are missing or not numeric');
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new UpstreamDataError('Upstream coordinates are out of range');
  }
  return { latitude, longitude };
}

// Portal format (observed): "DD/MM/YYYY HH:mm". Timezone is UNKNOWN, so none is added.
// Returns "YYYY-MM-DDTHH:mm:00" or null. Built from the parts - no Date/timezone involved in the output.
function parsePortalTimestamp(raw) {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [d, mo, y, h, mi] = m.slice(1).map(Number);
  const check = new Date(Date.UTC(y, mo - 1, d, h, mi)); // only used to reject 31/02, 25:00 etc.
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d ||
      check.getUTCHours() !== h || check.getUTCMinutes() !== mi) return null;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(y, 4)}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:00`;
}

// Timestamp must be valid (else 502). Missing/invalid measurements become null.
function parseEnergy(payload) {
  const data = dataOf(payload);
  if (!Array.isArray(data)) throw new UpstreamDataError("Upstream 'data' for energy is not an array");
  return data.map((rec, i) => {
    if (rec === null || typeof rec !== 'object' || Array.isArray(rec)) {
      throw new UpstreamDataError(`Energy record ${i} is not an object`);
    }
    const timestamp = parsePortalTimestamp(rec.timestamp);
    if (timestamp === null) throw new UpstreamDataError(`Energy record ${i} has an invalid timestamp`);
    return {
      timestamp,
      timestamp_raw: rec.timestamp,
      kwh: toFiniteNumber(rec.kwh),
      kvah: toFiniteNumber(rec.kvah),
      volt_r: toFiniteNumber(rec.voltR),
    };
  });
}

const optStr = (v) => (typeof v === 'string' ? v : null);

// Observed item: {meterId, serialNo, make, phaseType, installStatus, dtCode}.
// meterId is required (else 502); other fields become null if missing / not a string.
function parseSearch(payload) {
  const data = dataOf(payload);
  if (!Array.isArray(data)) throw new UpstreamDataError("Upstream search 'data' is not an array");
  return data.map((item, i) => {
    if (item === null || typeof item !== 'object' || typeof item.meterId !== 'string' || item.meterId === '') {
      throw new UpstreamDataError(`Search item ${i} has no valid meterId`);
    }
    return {
      meter_id: item.meterId,
      serial_no: optStr(item.serialNo),
      make: optStr(item.make),
      phase_type: optStr(item.phaseType),
      install_status: optStr(item.installStatus),
      dt_code: optStr(item.dtCode),
    };
  });
}

module.exports = { toFiniteNumber, parseCoordinates, parsePortalTimestamp, parseEnergy, parseSearch };
