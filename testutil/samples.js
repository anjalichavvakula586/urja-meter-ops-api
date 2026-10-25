'use strict';
// Real samples observed in Chrome DevTools.
module.exports = {
  GEO: { data: { latitude: '26.938961002479868', longitude: '75.83095696146852' } },
  ENERGY: { data: [
    { timestamp: '24/06/2026 00:30', kwh: '48439.58', kvah: '52314.75', voltR: '220' },
    { timestamp: '24/06/2026 01:00', kwh: '48440', kvah: '52315.2', voltR: '230' },
  ] },
  SEARCH: { data: [
    { meterId: 'J100000', serialNo: 'SE33962', make: 'HPL', phaseType: 'single', installStatus: 'Decommissioned', dtCode: 'DT-001' },
    { meterId: 'J100001', serialNo: 'GE84132', make: 'L&T', phaseType: 'single', installStatus: 'Installed', dtCode: 'DT-002' },
  ] },
};
