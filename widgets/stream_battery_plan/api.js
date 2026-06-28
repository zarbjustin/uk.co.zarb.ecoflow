'use strict';

const { streamData } = require('../stream_common');

module.exports = {
  async getBatteryPlan({ homey, query }) {
    return streamData(homey, query);
  },
};
