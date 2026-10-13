/** Only vendor model-code fields, never names, serials or arbitrary strings. */
export function dualCtModelCodes(input: any): Array<{ field: string; code: number }> {
  const fields = ['productId', 'productType', 'modelId', 'deviceType'];
  if (Array.isArray(input)) {
    return input.slice(0, 4).filter((item) => fields.includes(item?.field)
    && Number.isInteger(item.code) && item.code >= 0 && item.code <= 0xffffffff)
      .map((item) => ({ field: item.field, code: item.code }));
  }
  if (!input || typeof input !== 'object') return [];
  return fields.flatMap((field) => {
    const raw = input[field];
    let code = NaN;
    if (typeof raw === 'number') code = raw;
    else if (typeof raw === 'string' && /^\d{1,10}$/.test(raw)) code = Number(raw);
    return Number.isInteger(code) && code >= 0 && code <= 0xffffffff ? [{ field, code }] : [];
  });
}
