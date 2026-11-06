# harvester

A swamp extension that moves extensions through the stages of Matthew Skelton's
harvesting diagram (Team Topologies, Conflux 2024). It records the evidence each
stage needs, takes weekly pull-count readings of the extensions you track, and
reports what blocks each one. A person decides every move: Harvester never
deprecates, transfers or contacts anyone.

## Stages

| Stage | Name | To move on |
| --- | --- | --- |
| 0 | Call for capabilities | Link the Lab feature request (`requestRef`). |
| 1 | Candidate | Two readings showing pulls have grown. |
| 2 | Value proposition | Licence, verified repository, quality score of 80 or more, and a `valueStatement`. |
| 3 | Showcase | A `showcase` record and a named `steward`. |
| 4 | Stewardship | `negotiationNotes`, a `decision`, and a reading as the "before" pull count. |
| 5 | Collaboration | `credit` for the original author, the `harvest-core` label published, and a later reading as the "after" count. |
| 6 | Marked core | Loops back to 0 as a new cycle. |

Stage 6 is an assumption. The diagram does not define node 6; here it means
"marked core, loops back to 0".

## Core

An extension is core when its manifest carries the `harvest-core` label. A
person adds the label. Harvester only reads it, and flags a label with no
recorded stewardship `decision`. Core is not expressed through collectives.

## Use

Only extensions in your own collectives can be tracked (checked against
`swamp auth whoami`). Only the username and collectives are read from your
account; no email or name is stored.

Harvester reads the registry by running `swamp auth whoami` and
`swamp extension info` as subprocesses, so `swamp` must be on your `PATH`. Those
are the only commands it runs, and extension names must match `@collective/name`
before they are passed to one.

```
swamp model create @puddleworks/harvester harvester
swamp model method run harvester track --input extension=@acme/tool
swamp model method run harvester record --input extension=@acme/tool --input steward=platform-team
swamp model method run harvester advance --input extension=@acme/tool --input to=2 --input note="why"
swamp model method run harvester untrack --input extension=@acme/tool   # older stored versions keep its history
swamp workflow run @puddleworks/harvester-weekly   # weekly: refresh, then report
```

The steward is a named team or person with no default; it is required from
stage 4.

A second `refresh` on the same UTC day adds no reading, so a rerun is safe.

## Reaching an owner

Open an issue on the extension's repository, or post in the Lab. Do not collect
profile emails.

## Limits

The registry keeps only a lifetime `pullCount`, so trends come from the weekly
readings and cannot be backfilled. Every swamp command needs an account.
