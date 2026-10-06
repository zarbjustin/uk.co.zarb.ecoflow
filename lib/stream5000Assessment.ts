'use strict';

import { StreamTopologyEvidence, streamTopologyFamily, TOPOLOGY_STALE_AFTER_MS } from './streamTopology';

/** Interprets locally observed evidence, never grants command or merge authority. */
export function stream5000Assessment(evidence: StreamTopologyEvidence | null, configuration: any, now: number): Record<string, unknown> {
  const family = evidence ? streamTopologyFamily(evidence.addressSn) : 'unknown';
  const peers = evidence?.peers.filter((peer) => peer.seenAt <= now && now - peer.seenAt <= TOPOLOGY_STALE_AFTER_MS) || [];
  const families = new Set([family, ...peers.map((peer) => streamTopologyFamily(peer.sn))].filter((value) => value !== 'unknown'));
  const fresh = (key: string) => configuration?.values?.[key]?.stale === false;
  const tasks = configuration?.values?.tasks;
  const taskCount = tasks && !tasks.stale && Array.isArray(tasks.value)
    ? tasks.value.filter((task: any) => task.enabled === true).length : null;
  let topologyStatus = 'membership_evidence_pending';
  if (families.size > 1) topologyStatus = 'mixed_family_peer_evidence_for_review';
  if (evidence?.truncated) topologyStatus = 'truncated_evidence';
  return {
    controlsEnabled: false,
    gridInput: {
      scope: 'addressed_device_grid_input_not_total_battery_charge',
      observation: fresh('maxGridInputW') ? 'recent_receipt_not_verified_application' : 'missing_or_stale',
      modelWriteEvidence: family === 'ac_5000' ? 'offline_es22_payload_replay' : 'unverified',
      safeCeilingVerified: false,
      zeroBlocksSolarVerified: false,
    },
    scheduling: {
      observedEnabledTaskCount: taskCount,
      controllerOwnership: 'unverified',
      setpointIsMeasuredPower: false,
      replacementAllowed: false,
    },
    topology: {
      status: topologyStatus,
      freshPeerCount: peers.length,
      autoMergeAllowed: false,
      capacitySummationAllowed: false,
      socAveragingAllowed: false,
    },
    hardwareAcceptance: 'pending',
  };
}
