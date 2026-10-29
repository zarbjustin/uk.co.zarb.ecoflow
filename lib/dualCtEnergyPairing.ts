import { createHash } from 'crypto';
import { registerAppAuthHandlers } from './appAuthPairing';
import { dualCtPreviewDevices } from './dualCtPreviewPairing';
import { DualCtHomeyEnergyContext } from './dualCtHomeyEnergyContext';
import { DualCtEnergyAdoptionWorkflow } from './dualCtEnergyAdoptionWorkflow';
import { DUAL_CT_ENERGY_RUNTIME_ENABLED, resolveDualCtGridEnergyContract } from './dualCtGridEnergySource';

const inventoryKey = (context: DualCtHomeyEnergyContext) => createHash('sha256')
  .update(JSON.stringify(context.snapshot()?.inventory.contributors.map((row) => ({ ...row })).sort((a, b) => a.id.localeCompare(b.id)))).digest('hex');

/** Separate new-device flow. No conversion, other-meter edits, controls or client-supplied verification. */
export function registerDualCtEnergyPairing(driver: any, session: any, dependencies = {
  enabled: () => DUAL_CT_ENERGY_RUNTIME_ENABLED,
  resolve: resolveDualCtGridEnergyContract,
  context: (sn: string, client: any) => new DualCtHomeyEnergyContext({ homey: driver.homey, sn, client }),
  now: Date.now,
}) {
  let generation = 0;
  let candidates = new Set<string>();
  let context: DualCtHomeyEnergyContext | null = null;
  let workflow: DualCtEnergyAdoptionWorkflow | null = null;
  let consent: { token: string; consent: boolean; externalOverlapReviewed: boolean } | null = null;
  let admitted: any = null;
  let admittedAt = 0;
  let inventory = '';
  const text = () => driver.homey.__('dual_ct_energy.unavailable');
  const guard = () => {
    if (!dependencies.enabled()) throw new Error(text());
  };
  const cancel = () => {
    generation++; workflow?.cancel(); context?.close(); workflow = null; context = null;
    consent = null; admitted = null;
  };
  // Gate shared authentication handlers too: a blocked entry point cannot make discovery/login requests.
  const auth = registerAppAuthHandlers(driver, {
    setHandler(name: string, handler: any) {
      session.setHandler(name, async (input: any) => {
        if (name !== 'disconnect') guard();
        if (name === 'app_login') {
          cancel(); candidates.clear();
        }
        return handler(input);
      });
    },
  });
  session.setHandler('dual_ct_energy_access', async () => ({ enabled: dependencies.enabled() }));
  session.setHandler('dual_ct_energy_candidates', async () => {
    guard(); cancel(); candidates.clear(); const operation = generation;
    try {
      const client = auth.getClient();
      if (!client) throw new Error('account');
      const paired = new Set(driver.getDevices().map((device: any) => device.getData()?.sn));
      const rows = dualCtPreviewDevices(await client.getDeviceList()).filter((row) => !paired.has(row.sn));
      if (operation !== generation || !dependencies.enabled()) return [];
      candidates = new Set(rows.map((row) => row.sn));
      return rows.map((row) => ({ sn: row.sn, label: `Dual CT · ${row.sn.slice(-4)}` }));
    } catch {
      throw new Error(text());
    }
  });
  session.setHandler('dual_ct_energy_review', async (input: any) => {
    guard(); if (!candidates.has(input?.sn)) throw new Error(text());
    cancel(); const operation = generation;
    const selectedContext = dependencies.context(input.sn, () => auth.getClient());
    context = selectedContext;
    workflow = new DualCtEnergyAdoptionWorkflow({
      readSelection: () => selectedContext.readSelection(),
      readInventory: () => selectedContext.readInventory(),
      resolveContract: dependencies.resolve,
      runtimeEnabled: dependencies.enabled,
      now: dependencies.now,
    });
    try {
      const review = await workflow.prepare();
      if (operation !== generation || !dependencies.enabled()) throw new Error('cancelled');
      return review;
    } catch {
      throw new Error(text());
    }
  });
  session.setHandler('dual_ct_energy_approve', async (input: any) => {
    guard();
    if (!workflow || !context || input?.consent !== true || input?.externalOverlapReviewed !== true || typeof input.token !== 'string') throw new Error(text());
    // Confirmation is consumed by the native list/add flow, never by a customer-supplied device/store object.
    consent = { token: input.token, consent: true, externalOverlapReviewed: true };
    return true;
  });
  session.setHandler('list_devices', async () => {
    guard();
    if (!workflow || !context || !consent || admitted) throw new Error(text());
    const operation = generation;
    try {
      const row = await workflow.confirm(consent); consent = null;
      if (operation !== generation || !dependencies.enabled()) throw new Error('cancelled');
      admitted = row; admittedAt = dependencies.now(); inventory = inventoryKey(context);
      return [{ ...row, data: { ...row.data }, store: { ...row.store } }];
    } catch {
      throw new Error(text());
    }
  });
  session.setHandler('add_device', async (input: any) => {
    guard();
    const expected = admitted; admitted = null; // One actual Add only, consumed before any await.
    const operation = generation;
    const fresh = () => Number.isFinite(dependencies.now()) && dependencies.now() >= admittedAt && dependencies.now() - admittedAt < 90000;
    if (!expected || !context || !fresh() || input?.data?.sn !== expected.data.sn
      || Object.keys(input.data).length !== 1
      || Object.keys(expected.store).some((key) => input.store?.[key] !== expected.store[key])) throw new Error(text());
    const selectedContext = context;
    try {
      await selectedContext.refresh();
      const snapshot = selectedContext.snapshot();
      const contract = snapshot && dependencies.resolve(snapshot.source.identity);
      const review = new DualCtEnergyAdoptionWorkflow({
        readSelection: () => selectedContext.readSelection(),
        readInventory: () => selectedContext.readInventory(),
        runtimeEnabled: dependencies.enabled,
        resolveContract: dependencies.resolve,
        now: dependencies.now,
      });
      const token = await review.prepare();
      const row = await review.confirm({ token: token.token, consent: true, externalOverlapReviewed: true });
      if (!snapshot || !contract || inventoryKey(selectedContext) !== inventory || operation !== generation || !fresh()
        || Object.keys(expected.store).some((key) => row.store[key as keyof typeof row.store] !== expected.store[key])) throw new Error('changed');
      guard(); auth.commit();
    } catch {
      throw new Error(text());
    }
  });
  session.setHandler('dual_ct_energy_cancel', async () => {
    cancel(); return true;
  });
  session.setHandler('disconnect', async () => {
    cancel(); candidates.clear(); auth.dispose();
  });
}
