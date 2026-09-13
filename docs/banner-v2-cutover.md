# Banner v2 cutover

Banner v2 is an explicit, coordinated opt-in. The default process state is
safe fallback: student readers use the unchanged `student.banners` data and
the destination editor does not accept v2 writes. The fallback keeps the
shared media-reference/advisory-lock protections and retired legacy-writer
guards enabled.

## Activation contract

Set all four environment values below before enabling v2 in a process:

| Variable | Required value | Meaning |
| --- | --- | --- |
| `BANNER_V2_ACTIVATION` | `enabled` | Requests v2 cutover for this process. |
| `BANNER_BP01_WRITER_PROTECTION_ACK` | `1`, `true`, or `yes` | Every writer uses the BP-01 reference/lock protocol. |
| `BANNER_LEGACY_WRITER_RETIREMENT_ACK` | `1`, `true`, or `yes` | Legacy text and v1 artwork writers are retired. |
| `BANNER_LEGACY_WRITER_DRAIN_ACK` | `1`, `true`, or `yes` | Old in-flight mutations have drained. |

Any missing, malformed, or negative acknowledgement keeps the process in
safe fallback. The implementation does not perform deployment, inspect live
writer instances, or assert that production has drained; operators must make
those acknowledgements as part of their rollout procedure.

To fall back safely, remove `BANNER_V2_ACTIVATION=enabled` (or any required
acknowledgement). Do not roll back to an old binary that can bypass the shared
lock or mutate the retained legacy payloads. The fallback is a reader/editor
mode switch, not a data reset or migration.

## Preview and delivery boundaries

Normal Admin Preview reads a destination's published v2 design when the
process is active and otherwise shows the unchanged legacy banner. A saved
draft is read only when an Admin explicitly requests a valid revision under
the managed preview boundary; a missing or stale revision is rendered as a
clear unavailable-draft state. Student loaders never accept a draft selector.

Published student artwork uses the student delivery endpoint. Admin Preview
uses the separate Admin-authorized published or draft endpoint, both scoped by
destination, revision, and derived image slot.
