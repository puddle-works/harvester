# harvester

A swamp extension implementing the activities in Matthew Skelton's harvesting
diagram (Team Topologies, Conflux 2024). It records evidence of useful work,
buyer interest, negotiation, inspection and collaboration, each party's own
agreement, and explicit decisions to defer, decline, adopt or retire. A person
decides every move: Harvester never deprecates, transfers, publishes, contacts
anyone or requires teams to use an offering.

The source is the harvesting diagram on printed page 69 of the
[ProductTank Auckland slides][slides]. The [talk][talk] describes how
re-commoning "fertilises new products" at 52:18, negotiation, inspection and
"shaking hands" at 54:22, the platform's choice to adopt at 56:03, consumers'
independent choice to use it at 56:36, technology expected "to disappear in a
short space of time" at 58:43, and active knowledge diffusion at 1:00:55.
The evidence fields below are this implementation's way of recording those
activities, not a checklist prescribed by Skelton.

## Stages

| Stage | Name | Evidence |
| --- | --- | --- |
| 0 | Call for capabilities | A call opened with `openCall`: the need, the platform asking and, with `ref`, where it is posted. It needs no candidate, and several candidates may answer it. With `follows`, it names the adopted capability that made it possible. |
| 1 | Candidate | Found by answering a call or by looking without one. `discoveryNotes`: source team, how it was found, follow-up owner/action. `flowEvidence`: a demonstrated improvement to flow or reduced effort. |
| 2 | Value proposition | `valueStatement`: wider value, beneficiaries, incentives to share, stewardship costs and how to assess benefit. |
| 3 | Showcase | A `showcase` record and `interest` from prospective consumers or platforms, with their feedback. A steward need not be agreed yet. |
| 4 | Negotiate stewardship | Named `platform` and `steward`, `negotiationNotes`, `inspectionNotes` saying what the platform inspected and found, and `collaborationAgreement` giving the terms of a trial: scope and care responsibilities. Then the handshake: `agree to=collaboration` once for the platform and once for the original grouping. |
| 5 | Collaboration and possible adoption | `collaborationNotes` covering trial feedback and the originating team's needs. Adoption additionally requires `adoptionAgreement` giving the terms, `agree to=adoption` from both parties, `credit` recording the value recognised and attributing it back to the original grouping, and `offeringRef` linking a usable offering, documentation and support. |
| 6 | Re-commoned (local interpretation) | An explicit adoption decision has been recorded. Use `reuseNotes` to review voluntary uptake, feedback and outcomes, including no uptake. Open the calls it makes possible with `openCall follows=`, and retire it when the platform stops offering it. |

The diagram does not define node 6. This implementation uses it to record an
agreed adoption and shared offering; it does not claim that Skelton defined
"re-commoned" as stage 6.

The diagram's arrows run 5→6→0: the Platform Innovation Cycle. An adopted
capability "fertilises new products" (52:18), so the arrow back to 0 is a new
call that follows from it, not the same capability starting again.
`openCall follows=@collective/name` records the link, and the report lists under
each adopted capability the calls it led to. The adopted capability keeps its
agreement, attribution and history.

## Inspection and the handshake

"There's a bit of negotiation and the platform inspects it, we shake hands over
it" (54:22). Harvester records each of the three separately.

`inspectionNotes` records what the platform inspected and found. It is needed
before a trial and before adoption. Harvester stores which readiness concerns
(licence, repository verification, quality score) the registry showed at that
moment. A concern that was in view stays advice, because a person has judged it;
a concern that appears later asks for a new inspection.

An agreement is terms plus each party's own consent. `collaborationAgreement`
and `adoptionAgreement` hold the terms. `agree` records that one party, `platform`
or `source` (the original grouping), agrees to them, with the team or role that
agreed and when. Both parties must agree, the trial and the adoption are agreed
separately, and changing the terms clears the consent given to the old ones.
Once a capability is adopted, the two agreements and `credit` cannot be
rewritten.

These are evidence records, not electronic signatures. Harvester checks that
each party's consent is recorded; it cannot check who typed it. A person must
verify that the named party did agree.

## Calls and candidates

A platform opens a call before any candidate exists: "has anyone got anything in
this area?" (54:08). `openCall` records it, `track ... call=<id>` or `answerCall`
links each candidate that answers, and `closeCall` closes it with a reason. The
report lists every open call and marks the ones nobody answers yet.

A candidate does not need a call. Skelton's cycle can start anywhere (51:49), so
`track` starts a candidate at stage 1. Stage 0 on a candidate remains for older
records: it moves on once the candidate answers a call or links one kept
elsewhere with `requestRef`.

A candidate may come from any collective. Skelton's platform harvests "a service
from outside the platform" (56:03), so the platform that found a capability can
track it without owning it. Tracking is a private note: Harvester tells nobody,
and the source team decides nothing by being tracked.

## Decisions and optional use

Stage describes the activity; `outcome` is `active`, `deferred`, `declined`,
`adopted` or `retired`. Use `decide` with a reason to defer or decline at any
pre-adoption stage. These are legitimate outcomes, not missing evidence. The current owner
retains care. Resume with `outcome=active` and a reason; earlier evidence and the
decision history remain available.

Use `decide` with `outcome=adopted` at stage 5 once the inspection, both
handshakes, the attribution and the offering are recorded. It records stage 6. Neither `record decision=...` nor a
registry label constitutes an adoption decision. `advance` handles activities
0–5 only; it cannot adopt or reset stage 6.

Platform adoption does not mandate consumer uptake. Record consumer experience
separately in `reuseNotes`; a download count does not establish voluntary use or
value. A narrow mandatory-use exception, such as security, needs its own
justification and usability review. Adoption may mean supporting an integration
while upstream maintenance stays with the source team; spell this out in the
agreement. No automatic ownership transfer occurs.

Adoption is not permanent. Technology should be expected "to disappear in a
short space of time" (58:43), so a platform curates what it offers. Use `decide`
with `outcome=retired` and a reason when the platform stops offering an adopted
capability. The record stays at stage 6 with its agreement, attribution and
history; nothing is deprecated or transferred in the registry. A retired record
takes no further decision: offering the capability again is a new negotiation.

## Core

`harvest-core` is optional published classification, not a harvesting gate.
Harvester flags the label if no explicit adoption is recorded. No new label or
collective is needed to nominate, defer, decline or adopt a capability. The
`platform` field identifies which platform is adopting it; core is not
necessarily organization-wide.

Licence, repository verification and a quality score of 80 are retained as local
readiness guidance, separate from Skelton's stages. Missing checks are reported
for human review, not used as proof of value or automatic harvesting blockers.
Review legal and operational readiness before a trial or adoption. Pull readings
remain supporting context; growth is never required to move on.

## Use

Harvester reads the registry by running `swamp extension info` as a subprocess,
so `swamp` must be on your `PATH`. Extension names must match `@collective/name`
before they are passed to it. No email or name is stored.

Pull the extension and create its model once:

```sh
swamp extension pull @puddleworks/harvester
swamp model create @puddleworks/harvester harvester
```

Then open calls, track extensions, record evidence and move them on:

```sh
swamp model method run harvester openCall --input id=onboarding --input need="Quicker onboarding for new services" --input platform="developer platform"
swamp model method run harvester track --input extension=@acme/tool --input call=onboarding
swamp model method run harvester record --input extension=@acme/tool --input steward=platform-team
swamp model method run harvester advance --input extension=@acme/tool --input to=2 --input note="why"
swamp model method run harvester record --input extension=@acme/tool --input inspectionNotes="Read the code and docs; licence is MIT" --input collaborationAgreement="Two-team trial; source team keeps care"
swamp model method run harvester agree --input extension=@acme/tool --input to=collaboration --input party=platform --input by=platform-team
swamp model method run harvester agree --input extension=@acme/tool --input to=collaboration --input party=source --input by="payments team"
swamp model method run harvester decide --input extension=@acme/tool --input outcome=deferred --input note="No support capacity yet"
swamp model method run harvester decide --input extension=@acme/tool --input outcome=active --input note="Capacity now available"
swamp model method run harvester decide --input extension=@acme/tool --input outcome=adopted --input note="Both teams approved the supported offering"
swamp model method run harvester closeCall --input id=onboarding --input note="Answered by @acme/tool"
swamp model method run harvester openCall --input id=audit --input need="Audit trail from onboarding events" --input platform="data platform" --input follows=@acme/tool
swamp model method run harvester decide --input extension=@acme/tool --input outcome=retired --input note="Superseded by the registry's own onboarding"
swamp model method run harvester untrack --input extension=@acme/tool   # older stored versions keep its history
swamp workflow run @puddleworks/harvester-weekly   # weekly: refresh, then report
```

The commands illustrate separate actions, not a complete walkthrough: record
the table's evidence before advancing or adopting. The steward has no default;
it must be agreed before leaving stage 4.

`report` writes two files: a markdown report and an HTML page with a stage track
per extension. Ready means the evidence supports the next activity or decision,
not an obligation to adopt. Deferred, declined, adopted and retired records are
shown separately from candidates waiting for evidence.

A second `refresh` on the same UTC day adds no reading, so a rerun is safe.

## Reaching an owner

Open an issue on the extension's repository, or post in the Lab. Do not collect
profile emails.

## Limits

This is a tracker for calls and nominated extensions, not a registry-wide
harvesting programme. A person finds each candidate and tracks it:
`discoveryNotes` connects nominations to conferences, communities and outreach,
but Harvester does not conduct those activities, search the registry or enrol
search results. That boundary is an implementation limit, not a rule from
Skelton, who asks for "a more directed approach to discovering what's out there"
(1:12:57). The weekly report marks each open call nobody answers, and the
looking is left to a person. Harvester posts a call nowhere; `ref` links where
a person posted it.
No collective membership or publishing authority is changed.

The registry keeps only a lifetime `pullCount`, so trends come from the weekly
readings and cannot be backfilled. Every swamp command needs an account.

## Existing records

New evidence fields default to empty on read, and records stored before calls
existed load with no calls; existing evidence, readings and history are
preserved. Old free-text decisions and core labels are not converted
into adoption, and no old text becomes an inspection or either party's consent.
A record that reached stage 5 under earlier rules needs `inspectionNotes` and
both parties' `agree to=collaboration` before it can be adopted; the report
lists them. Old stage-6 records show "Review adoption": review and record the
inspection, agreements and offering evidence, then use `decide outcome=adopted`. Historical
cycle numbers remain stored, but stage 6 no longer increments them or resets
evidence. No previously erased cycle evidence can be reconstructed by this change.

[slides]: https://speakerdeck.com/matthewskelton/platform-engineering-done-well-innovation-efficiency-market-advantage-matthew-skelton-producttank-auckland
[talk]: https://www.youtube.com/watch?v=BFCe-198Iig
