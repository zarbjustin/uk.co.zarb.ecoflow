'use strict';
// Shared browser/backend research contract. No mapping or unit is hardware verified.
(function expose(root) {
  const staleMs = 90000;
  const banks = [
    { bank: 'A', total: 515, power: [962, 963, 772], voltage: [956, 957, 771], current: [958, 959, 784] },
    { bank: 'B', total: 998, power: [991, 992, 993], voltage: [985, 986, 987], current: [988, 989, 990] },
  ];
  const fields = [];
  for (const bank of banks) {
    fields.push({ field: bank.total, bank: bank.bank, phase: null, quantity: 'total_power', suggestedUnit: 'W',
      candidate: bank.bank === 'A' ? 'aggregatePower' : 'bankB_total_power', candidateUnit: bank.bank === 'A' ? 'W' : null });
    for (const [quantity, unit] of [['power', 'W'], ['voltage', 'V'], ['current', 'A']]) {
      bank[quantity].forEach((field, index) => fields.push({ field, bank: bank.bank, phase: index + 1, quantity,
        suggestedUnit: unit, candidate: bank.bank === 'A' ? `phase${index + 1}${quantity[0].toUpperCase()}${quantity.slice(1)}` : `bankB_${quantity}`,
        candidateUnit: bank.bank === 'A' ? unit : null }));
    }
  }
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  const contract = freeze({
    banks, fields, staleMs, retentionMs: 900000,
    productType: 421, cmdFunc: 254, cmdId: 21,
    workingRoles: { A: 'grid', B: 'solar_inverter_circuit' },
    counterParent: 773, structureOnlyParent: 997,
    counterFields: [1, 2, 3, 4, 6, 7], candidateKWhDivisor: 1000,
    mappingVerified: false, unitsVerified: false, directionVerified: false,
    // Exact expiry is stale. A receipt age alone is NOT a measurement age.
    isFreshAge: ageMs => Number.isFinite(ageMs) && ageMs >= 0 && ageMs < staleMs,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = contract;
  else root.EcoFlowDualCtContract = contract;
}(typeof globalThis !== 'undefined' ? globalThis : this));
