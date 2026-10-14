/** Model-421 research hypotheses only. Banks are NOT CT port or installation roles. */
export const DUAL_CT_BANKS = [
  {
    bank: 'A', total: 515, power: [962, 963, 772], voltage: [956, 957, 771], current: [958, 959, 784],
  },
  {
    bank: 'B', total: 998, power: [991, 992, 993], voltage: [985, 986, 987], current: [988, 989, 990],
  },
] as const;

export function dualCtBankCandidate(field: number) {
  for (const bank of DUAL_CT_BANKS) {
    if (field === bank.total) {
      return {
        bank: bank.bank, phase: null, quantity: 'total_power', suggestedUnit: 'W',
      };
    }
    for (const [quantity, fields, unit] of [['power', bank.power, 'W'], ['voltage', bank.voltage, 'V'], ['current', bank.current, 'A']] as const) {
      const index = (fields as readonly number[]).indexOf(field);
      if (index >= 0) {
        return {
          bank: bank.bank, phase: index + 1, quantity, suggestedUnit: unit,
        };
      }
    }
  }
  return null;
}

/** Called once per strictly decoded pdata. NEVER feed a latest-per-field cache here. */
export function checkDualCtBanks(readings: Array<{ field: number; value: number }>) {
  const fields = new Map<number, number>();
  let invalid = false;
  for (const row of readings) {
    if (fields.has(row.field) || !Number.isFinite(row.value) || Math.abs(row.value) > 1000000) invalid = true;
    fields.set(row.field, row.value);
  }
  return DUAL_CT_BANKS.map((bank) => {
    const required = [bank.total, ...bank.power];
    const presentPowerFields = required.filter((field) => fields.has(field));
    const metadata = {
      bank: bank.bank,
      scope: 'single_decoded_payload' as const,
      presentPowerFields,
      mappingVerified: false,
      roleVerified: false,
      measurementSimultaneityVerified: false,
    };
    if (invalid) return { ...metadata, status: 'invalid' as const };
    if (presentPowerFields.length !== required.length) return { ...metadata, status: 'partial' as const };
    const reportedTotal = fields.get(bank.total)!;
    const phaseValues = bank.power.map((field) => fields.get(field)!);
    const phaseSum = phaseValues.reduce((sum, value) => sum + value, 0);
    const difference = reportedTotal - phaseSum;
    // Float32 arithmetic tolerance, NOT meter accuracy or physical validation.
    const tolerance = 0.001 + 0.000001 * (Math.abs(reportedTotal) + phaseValues.reduce((sum, value) => sum + Math.abs(value), 0));
    return {
      ...metadata,
      status: Math.abs(difference) <= tolerance ? 'consistent' as const : 'mismatch' as const,
      reportedTotal,
      phaseValues,
      phaseSum,
      difference,
      tolerance,
    };
  });
}

export type DualCtBankCheck = ReturnType<typeof checkDualCtBanks>[number];
