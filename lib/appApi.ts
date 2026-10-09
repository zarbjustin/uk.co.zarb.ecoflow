'use strict';

import { QuotaHandler, StatusHandler } from './EcoFlowMqtt';
import { AppFrameHandler } from './EcoFlowAppMqtt';

/** The realtime API surface the app exposes to devices (see app.ts). */
export interface EcoFlowAppApi {
  subscribeRealtime(sn: string, onQuota: QuotaHandler, onStatus?: StatusHandler): Promise<boolean>;
  unsubscribeRealtime(sn: string, onQuota?: QuotaHandler, onStatus?: StatusHandler): void;
  /**
   * App-auth (WSS) realtime feed for admitted STREAM monitoring adapters and
   * optional BK PV diagnostics. Separate from the supported `/open` surface.
   */
  subscribeAppRealtime(sn: string, onFrame: AppFrameHandler): Promise<boolean>;
  unsubscribeAppRealtime(sn: string, onFrame?: AppFrameHandler): void;
}

/**
 * Typed accessor for the shared app instance. Replaces the ad-hoc
 * `(this.homey.app as any)` casts with a single typed boundary so the realtime
 * method signatures are checked at compile time.
 */
export function getApp(homey: { app: unknown }): EcoFlowAppApi {
  return homey.app as EcoFlowAppApi;
}
