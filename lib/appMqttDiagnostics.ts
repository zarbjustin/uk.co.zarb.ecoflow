/** Whitelisted local delivery evidence. Never copies topics, identifiers, errors or payloads. */
export function appMqttDiagnosticsSnapshot(input: any) {
  if (!input || typeof input !== 'object') return null;
  const count = (key: string, max: number) => (Number.isSafeInteger(input[key]) && input[key] >= 0 && input[key] <= max ? input[key] : 0);
  return {
    connected: input.connected === true,
    listening: input.listening === true,
    pendingTopics: count('pendingTopics', 2),
    activeTopics: count('activeTopics', 2),
    rejectedTopics: count('rejectedTopics', 2),
    timedOutTopics: count('timedOutTopics', 2),
    receivedFrames: count('receivedFrames', 65535),
    lastFrameAgeSec: typeof input.lastFrameAgeSec === 'number' && Number.isFinite(input.lastFrameAgeSec) && input.lastFrameAgeSec >= 0
      ? input.lastFrameAgeSec : null,
  };
}

export function dualCtRejectionSnapshot(input: any) {
  const result: Record<string, number> = {};
  for (const reason of ['scope_or_receipt_rejected', 'receipt_order_rejected', 'header_rejected',
    'unsupported_encoding', 'unrelated_message', 'decode_rejected', 'malformed_frame']) {
    const value = input?.[reason];
    if (Number.isSafeInteger(value) && value > 0 && value <= 65535) result[reason] = value;
  }
  return result;
}
