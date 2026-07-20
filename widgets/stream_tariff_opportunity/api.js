'use strict';

const { streamData } = require('../stream_common');

module.exports = {
  async getTariffOpportunity({ homey, query }) {
    const data = streamData(homey, query);
    if (!data.ok) return data;

    let recommendation = 'Watch';
    let reason = 'Waiting for stronger solar, grid or battery signal.';
    if (data.priceNow != null && data.priceNow < 0) {
      recommendation = 'Charge now';
      reason = 'Electricity price is negative — importing pays you. Fill the battery.';
    } else if (data.gridExport != null && data.gridExport > 100 && data.feedIn) {
      recommendation = 'Exporting';
      reason = 'Grid export is active and feed-in is enabled.';
    } else if (data.solar != null && data.home != null && data.solar > data.home + 100) {
      recommendation = 'Store solar';
      reason = 'Solar is above home load; spare power can charge the battery.';
    } else if (data.gridImport != null && data.gridImport > 100 && data.soc != null && data.soc < 40) {
      recommendation = 'Importing';
      reason = 'Grid import is active while battery is low.';
    } else if (data.soc != null && data.backupReserve != null && data.soc <= data.backupReserve + 3) {
      recommendation = 'Protect reserve';
      reason = 'Battery is close to the configured backup reserve.';
    } else if (data.batteryDischarge != null && data.batteryDischarge > 100) {
      recommendation = 'Self-powering';
      reason = 'Battery is actively covering home load.';
    }

    return { ...data, recommendation, reason };
  },
};
