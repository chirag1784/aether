# SECURITY & DATA GOVERNANCE

## Roles

`admin | facilitator | engineer | reviewer | viewer`

| capability | admin | facilitator | engineer | reviewer | viewer |
| --- | --- | --- | --- | --- | --- |
| project create/delete | yes | no | no | no | no |
| edit project profile / jurisdiction | yes | yes | no | no | no |
| upload documents | yes | yes | yes | no | no |
| accept extracted field | yes | yes | yes | no | no |
| mark field VERIFIED | yes | yes | no | yes | no |
| approve node | yes | yes | no | no | no |
| edit worksheet | yes | yes | yes | no | no |
| set residual risk | yes | yes | no | no | no |
| close out recommendation | yes | yes | no | yes | no |
| set legal applicability CONFIRMED | yes | yes | no | yes | no |
| mark compliance evidence verified | yes | no | no | yes | no |
| mark report REVIEWED / APPROVED | yes | yes | no | yes | no |
| run AI actions | yes | yes | yes | no | no |
| export DRAFT | yes | yes | yes | yes | yes |

In the published single-page deployment these roles map onto the artifact
sharing levels the platform reports: `owner` -> admin, `admin` (can edit) ->
facilitator, `interact` -> engineer, `view` -> viewer. A reviewer is an
explicitly assigned team member with `reviewer` set on their team record. The UI
gates controls on the reported level *before* a write is attempted, and treats a
rejected write as authoritative.

## Data handling

* Secrets stay server-side. In the Docker deployment the browser sees only
  `/api/*`; no provider key is ever sent to the client. In the published
  deployment there is no provider key at all — AI calls run on the viewer's own
  Claude account through the platform, so no key exists to leak.
* Uploaded documents are hashed (SHA-256) on ingest; the hash and version are
  recorded and printed in the report's document register.
* External research is opt-in per project (`researchEnabled`), and
  `confidentialDocuments` blocks document text from leaving the deployment
  regardless of the research setting.
* Audit entries are append-only in practice: the UI has no delete path, and the
  store's audit documents are written by appending to a day bucket.
* JSON backup is the export/restore path; it is the user's responsibility to
  store it, and the UI says so.
* Retention is configurable per project; nothing is deleted automatically.

## Threat notes for the published deployment

* The artifact's shared store is organization-internal: every reader and writer
  is a signed-in member of the owner's organization. It cannot be shared by
  public link while `db` is declared.
* Shared data is untrusted input. Text coming back from the store is rendered
  with `textContent`, never `innerHTML`, throughout the app.
* AI output is untrusted input. It is parsed, schema-checked and range-checked
  before any write, and it cannot reach the statuses listed in ARCHITECTURE §5.
