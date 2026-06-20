'use strict';

export interface EcoFlowDevice {
  sn: string;
  deviceName?: string;
  online: number; // 0 | 1
  productName?: string;
}

export interface AppCertification {
  certificateAccount: string;
  certificatePassword: string;
  url: string;
  port: string;
  protocol: string; // 'mqtt' | 'mqtts'
}

export interface HistoryPoint {
  indexName: string;
  indexValue: number | string;
  unit?: string;
  extra?: string;
}

export type Quota = Record<string, any>;

/** Envelope used by STREAM/BKW set commands (cmdFunc 254). */
export interface StreamSetEnvelope {
  sn: string;
  cmdId: number;
  cmdFunc: number;
  dirDest: number;
  dirSrc: number;
  dest: number;
  needAck: boolean;
  params: Record<string, any>;
}
