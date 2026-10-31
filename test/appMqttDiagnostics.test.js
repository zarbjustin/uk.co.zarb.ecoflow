'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { appMqttDiagnosticsSnapshot: clean } = require('../.homeybuild/lib/appMqttDiagnostics');
const { dualCtCommunityFeedbackSnapshot: community } = require('../.homeybuild/lib/dualCtCommunityFeedback');

test('transport diagnostics whitelist bounded counts and discard private fields in both phase paths', () => {
  const input = { connected: true, listening: true, activeTopics: 2, pendingTopics: 0, rejectedTopics: 0,
    timedOutTopics: 0, receivedFrames: 5, lastFrameAgeSec: 2, topic: 'PRIVATE', userId: 'PRIVATE', serial: 'PRIVATE',
    payload: 'PRIVATE', error: 'PRIVATE', timestamp: 'PRIVATE' };
  assert.deepEqual(clean(input), { connected: true, listening: true, activeTopics: 2, pendingTopics: 0, rejectedTopics: 0,
    timedOutTopics: 0, receivedFrames: 5, lastFrameAgeSec: 2,
    socketEvidenceScope: 'unknown', socketReceivedFrames: 0, socketRouteRejectedFrames: 0, socketPingResponses: 0,
    socketLastFrameAgeSec: null, socketLastPingAgeSec: null, socketConnectionAgeSec: null });
  assert.doesNotMatch(JSON.stringify(community({ scope: 'three_phase_community_trial', transport: input })), /PRIVATE/);
  assert.equal(community({ scope: 'three_phase_community_trial', transport: input }).transport.receivedFrames, 5);
  assert.equal(clean(null), null);
  for (const bad of [Infinity, NaN, -1, 3.5, 'PRIVATE', {}]) {
    const result = clean({ activeTopics: bad, receivedFrames: bad, lastFrameAgeSec: bad });
    assert.equal(result.activeTopics, 0); assert.equal(result.receivedFrames, 0);
  }
});


test('preview rejection reasons remain bounded classifications without copying unknown fields', () => {
  const { dualCtRejectionSnapshot: cleanReasons } = require('../.homeybuild/lib/appMqttDiagnostics');
  assert.deepEqual(cleanReasons({ unsupported_encoding: 4, malformed_frame: 1, raw: 'PRIVATE',
    header_rejected: 'PRIVATE', unrelated_message: Infinity, decode_rejected: -1 }),
  { unsupported_encoding: 4, malformed_frame: 1 });
});


test('shared socket evidence is bounded and explicitly separate from per-device receipt counts', () => {
 const result=clean({socketEvidenceScope:'shared_current_connection',socketReceivedFrames:8,socketRouteRejectedFrames:2,
 socketPingResponses:4,socketLastFrameAgeSec:1,socketLastPingAgeSec:2,socketConnectionAgeSec:60,receivedFrames:0,topic:'PRIVATE'});
 assert.equal(result.socketReceivedFrames,8);assert.equal(result.receivedFrames,0);
 assert.equal(result.socketEvidenceScope,'shared_current_connection');assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
 const bad=clean({socketReceivedFrames:65536,socketRouteRejectedFrames:-1,socketPingResponses:Infinity,socketLastPingAgeSec:-1,socketConnectionAgeSec:NaN});
 assert.equal(bad.socketReceivedFrames,0);assert.equal(bad.socketRouteRejectedFrames,0);assert.equal(bad.socketPingResponses,0);
 assert.equal(bad.socketLastPingAgeSec,null);assert.equal(bad.socketConnectionAgeSec,null);
});
