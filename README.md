# harvester

A swamp extension implementing the activities in Matthew Skelton's harvesting
diagram (Team Topologies, Conflux 2024). It records evidence of useful work,
buyer interest, negotiation and collaboration, with explicit decisions to defer,
decline or adopt. A person decides every move: Harvester never deprecates,
transfers, publishes, contacts anyone or requires teams to use an offering.

The source is the harvesting diagram on printed page 69 of the
[ProductTank Auckland slides][slides]. The [talk][talk] describes negotiation
and "shaking hands" at 54:22, the platform's choice to adopt at 56:03, consumers'
independent choice to use it at 56:36, and active knowledge diffusion at 1:00:55.
The evidence fields below are this implementation's way of recording those
activities, not a checklist prescribed by Skelton.

## Stages

| Stage | Name | Evidence |
| --- | --- | --- |
| 0 | Call for capabilities | A platform posts a call with `call`, before any extension exists. A tracked extension moves on once it `answer`s an open call, or links an outside request in `requestRef`. |
| 1 | Candidate | `discoveryNotes`: source team, how it was found, follow-up owner/action. `flowEvidence`: a demonstrated improvement to flow or reduced effort. |
| 2 | Value proposition | `valueStatement`: wider value, beneficiaries, incentives to share, stewardship costs and how to assess benefit. |
| 3 | Showcase | A `showcase` record and `interest` from prospective consumers or platforms, with their feedback. A steward need not be agreed yet. |
| 4 | Negotiate stewardship | Named `platform` and `steward`, `negotiationNotes`, and `collaborationAgreement` recording both parties' agreement to scope and care responsibilities during a trial. |
| 5 | Collaboration and possible adoption | `collaborationNotes` covering trial feedback and the originating team's needs. Adoption additionally requires `adoptionAgreement` from both parties, agreed stewardship, `credit`, and `offeringRef` linking a usable offering, documentation and support. |
| 6 | Re-commoned (local interpretation) | An explicit adoption decision has been recorded. Use `reuseNotes` to review voluntary uptake, feedback and outcomes, including no uptake. |

The diagram does not define node 6. This implementation uses it to record an
agreed adoption and shared offering; it does not claim that Skelton defined
"re-commoned" as stage 6. The innovation cycle leads to new calls and candidates,
not to erasing an adopted capability's agreement, attribution and history.

These are evidence records, not electronic signatures. Harvester checks that
the records exist; a person must verify their content and both parties' consent.

## Decisions and optional use

Stage describes the activity; `outcome` is `active`, `deferred`, `declined` or
`adopted`. Use `decide` with a reason to defer or decline at any pre-adoption
stage. These are legitimate outcomes, not missing evidence. The current owner
retains care. Resume with `outcome=active` and a reason; earlier evidence and the
decision history remain available.

Use `decide` with `outcome=adopted` at stage 5 once the agreement and offering
evidence are present. It records stage 6. Neither `record decision=...` nor a
registry label constitutes an adoption decision. `advance` handles activities
0–5 only; it cannot adopt or reset stage 6.

Platform adoption does not mandate consumer uptake. Record consumer experience
separately in `reuseNotes`; a download count does not establish voluntary use or
value. A narrow mandatory-use exception, such as security, needs its own
justification and usability review. Adoption may mean supporting an integration
while upstream maintenance stays with the source team; spell this out in the
agreement. No automatic ownership transfer occurs.

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

Only extensions in your own collectives can be tracked (checked against
`swamp auth whoami`). Only the username and collectives are read from your
account; no email or name is stored. A collective token works too: it has no
username, so its own collective is used.

Harvester reads the registry by running `swamp auth whoami` and
`swamp extension info` as subprocesses, so `swamp` must be on your `PATH`. Those
are the only commands it runs, and extension names must match `@collective/name`
before they are passed to one.

Pull the extension and create its model once:

```sh
swamp extension pull @puddleworks/harvester
swamp model create @puddleworks/harvester harvester
```

Then track extensions, record evidence and move them on:

```sh
swamp model method run harvester call --input id=fast-onboarding --input need="Onboard a new team in a day" --input platform="Developer platform"
swamp model method run harvester track --input extension=@acme/tool --input stage=0
swamp model method run harvester answer --input extension=@acme/tool --input call=fast-onboarding
swamp model method run harvester record --input extension=@acme/tool --input steward=platform-team
swamp model method run harvester advance --input extension=@acme/tool --input to=2 --input note="why"
swamp model method run harvester decide --input extension=@acme/tool --input outcome=deferred --input note="No support capacity yet"
swamp model method run harvester decide --input extension=@acme/tool --input outcome=active --input note="Capacity now available"
swamp model method run harvester decide --input extension=@acme/tool --input outcome=adopted --input note="Both teams approved the supported offering"
swamp model method run harvester closeCall --input id=fast-onboarding --input note="Met by @acme/tool"
swamp model method run harvester untrack --input extension=@acme/tool   # older stored versions keep its history
swamp workflow run @puddleworks/harvester-weekly   # weekly: refresh, then report
```

The commands illustrate separate actions, not a complete walkthrough: record
the table's evidence before advancing or adopting. The steward has no default;
it must be agreed before leaving stage 4.

`report` writes two files: a markdown report and an HTML page with the calls for
capabilities and a stage track per extension. Ready means the evidence supports
the next activity or decision, not an obligation to adopt. Deferred, declined
and adopted records are shown separately from candidates waiting for evidence.

A second `refresh` on the same UTC day adds no reading, so a rerun is safe.

## Reaching an owner

Open an issue on the extension's repository, or post in the Lab. Do not collect
profile emails.

## Limits

This remains a tracker for nominated extensions in your own collectives, not a
registry-wide harvesting programme. Calls need no extension, and the report
lists open calls nobody has answered yet. A call cannot be edited or reopened:
close it with a reason and post a new one. A recorded adoption cannot be
withdrawn. Leads in other collectives are not tracked; record them in a call or
in the Lab.
`discoveryNotes` connects nominations to conferences, communities and outreach;
Harvester does not conduct those activities or automatically enrol search results.
Those discovery and ownership boundaries are implementation limits, not rules
from Skelton. No collective membership or publishing authority is changed.

The registry keeps only a lifetime `pullCount`, so trends come from the weekly
readings and cannot be backfilled. Every swamp command needs an account.

## Existing records

New evidence fields default to empty on read; existing evidence, readings and
history are preserved. Old free-text decisions and core labels are not converted
into adoption. Old stage-6 records show "Review adoption": review and record the
agreement and offering evidence, then use `decide outcome=adopted`. Historical
cycle numbers remain stored, but stage 6 no longer increments them or resets
evidence. No previously erased cycle evidence can be reconstructed by this change.

[slides]: https://speakerdeck.com/matthewskelton/platform-engineering-done-well-innovation-efficiency-market-advantage-matthew-skelton-producttank-auckland
[talk]: https://www.youtube.com/watch?v=BFCe-198Iig
