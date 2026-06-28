'use strict';

const { streamData } = require('../stream_common');

module.exports = {
  async getSolarForecast({ homey, query }) {
    const data = streamData(homey, query);
    if (!data.ok) return data;
    const target = data.forecastTarget;
    const solar = data.solarToday;
    const progress = target && solar != null ? Math.max(0, Math.min(100, (solar / target) * 100)) : null;
    return { ...data, target, progress };
  },
};
