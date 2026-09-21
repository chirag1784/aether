# The assistant

The assistant has authority over the application. It reads every collection and
every engine result, and it writes records through `store.create/update/remove`
— the same audited, revisioned, attributed path a human edit takes.

Three things constrain it, and none of them is a limit on capability.

## 1. It calculates nothing

Risk scores, unit conversions, threshold comparisons and renewal dates are
arithmetic in `packages/`. `get_risk` asks the engine; the read tools return
figures the engines have already computed. The assistant quotes them and says
they are the application's. This matters because the project may not use a
multiplicative matrix, and a model that multiplies L by S would be confidently
wrong on a lookup matrix.

## 2. It cannot sign

Five acts are a human's signature on an engineering document:

| Act | Who |
| --- | --- |
| Marking a field `VERIFIED` | the engineer who read the source document |
| Marking compliance evidence verified | a named reviewer |
| Closing a recommendation | the action owner, against evidence |
| Marking a report `REVIEWED` or `APPROVED` | the reviewer and the approver |
| Entering a statutory threshold as verified | whoever read the official text |

`HUMAN_ONLY` in `app/ai-tools.js` holds the list, `FORBIDDEN_FIELDS` blocks the
underlying writes, and `request_human_attestation` is declared as a tool so the
assistant learns the boundary from the tool list rather than by having a write
silently dropped. It answers with who has to do it and what to ask for.

## 3. Every write is reversible and visible

Each write lands in `chat_actions` with the record before and after, and the
assistant panel shows the ledger with an Undo on each entry. `undoAction()`
reverses a create by deleting, an update by restoring the previous values of
exactly the fields that changed, and a delete by recreating the record.

## Autonomy is the user's setting

`S.chatAutonomy` is `ASK` or `ACT`, chosen in Settings or from the panel
header. The assistant cannot change it.

* **Ask first** — a write tool queues the change and returns "Queued… It has
  NOT been applied" to the assistant, which then says it is waiting for
  confirmation. The panel renders a card with Apply and Decline.
* **Act and report** — the write runs, the ledger records it, and the tool
  returns what actually happened.

A write tool's result is the only truth about what happened. A result beginning
"Refused" or "Failed" is reported as such; the assistant is told never to claim
a change the tool did not confirm.

## What the tools are

Reads: `get_worksheet`, `get_risk`, `get_coverage`, `get_chemicals`,
`get_legal`, `get_doability`, `get_gate`, `get_research_plan`,
`get_reference`. Writes: `create_record`, `update_record`, `delete_record`,
`set_effort`, `open_view`, plus `request_human_attestation`.

`WRITABLE` names the collections the assistant may write and the fields it may
set on each. A field outside the list is dropped and the drop is reported, so
the assistant learns rather than guessing again. A residual rating written
through `update_record` goes through `validateResidual()` — the same validator
a human's edit passes, including the rule that an administrative basis cannot
reduce severity.

## Reasoning passes

Six passes in `app/reason.js`, each of which states its method on screen before
it runs so the engineer judges the method and not just the output:

| Pass | The question |
| --- | --- |
| What did we miss? | What falls outside the guideword grid — chemistry, materials, operating modes, human interactions, node boundaries |
| Challenge the safeguards | What does each credited safeguard silently depend on |
| Find the common causes | What single failure defeats more than one safeguard at once |
| Trace the escalation | What the first consequence sets off next on this site |
| Are the actions closeable? | Could somebody close this, and could somebody else check it |
| Build the case for doing the work | The argument a plant manager needs for the first package |

A pass returns findings, never writes. Each finding carries the specific
project fact it rests on, an honest confidence, and optionally a proposed
record the engineer accepts one at a time. The missing-deviation pass is given
the guideword engine's own uncovered list as the floor and told not to repeat
it — the engine owns the worksheet's structure, so a proposed deviation becomes
a data gap for the facilitator rather than a worksheet row.
