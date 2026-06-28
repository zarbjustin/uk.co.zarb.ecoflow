'use strict';

const { streamData } = require('../stream_common');

module.exports = {
  async getBalance({ homey, query }) {
    return streamData(homey, query);
  },
};
