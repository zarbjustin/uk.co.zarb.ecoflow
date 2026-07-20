'use strict';

const { streamData } = require('../stream_common');

module.exports = {
  async getSolarForecast({ homey, query }) {
    const data = streamData(homey, query);
    if (!data.ok) return data;
    const solar = data.solarToday;
    const forecastToday = data.solarForecastToday;
    // Prefer the real weather-based forecast; fall back to the manual target.
    const denom = forecastToday != null && forecastToday > 0 ? forecastToday : (data.forecastTarget || null);
    const progress = denom && solar != null ? Math.max(0, Math.min(100, (solar / denom) * 100)) : null;
    return {
      ...data,
      forecastToday,
      forecastTomorrow: data.solarForecastTomorrow,
      target: data.forecastTarget,
      progress,
    };
  },
};
