# Dual CT pairing review feedback — corrective 1.11.8 Test candidate

30 October 2026. Test 1.11.7/build 74 is already published. Development remains
1.11.5. The owner interrupted expedited maintenance to investigate new pairing
feedback before proceeding. No coordinator pause, reserve release or installation
had occurred. The previously approved maintenance archive is unchanged.


## Published checkpoint

Corrective Test **1.11.8/build 75** is active, verified 30 October 2026, with
successful exact-source CI 41132995305 and the authorised private follow-up sent.
Live remains 1.10.3/build 18 and installed Development remains 1.11.5. The native
field result is still pending. See the newest handover/status checkpoint for
source/archive provenance and independent preservation readbacks. The preparation
and hold history below remains historical; no local installation is authorised by
this Test publication.

## Confirmed findings

The pairing review action had no in-progress indication or overall UI deadline.
All verification errors used the generic unsupported-meter message at the top
of the form. That message could be outside the mobile viewport. A successful
three-phase review also retained a single-phase scope-consent statement.

Three new browser regressions failed on the original page: visible/bounded slow
review, visible private-error handling and correct three-phase scope. The existing
three workflow tests passed. These reproduce source/UI defects; they do not
identify the field installation's exact failing backend prerequisite.

## Prepared correction

- Show translated progress next to the review button and bring feedback into view.
- End a pending review after 30 seconds, invalidate its generation, cancel the
  server review and keep confirmation unavailable. A late reply cannot admit it.
- Relay only allowlisted backend classifications for source readback, unsupported
  contract, inventory failure/unknown inventory, source overlap and expired reads.
  Translate them locally; never show raw upstream exceptions or credentials.
- Render three-phase scope consent for three-phase review and preserve the
  original single-phase scope for single-phase review.

No source/firmware/ownership/overlap requirement, accounting path, existing meter,
binding, consent or counter is relaxed. Verification does not add a device or
change another Energy source. Cancellation and stale responses remain fail-closed.

## Evidence and remaining uncertainty

All 1,284 tests, lint and release checks pass with the local correction. Pinned Homey CLI 4.5.3 verified validation also passes. Failure-stage
and late-response regressions use synthetic accounts/inventory; no tester raw
diagnostics or correspondence is included here. These checks do not prove the
field setup now completes.

The field report alone cannot distinguish a slow response from a source-read,
inventory, qualification or overlap rejection. Do not claim the meter firmware,
wiring or owner configuration is wrong, or request repetitive generic captures.
The new bounded visible result can guide one specific follow-up after an approved
corrective candidate. No further message or capture request was sent here.

## Delivery hold

The owner authorised versioning this correction as 1.11.8, source commit/push,
exact CI and Test publication, followed by a private reply. It is not a replacement
1.11.7 archive, and installation remains unauthorised in this delivery.
Do not publish or install the working tree under the old archive approval. Keep
the previously scheduled 1.11.7 maintenance installation deferred while this
pairing issue and corrective candidate are reviewed. A subsequent archive needs
its own version/provenance, exact CI and appropriate installation/publication
approval. Live and the installed app must remain unchanged; Test activation is separately
recorded in the newest handover/status checkpoint.
