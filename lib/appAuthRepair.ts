/** Source-preserving shared-account repair. No pairing, device settings, Energy gates or battery commands. */
import { createHash, randomUUID } from 'crypto';
import { registerAppAuthHandlers, appAuthCredentialsRevision } from './appAuthPairing';
import { STREAM_5000_DRIVER_IDS } from './stream5000Models';
import { dualCtAccountBinding } from './dualCtPreviewPairing';

function references(homey: any, current: any) {
  const found = new Set<any>();
  for (const id of [...STREAM_5000_DRIVER_IDS, 'stream_unit', 'smartmeter_dual_ct_preview', 'smartmeter_dual_ct_energy']) {
    let driver;
    try {
      driver = homey.drivers.getDriver(id);
    } catch {
      throw new Error('inventory_unknown');
    }
    if (!driver) throw new Error('inventory_unknown');
    const devices = driver.getDevices();
    if (!Array.isArray(devices) || devices.length > 512) throw new Error('inventory_unknown');
    devices.forEach((device) => found.add(device));
  }
  if (!found.has(current) || found.size > 512) throw new Error('current_device_missing');
  const devices = [...found];
  const rows = devices.map((device) => {
    const sn = device.getData()?.sn;
    if (typeof sn !== 'string' || !/^[A-Z0-9]{8,64}$/.test(sn)) throw new Error('identity_unknown');
    return {
      sn,
      preview: device.getStoreValue?.('dualCtAccountBinding') || null,
      energy: device.getStoreValue?.('dualCtEnergyAccountBinding') || null,
    };
  });
  rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { devices, rows, hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
}

type RepairHandler = (input: any) => Promise<any>;

export function registerAppAuthRepair(driver: any, pairing: any, current: any, now = Date.now) {
  let generation = 0;
  let busy = false;
  let review: { token: string; at: number; account: string; inventory: string; revision: string; credentials: string } | null = null;
  const error = () => new Error(driver.homey.__('app_account_repair.failed'));
  const handlers = new Map<string, RepairHandler>();
  const auth = registerAppAuthHandlers(driver, {
    setHandler(name: string, fn: any) {
      handlers.set(name, fn);
    },
  });
  async function verify() {
    const client = auth.getClient();
    if (!client) throw error();
    const account = dualCtAccountBinding(await client.getSession());
    const owned = new Set((await client.getDeviceList()).filter((device) => !device.shared).map((device) => device.sn));
    const refs = references(driver.homey, current);
    if (refs.rows.some((row) => !owned.has(row.sn) || (row.preview && row.preview !== account) || (row.energy && row.energy !== account))) throw error();
    return { ...refs, account, host: (await client.getSession()).host };
  }
  pairing.setHandler('app_account_repair_login', async (input: any) => {
    if (busy) throw error();
    busy = true; review = null; const operation = ++generation;
    try {
      const login = handlers.get('app_login');
      if (!login) throw error();
      await login(input);
      const checked = await verify();
      if (operation !== generation) throw error();
      const at = now();
      if (!Number.isFinite(at) || at <= 0) throw error();
      review = {
        token: randomUUID(),
        at,
        account: checked.account,
        inventory: checked.hash,
        revision: appAuthCredentialsRevision(driver.homey),
        credentials: createHash('sha256').update(JSON.stringify([input.email.trim(), input.password, checked.host])).digest('hex'),
      };
      return { token: review.token, expiresAt: at + 90000, affectedDevices: checked.devices.length };
    } catch {
      throw error();
    } finally {
      busy = false;
    }
  });
  pairing.setHandler('app_account_repair_confirm', async (input: any) => {
    const approved = review; review = null;
    const operation = ++generation;
    const fresh = () => approved && Number.isFinite(now()) && now() >= approved.at && now() - approved.at < 90000;
    if (!approved || input?.token !== approved.token || input?.accepted !== true || !fresh()) throw error();
    try {
      const checked = await verify();
      if (operation !== generation || !fresh() || checked.account !== approved.account || checked.hash !== approved.inventory
        || appAuthCredentialsRevision(driver.homey) !== approved.revision) throw error();
      // Settings are synchronous. Preserve a private in-memory rollback value for a partial write failure.
      const keys = ['appAuthEmail', 'appAuthPassword', 'appAuthHost'];
      const previous = keys.map((key) => driver.homey.settings.get(key));
      try {
        auth.commit();
        if (appAuthCredentialsRevision(driver.homey) !== approved.credentials) throw error();
      } catch {
        keys.forEach((key, index) => {
          try {
            if (previous[index] === undefined || previous[index] === null) driver.homey.settings.unset(key);
            else driver.homey.settings.set(key, previous[index]);
          } catch { /* Safe failure is reported; never print credentials or claim recovery. */ }
        });
        throw error();
      }
      // Only consumers that stop on a credential edit need an explicit resumption, retaining their own opt-in/binding checks.
      let resumed = true;
      for (const device of checked.devices) {
        if (typeof device.resumeAppAccountAfterRepair === 'function') {
          try {
            await device.resumeAppAccountAfterRepair();
          } catch {
            resumed = false;
          } // eslint-disable-line no-await-in-loop
        }
      }
      return {
        saved: true, resumeRequestsCompleted: resumed, existingDevicesChanged: false, energyActivated: false,
      };
    } catch {
      throw error();
    }
  });
  pairing.setHandler('app_account_repair_cancel', async () => {
    generation++; review = null; return true;
  });
  pairing.setHandler('disconnect', async () => {
    generation++; review = null; auth.dispose();
  });
}
