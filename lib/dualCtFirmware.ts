/** Current-package metadata from the owned EcoFlow app API, not an OTA offer. */
export interface DualCtFirmwareReadback {
  version: string;
  basis: 'cloud_current_package';
  /** The API supplies no device-report timestamp; request time must not replace it. */
  hardwareReportedAt: null;
}

const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const version = (value: unknown): value is string => typeof value === 'string'
  && /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)
  && value.split('.').every((part) => Number(part) <= 255);

/** Never fall back to latestPackInfo.version, a module revision or a caller's annotation. */
export function readDualCtCurrentFirmware(data: unknown, sn: string): DualCtFirmwareReadback | null {
  if (!/^[A-Z0-9]{8,64}$/.test(sn) || !record(data) || data.sn !== sn
    || data.productType !== 421 || data.online !== 1 || !record(data.cpackInfo)) return null;
  const current = data.cpackInfo;
  if (!version(current.version) || current.isUpgrading !== false || current.orderUpgradeStatus !== 0
    || !record(current.module) || !Object.keys(current.module).length || Object.keys(current.module).length > 64
    || !Object.values(current.module).every(version) || !record(current.moduleIsLoader)
    || Object.values(current.moduleIsLoader).some((loader) => loader !== false)) return null;
  return { version: current.version, basis: 'cloud_current_package', hardwareReportedAt: null };
}
