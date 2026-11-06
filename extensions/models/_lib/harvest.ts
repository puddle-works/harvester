/**
 * The harvesting stage rules: what each stage of Matthew Skelton's diagram
 * needs before an extension may move on, and which registry facts those rules
 * read. Pure functions only, so the rules are testable without swamp.
 *
 * Node 6 has no legend in the diagram. Here it means "marked core" (the
 * extension carries the {@link CORE_LABEL} label), and the loop returns to 0.
 * That reading is an assumption, not Skelton's.
 *
 * @module
 */

/** A stage of the harvesting diagram (0 to 6). */
export type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The registry label that marks an extension as core. A person adds it. */
export const CORE_LABEL = "harvest-core";

/** The quality score (percent) an extension needs to leave stage 2. */
export const MIN_SCORE = 80;

/** Display names, indexed by stage. */
export const STAGE_NAMES: readonly string[] = [
  "Call for capabilities",
  "Candidate",
  "Value proposition",
  "Showcase",
  "Stewardship",
  "Collaboration",
  "Marked core (assumed)",
];

/** The registry facts the rules read. Nothing about people is kept here. */
export interface RegistryFacts {
  latestVersion: string | null;
  labels: string[];
  license: string | null;
  repositoryVerified: boolean;
  scorePercentage: number | null;
  pullCount: number;
}

/** One saved pull-count reading. */
export interface Reading {
  at: string;
  pullCount: number;
  /** The stage the extension was at when the reading was taken. */
  stage: Stage;
}

/** One move between stages. */
export interface Move {
  from: Stage;
  to: Stage;
  at: string;
  note: string;
}

/** Everything tracked about one extension. */
export interface Candidate {
  extension: string;
  stage: Stage;
  /** Starts at 1; stage 6 looping back to 0 begins the next cycle. */
  cycle: number;
  trackedAt: string;
  stageEnteredAt: string;
  steward: string | null;
  requestRef: string | null;
  valueStatement: string | null;
  showcases: { where: string; at: string }[];
  negotiationNotes: string | null;
  decision: string | null;
  credit: string | null;
  /** The pull count when stage 5 began, for the before/after comparison. */
  baselinePulls: number | null;
  readings: Reading[];
  history: Move[];
  /** Facts from the latest reading. */
  facts: RegistryFacts | null;
}

/** The fields a person may set with {@link record}. */
export type Evidence = Partial<
  {
    requestRef: string;
    steward: string;
    valueStatement: string;
    negotiationNotes: string;
    decision: string;
    credit: string;
    /** Where it was shown. Adds to the list rather than replacing it. */
    showcase: string;
  }
>;

const NAME = /^@([a-z0-9][a-z0-9_-]*)\/([^/\s]+)$/i;

/** The collective part of `@collective/name`. */
export function collectiveOf(extension: string): string {
  const match = NAME.exec(extension);
  if (!match) {
    throw new Error(
      `'${extension}' is not an @collective/name extension name.`,
    );
  }
  return match[1].toLowerCase();
}

/** Refuse an extension outside the runner's own collectives. */
export function assertOwnCollective(
  extension: string,
  collectives: string[],
): void {
  const collective = collectiveOf(extension);
  if (!collectives.map((c) => c.toLowerCase()).includes(collective)) {
    throw new Error(
      `@${collective} is not one of your collectives (${
        collectives.map((c) => `@${c}`).join(", ") || "none"
      }), so ${extension} cannot be tracked.`,
    );
  }
}

/** Start tracking an extension at stage 0 or 1. */
export function newCandidate(
  extension: string,
  stage: Stage = 1,
  now: string = new Date().toISOString(),
): Candidate {
  collectiveOf(extension);
  if (stage !== 0 && stage !== 1) {
    throw new Error("Tracking starts at stage 0 or 1.");
  }
  return {
    extension,
    stage,
    cycle: 1,
    trackedAt: now,
    stageEnteredAt: now,
    steward: null,
    requestRef: null,
    valueStatement: null,
    showcases: [],
    negotiationNotes: null,
    decision: null,
    credit: null,
    baselinePulls: null,
    readings: [],
    history: [],
    facts: null,
  };
}

/** Save a pull-count reading and the facts that came with it. */
export function addReading(
  candidate: Candidate,
  facts: RegistryFacts,
  now: string = new Date().toISOString(),
): Candidate {
  return {
    ...candidate,
    facts,
    readings: [...candidate.readings, {
      at: now,
      pullCount: facts.pullCount,
      stage: candidate.stage,
    }],
  };
}

/** Whether a reading was already taken on the UTC day of `now`. */
export function readToday(candidate: Candidate, now: string): boolean {
  const day = now.slice(0, 10);
  return candidate.readings.some((r) => r.at.slice(0, 10) === day);
}

const TEXT_FIELDS = [
  "requestRef",
  "steward",
  "valueStatement",
  "negotiationNotes",
  "decision",
  "credit",
] as const;

/** Set the evidence a person supplies. Empty values are refused. */
export function record(
  candidate: Candidate,
  evidence: Evidence,
  now: string = new Date().toISOString(),
): Candidate {
  const next = { ...candidate };
  for (const [key, value] of Object.entries(evidence)) {
    if (value === undefined) continue;
    const known = key === "showcase" ||
      (TEXT_FIELDS as readonly string[]).includes(key);
    if (!known) throw new Error(`Unknown field '${key}'.`);
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`'${key}' must not be empty.`);
    }
    if (key === "showcase") {
      next.showcases = [...next.showcases, { where: value.trim(), at: now }];
    } else {
      (next as Record<string, unknown>)[key] = value.trim();
    }
  }
  return next;
}

function nextStage(stage: Stage): Stage {
  return stage === 6 ? 0 : (stage + 1) as Stage;
}

/** What stops the candidate moving to `to`. Empty means it may move. */
export function blockers(candidate: Candidate, to: Stage): string[] {
  const c = candidate;
  const out: string[] = [];
  const facts = c.facts;
  if (to !== nextStage(c.stage)) return out;
  switch (c.stage) {
    case 0:
      if (!c.requestRef) {
        out.push("Link the Lab feature request (requestRef).");
      }
      break;
    case 1: {
      if (c.readings.length < 2) {
        out.push("Take at least two readings to see pull growth.");
      } else if (
        c.readings[c.readings.length - 1].pullCount <=
          c.readings[0].pullCount
      ) {
        out.push("Pulls have not grown between the readings.");
      }
      break;
    }
    case 2:
      if (!facts) {
        out.push("Take a reading so the registry facts are known.");
      } else {
        if (!facts.license) out.push("Add a licence to the extension.");
        if (!facts.repositoryVerified) {
          out.push("Verify the extension's repository.");
        }
        if ((facts.scorePercentage ?? 0) < MIN_SCORE) {
          out.push(
            `Raise the quality score to ${MIN_SCORE} or more (now ${
              facts.scorePercentage ?? "unknown"
            }).`,
          );
        }
      }
      if (!c.valueStatement) {
        out.push("Write the value statement (valueStatement).");
      }
      break;
    case 3:
      if (c.showcases.length === 0) {
        out.push("Record where it was shown (showcase).");
      }
      if (!c.steward) out.push("Name the steward (steward).");
      break;
    case 4:
      if (!c.negotiationNotes) {
        out.push("Record the negotiation notes (negotiationNotes).");
      }
      if (!c.decision) {
        out.push("Record the stewardship decision (decision).");
      }
      if (c.readings.length === 0) {
        out.push("Take a reading to be the 'before' pull count.");
      }
      break;
    case 5:
      if (!c.credit) out.push("Credit the original author (credit).");
      if (!facts?.labels.includes(CORE_LABEL)) {
        out.push(
          `Add the '${CORE_LABEL}' label to the extension and publish it.`,
        );
      }
      if (
        !c.readings.some((r) => r.stage === 5 && r.at > c.stageEnteredAt)
      ) {
        out.push(
          "Take a reading after entering stage 5 for the 'after' pull count.",
        );
      }
      break;
    case 6:
      break;
  }
  return out;
}

/** Move to the next stage (6 loops to 0), or throw saying what blocks it. */
export function advance(
  candidate: Candidate,
  to: Stage,
  note: string,
  now: string = new Date().toISOString(),
): Candidate {
  if (to !== nextStage(candidate.stage)) {
    throw new Error(
      `Stage ${candidate.stage} moves only to the next stage, ${
        nextStage(candidate.stage)
      }.`,
    );
  }
  const stops = blockers(candidate, to);
  if (stops.length > 0) {
    throw new Error(
      `${candidate.extension} cannot move to stage ${to}:\n- ${
        stops.join("\n- ")
      }`,
    );
  }
  const moved: Candidate = {
    ...candidate,
    stage: to,
    stageEnteredAt: now,
    history: [...candidate.history, {
      from: candidate.stage,
      to,
      at: now,
      note,
    }],
  };
  if (to === 5) {
    moved.baselinePulls = candidate.readings.at(-1)?.pullCount ?? null;
  }
  if (candidate.stage === 6) {
    return {
      ...moved,
      cycle: candidate.cycle + 1,
      requestRef: null,
      valueStatement: null,
      showcases: [],
      negotiationNotes: null,
      decision: null,
      credit: null,
      baselinePulls: null,
    };
  }
  return moved;
}

/** Things worth a person's attention that are not blockers. */
export function flags(candidate: Candidate): string[] {
  const out: string[] = [];
  const labels = candidate.facts?.labels;
  if (labels?.includes(CORE_LABEL) && !candidate.decision) {
    out.push(
      `Has the '${CORE_LABEL}' label but no stewardship decision is recorded.`,
    );
  }
  if (candidate.stage === 6 && labels && !labels.includes(CORE_LABEL)) {
    out.push(`At stage 6 but the '${CORE_LABEL}' label is missing.`);
  }
  return out;
}

/** Pick the facts the rules need out of `swamp extension info --json`. */
export function parseInfo(info: Record<string, unknown>): RegistryFacts {
  if (typeof info.pullCount !== "number") {
    throw new Error("Registry output has no numeric pullCount.");
  }
  const score = info.score as { percentage?: unknown } | null | undefined;
  return {
    latestVersion: typeof info.latestVersion === "string"
      ? info.latestVersion
      : null,
    labels: Array.isArray(info.labels)
      ? info.labels.filter((l): l is string => typeof l === "string")
      : [],
    license: typeof info.license === "string" ? info.license : null,
    repositoryVerified: info.repositoryVerified === true,
    scorePercentage: typeof score?.percentage === "number"
      ? score.percentage
      : null,
    pullCount: info.pullCount,
  };
}

/** Pick the username and collectives out of `swamp auth whoami --json`. */
export function parseWhoami(
  who: Record<string, unknown>,
): { username: string; collectives: string[] } {
  if (typeof who.username !== "string") {
    throw new Error("Not signed in: run `swamp auth login`.");
  }
  return {
    username: who.username,
    collectives: Array.isArray(who.collectives)
      ? who.collectives.filter((c): c is string => typeof c === "string")
      : [],
  };
}
