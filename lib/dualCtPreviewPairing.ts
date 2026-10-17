import { createHash } from 'crypto';
import { AppDevice } from './appDevices';
import { registerAppAuthHandlers } from './appAuthPairing';
import { AppAuthSession } from './EcoFlowAppAuthClient';
import { dualCtDiscoveryIdentity } from './dualCtSources';

export const DUAL_CT_PREVIEW_DRIVER = 'smartmeter_dual_ct_preview';
export const DUAL_CT_PREVIEW_CONSENT = 1;

/** Local binding only. Never include account identity or this digest in reports. */
export function dualCtAccountBinding(session: Pick<AppAuthSession, 'host' | 'userId'>): string {
  if (!session || !['https://api.ecoflow.com', 'https://api-e.ecoflow.com'].includes(session.host)
    || typeof session.userId !== 'string' || !session.userId.trim()) throw new Error('EcoFlow account unavailable.');
  return createHash('sha256').update(JSON.stringify([session.host, session.userId])).digest('hex');
}

/** Same provisional identity policy as research, but not restricted to two capture slots. */
export function dualCtPreviewDevices(devices: AppDevice[]): AppDevice[] {
  const seen = new Set<string>();
  return devices.slice(0, 256).filter((device) => {
    if (!device || device.shared || !/^[A-Z0-9]{8,64}$/.test(device.sn) || seen.has(device.sn)
      || !dualCtDiscoveryIdentity(device)
      || !device.modelCodes?.some((code) => code.field === 'productType' && code.code === 421)) return false;
    seen.add(device.sn); return true;
  });
}

export function registerDualCtPreviewPairing(driver: any, session: any): void {
  const auth = registerAppAuthHandlers(driver, session);
  let accepted = false;
  let listed = new Set<string>();
  let listedAccount: string | null = null;
  let generation = 0;
  session.setHandler('dual_ct_preview_consent', async (input: any) => {
    generation++;
    accepted = input?.accepted === true;
    listed = new Set();
    listedAccount = null;
    return accepted;
  });
  session.setHandler('list_devices', async () => {
    if (!accepted) throw new Error(driver.homey.__('dual_ct_preview.consent_required'));
    const operation = ++generation;
    const client = auth.getClient();
    if (!client) throw new Error(driver.homey.__('dual_ct_preview.account_required'));
    try {
      const account = dualCtAccountBinding(await client.getSession());
      const devices = dualCtPreviewDevices(await client.getDeviceList());
      if (!accepted || operation !== generation) return [];
      const paired = new Set(driver.getDevices().map((device: any) => device.getData()?.sn));
      const results = devices.filter((device) => !paired.has(device.sn)).map((device) => ({
        name: `${driver.homey.__('dual_ct_preview.name')} · ${device.sn.slice(-4)}`,
        data: { sn: device.sn },
        store: { dualCtPreviewConsent: DUAL_CT_PREVIEW_CONSENT, dualCtAccountBinding: account },
        settings: { preview_enabled: true },
      }));
      listed = new Set(results.map((device) => device.data.sn));
      listedAccount = account;
      return results;
    } catch {
      if (operation === generation) {
        listed = new Set(); listedAccount = null;
      }
      throw new Error(driver.homey.__('dual_ct_preview.discovery_failed'));
    }
  });
  // The shared auth helper commits only after an actual Add event. Guard that
  // event here too; a cancelled or declined preview must never save credentials.
  session.setHandler('add_device', async (device: any) => {
    if (!accepted || !listed.has(device?.data?.sn)) throw new Error(driver.homey.__('dual_ct_preview.consent_required'));
    const operation = generation;
    const client = auth.getClient();
    if (!client || dualCtAccountBinding(await client.getSession()) !== listedAccount || !accepted || operation !== generation) {
      throw new Error(driver.homey.__('dual_ct_preview.account_required'));
    }
    auth.commit();
  });
  session.setHandler('disconnect', async () => {
    generation++; accepted = false; listed.clear(); listedAccount = null;
    auth.dispose();
  });
}
