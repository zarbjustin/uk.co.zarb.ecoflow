'use strict';

import { EcoFlowClient } from './lib/EcoFlowClient';
import { createSupportSnapshot } from './lib/supportSnapshot';
import { streamCoordinationPreview } from './lib/streamCoordinationPreview';

module.exports = {
  async coordinationPreview({ body }: { body: any }): Promise<Record<string, unknown>> {
    // The endpoint owns its clock; a supplied "now" cannot make stale readings fresh.
    const input = body?.input;
    return streamCoordinationPreview({
      now: Date.now(),
      manualOverride: input?.manualOverride,
      controllerConflict: input?.controllerConflict,
      bydSoc: input?.bydSoc,
      bydBatteryW: input?.bydBatteryW,
      streamBatteryW: input?.streamBatteryW,
    }, body?.previous, body?.policy);
  },
  async supportSnapshot({ homey }: { homey: unknown }): Promise<Record<string, unknown>> {
    return createSupportSnapshot(homey);
  },
  async validateCredentials({ body }: { body: Record<string, unknown> }): Promise<{ ok: true }> {
    const accessKey = typeof body.accessKey === 'string' ? body.accessKey.trim() : '';
    const secretKey = typeof body.secretKey === 'string' ? body.secretKey.trim() : '';
    const host = typeof body.host === 'string' ? body.host : undefined;
    const client = new EcoFlowClient({ accessKey, secretKey, host });
    await client.getDeviceList();
    return { ok: true };
  },
};
