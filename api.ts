'use strict';

import { EcoFlowClient } from './lib/EcoFlowClient';

module.exports = {
  async validateCredentials({ body }: { body: Record<string, unknown> }): Promise<{ ok: true }> {
    const accessKey = typeof body.accessKey === 'string' ? body.accessKey.trim() : '';
    const secretKey = typeof body.secretKey === 'string' ? body.secretKey.trim() : '';
    const host = typeof body.host === 'string' ? body.host : undefined;
    const client = new EcoFlowClient({ accessKey, secretKey, host });
    await client.getDeviceList();
    return { ok: true };
  },
};
