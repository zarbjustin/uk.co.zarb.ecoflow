# Release candidate acceptance — diagnostic hardening wave

This is an acceptance checklist, not certification or physical acceptance.
The owner has authorised a diagnostic-only Test release after exact CI passes;
see STATUS.md for the final version, archive and publication evidence.

## Software checks available without new tester data

- Run tests, lint, `npm run release:check`, dependency audit and sequential Homey
  verified validation. Check version agreement and generated manifest drift.
- Recovery: hung opening/catalog, opt-out, timeout, late success/rejection,
  account change, two tabs and shutdown cannot retain a busy slot or revoke a retry.
- Endurance: repeated page sessions and 48-hour synthetic observation replay
  release all owned readers/timers, expire leases and reset dwell after gaps.
- Coexistence: original and ES21/ES22/preview transport subscribers survive
  another research subscriber detaching; use the existing real driver restore /
  energy-checkpoint tests as well. Synthetic subscribers do not prove decoding.
- Upgrade: Live v1.10.3 and diagnostic Flow fixtures retain IDs, arguments,
  settings and Energy identities. Existing real driver tests preserve synthetic
  stores through restart. No native backup/restore is inferred from these tests.
- Source/privacy: known candidate previews stay out of Flow monitoring, blocked
  fields name the problem, units are explicit, platform permission is honest,
  and no token/measurement export is expanded.
- Documentation/store copy distinguishes monitoring, display-only candidates,
  reported settings, calculated totals and physical actuation. No false claim
  that all candidate measurements enter Insights or every model supports control.

The new release-boundary check is also in the local CI definition. It deliberately
rejects accidental Energy activation, public routes, permission expansion, preview
autostart, extra driver/action identities and changed legacy arguments. It is a
software scope check, not physical acceptance or certification evidence.

## Gates still requiring native Homey / owner hardware

| Gate | Required evidence | Current state |
| --- | --- | --- |
| Native update and recovery | Backed-up non-production Homey, real settings bridge, original saved Flows/Insights/totals, restart and rollback readback | Open; no installed host changed |
| Original STREAM | Unit versus installation grid, valid zero, remaining-time scope, per-field age and normal-use Flow behaviour | Existing software coverage; physical acceptance separate |
| ES21 / ES22 | Each model's charge/discharge/idle, direct PV where relevant, socket flow, silence/reconnect and linked reporter scope | Open for owner commissioning |
| Dual CT | Each circuit/phase, signed CT1 net, hybrid CT2 interpretation and independent expiry | Community display evidence; not a verified Energy/automation contract |
| Cross-app sources | Actual installed app/version, timestamps/zero substitution, W/kW/polarity, same physical battery and whole-grid scope | Metadata contract only |
| New controls / Energy | Separate model-specific approval and commissioning, restore path and duplicate-source checks | Disabled; not part of this wave |

No clean install, re-pairing, forced native update, credential revocation or live
Flow activation is an acceptance shortcut. Perform native testing only after
explicit owner approval on a suitable host. This wave requests no more captures
from Robert. A release may keep experimental features opt-in or withheld; define
the supported monitoring subset explicitly before certification.

## Authorised Test publication sequence

Commit/push on the diagnostic branch; verify exact remote CI, version/tag CI, archive
contents and Test portal/listing separately. Do not publish red. Certification,
Live promotion, installation and hardware acceptance are independent decisions.
Mainline and Live stay unchanged. Test may advance only after these checks pass;
installed-host updates and physical activation are separate decisions.
