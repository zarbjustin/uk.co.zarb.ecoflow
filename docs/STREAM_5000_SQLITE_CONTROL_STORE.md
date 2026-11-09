# STREAM 5000 SQLite control store - offline candidate

This is a concrete worker-isolated `ControlStoragePort`, not a qualified Homey
backend, native writer or released battery THEN action. It is not imported by
the app/driver runtime. No acceptance gate changes and no new battery card.

## Implemented contract

The caller supplies an absolute existing private database path, installation
identity, immutable incarnation and independently retained minimum revision.
Ordinary load/CAS never provisions, migrates, repairs or retries a namespace.
Explicit `provision` accepts only an empty version-2 journal and creates an
exclusive new file; it never overwrites. A failed/uncertain provision may leave
a partial file. Hold for manual reconciliation, never delete/retry automatically.

SQLite opens, reads, writes and closes in one owned worker, loaded lazily only
for its tagged worker entry. One operation is admitted; overload rejects.
Initialization/operation/shutdown confirmation have five-second deadlines;
SQLite lock waiting is one second. Timers/listeners are owned and cleared.
The owner must await `store.close()` after stopping its engine; engine stop is
not store cleanup or evidence that an uncertain transaction rolled back.

`BEGIN IMMEDIATE` and a conditional immutable-identity/revision update provide
real competing-connection CAS. Success requires COMMIT and an exact journal,
identity and next-revision acknowledgement. Extra schema objects, malformed
records, unknown journal fields, unsafe revisions, decreasing claim IDs or
terminal-frontier claim/field revisions and oversized/non-data journals fail
closed. Legal phase transitions/native evidence remain the trusted existing
engine/ledger's responsibility, not a property authenticated by SQLite.
Recovery holds active claims without
silently rewriting their persisted intent. Conflict does not retry or poison a
healthy connection; abort/lost reply/worker failure permanently holds it.
Fresh explicit recovery may observe a committed operation after a lost reply.

## Unclosed trust and platform requirements

- Caller floor authority must be independently trustworthy and durably advanced.
  The local high-water mark detects regression during one lifetime, not authentic
  rollback across restart with a stale external floor. This class supplies no
  independent persistent floor issuer or native execution-fencing authority.
- POSIX owned directory `0700`, regular single-link file `0600`, realpath and
  inode checks are enforced. They are not ACL/ancestor/platform attestation or
  defense against a malicious same-UID process. SQLite opening can create a
  file in a deletion race; replacement is detected, but race-proof no-create
  is not claimed. No automatic path or permission repair.
- DELETE journaling, verified EXTRA synchronization and requested fullfsync
  are connection policy, not physical power-loss proof. Sidecar privacy, actual
  filesystem/device durability, failure injection, provisioning policy and
  independently anchored recovery need exact target-backend qualification.
- Node 22's SQLite is experimental. Mac availability is not Homey availability.
  Unsupported target runtimes fail; there is no in-memory fallback. Worker
  isolation and deadlines do not guarantee interruption of pathological kernel
  IO. Unconfirmed shutdown remains held, not cancellation of a native operation.
- API ACK, matching reserve readback and this durable journal do not establish
  native causal terminality, no-late execution, native-AI coordination or
  physical application. Those remain separate provider/model/firmware gates.

## Product and release boundary

EdNL's battery THEN requirement remains unmet: no AC5000 battery THEN card is
released. Existing monitoring/IF and original STREAM actions are unchanged.
Unit-reserve is the narrowly proposed first action, not system/mode/feed/socket
or exact-watts support. Keep the strong applied-control contract; a lasting
request-only product needs its own reviewed policy rather than renamed gates.

Next: qualify Homey-private storage and independent floor/issuance authority;
obtain real native terminal/expiry or a rigorously equivalent contract; implement
only eligible model/device-scoped handlers; run an exactly approved bounded
pilot, installed-candidate preservation/UI/recovery and 48-hour soak; obtain
precise Test-release approval. All `release:then` gates remain OPEN.
