/**
 * The harvesting stage rules: what each stage of Matthew Skelton's diagram
 * needs before an extension may move on, and which registry facts those rules
 * read. Pure functions only, so the rules are testable without swamp.
 *
 * Node 6 has no legend in the diagram. Here it records an agreed adoption
 * and a usable shared offering. This is a local interpretation, not Skelton's
 * stage definition. New discovery does not reset an adopted capability.
 *
 * @module
 */

/** A stage of the harvesting diagram (0 to 6). */
export type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A harvesting decision, independent of the activity stage. */
export type Outcome = "active" | "deferred" | "declined" | "adopted";

/** Optional registry classification; never evidence of an agreement. */
export const CORE_LABEL = "harvest-core";

/** Local readiness guidance, not a harvesting gate from Skelton's diagram. */
export const MIN_SCORE = 80;

/** Display names, indexed by stage. */
export const STAGE_NAMES: readonly string[] = [
  "Call for capabilities",
  "Candidate",
  "Value proposition",
  "Showcase",
  "Stewardship",
  "Collaboration and possible adoption",
  "Re-commoned (local interpretation)",
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
  /** Historical cycle number; retained for existing records. */
  cycle: number;
  outcome: Outcome;
  decisions: { outcome: Outcome; note: string; at: string }[];
  trackedAt: string;
  stageEnteredAt: string;
  steward: string | null;
  platform: string | null;
  requestRef: string | null;
  discoveryNotes: string | null;
  flowEvidence: string | null;
  valueStatement: string | null;
  showcases: { where: string; at: string }[];
  interest: string | null;
  negotiationNotes: string | null;
  collaborationAgreement: string | null;
  collaborationNotes: string | null;
  adoptionAgreement: string | null;
  offeringRef: string | null;
  reuseNotes: string | null;
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
    platform: string;
    discoveryNotes: string;
    flowEvidence: string;
    valueStatement: string;
    interest: string;
    negotiationNotes: string;
    collaborationAgreement: string;
    collaborationNotes: string;
    adoptionAgreement: string;
    offeringRef: string;
    reuseNotes: string;
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
    outcome: "active",
    decisions: [],
    trackedAt: now,
    stageEnteredAt: now,
    steward: null,
    platform: null,
    requestRef: null,
    discoveryNotes: null,
    flowEvidence: null,
    valueStatement: null,
    showcases: [],
    interest: null,
    negotiationNotes: null,
    collaborationAgreement: null,
    collaborationNotes: null,
    adoptionAgreement: null,
    offeringRef: null,
    reuseNotes: null,
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
  "platform",
  "discoveryNotes",
  "flowEvidence",
  "valueStatement",
  "interest",
  "negotiationNotes",
  "collaborationAgreement",
  "collaborationNotes",
  "adoptionAgreement",
  "offeringRef",
  "reuseNotes",
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

function adoptionBlockers(c: Candidate): string[] {
  const out: string[] = [];
  if (!c.platform) out.push("Name the adopting platform (platform).");
  if (!c.steward) out.push("Name the steward (steward).");
  if (!c.negotiationNotes) {
    out.push("Record the negotiation notes (negotiationNotes).");
  }
  if (!c.collaborationAgreement) {
    out.push(
      "Record both parties' agreement to collaborate (collaborationAgreement).",
    );
  }
  if (!c.collaborationNotes) {
    out.push(
      "Record trial feedback and the originating team's needs (collaborationNotes).",
    );
  }
  if (!c.adoptionAgreement) {
    out.push(
      "Record both parties' adoption agreement and responsibilities (adoptionAgreement).",
    );
  }
  if (!c.credit) out.push("Credit the original author (credit).");
  if (!c.offeringRef) {
    out.push(
      "Link the usable offering, documentation and support route (offeringRef).",
    );
  }
  return out;
}

/** What stops the candidate moving to `to`. Empty means it may move. */
export function blockers(candidate: Candidate, to: Stage): string[] {
  const c = candidate;
  const out: string[] = [];
  if (c.outcome === "deferred" || c.outcome === "declined") {
    return [
      `${c.outcome}: use decide with outcome=active and a reason to resume.`,
    ];
  }
  if (c.stage === 6) {
    return [
      "Stage 6 does not restart; keep the agreement and record reuseNotes.",
    ];
  }
  if (to !== c.stage + 1) return ["Move only to the next stage."];
  switch (c.stage) {
    case 0:
      if (!c.requestRef) {
        out.push(
          "Link the call for capabilities and intended users (requestRef).",
        );
      }
      break;
    case 1:
      if (!c.discoveryNotes) {
        out.push(
          "Record the source team, discovery source and follow-up (discoveryNotes).",
        );
      }
      if (!c.flowEvidence) {
        out.push("Record a demonstrated improvement to flow (flowEvidence).");
      }
      break;
    case 2:
      if (!c.valueStatement) {
        out.push(
          "Describe wider value, beneficiaries and incentives to share (valueStatement).",
        );
      }
      break;
    case 3:
      if (c.showcases.length === 0) {
        out.push("Record where it was shown (showcase).");
      }
      if (!c.interest) {
        out.push("Record prospective buyers and their feedback (interest).");
      }
      break;
    case 4:
      if (!c.platform) out.push("Name the adopting platform (platform).");
      if (!c.steward) out.push("Name the steward (steward).");
      if (!c.negotiationNotes) {
        out.push("Record the negotiation notes (negotiationNotes).");
      }
      if (!c.collaborationAgreement) {
        out.push(
          "Record both parties' agreement to collaborate (collaborationAgreement).",
        );
      }
      break;
    case 5:
      out.push(...adoptionBlockers(c));
      break;
  }
  return out;
}

/** Move through activities 0–5; adoption is an explicit decision, not a label. */
export function advance(
  candidate: Candidate,
  to: Stage,
  note: string,
  now: string = new Date().toISOString(),
): Candidate {
  if (candidate.stage === 6 || to !== candidate.stage + 1) {
    throw new Error(
      "Move only to the next stage; stage 6 never resets an adoption.",
    );
  }
  if (to === 6) {
    throw new Error("Use decide with outcome=adopted and a reason to adopt.");
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
  return moved;
}

/** Defer, decline, resume or adopt without discarding evidence or ownership. */
export function decide(
  candidate: Candidate,
  outcome: Outcome,
  note: string,
  now: string = new Date().toISOString(),
): Candidate {
  if (!["active", "deferred", "declined", "adopted"].includes(outcome)) {
    throw new Error("Unknown harvesting outcome.");
  }
  if (!note.trim()) throw new Error("A decision needs a reason.");
  if (candidate.outcome === "adopted") {
    throw new Error("Keep the adoption agreement; record reuseNotes instead.");
  }
  if (outcome === "adopted") {
    if (candidate.outcome !== "active" || candidate.stage < 5) {
      throw new Error(
        "Adoption needs an active candidate at stage 5 (or legacy stage 6).",
      );
    }
    const stops = adoptionBlockers(candidate);
    if (stops.length > 0) {
      throw new Error(`Cannot adopt:\n- ${stops.join("\n- ")}`);
    }
  }
  const adopting = outcome === "adopted" && candidate.stage === 5;
  return {
    ...candidate,
    outcome,
    decision: note.trim(),
    decisions: [...candidate.decisions, {
      outcome,
      note: note.trim(),
      at: now,
    }],
    stage: adopting ? 6 : candidate.stage,
    stageEnteredAt: adopting ? now : candidate.stageEnteredAt,
    history: adopting
      ? [...candidate.history, { from: 5, to: 6, at: now, note: note.trim() }]
      : candidate.history,
  };
}

/** Things worth a person's attention that are not blockers. */
export function flags(candidate: Candidate): string[] {
  const out: string[] = [];
  const facts = candidate.facts;
  if (facts?.labels.includes(CORE_LABEL) && candidate.outcome !== "adopted") {
    out.push(
      `Has the '${CORE_LABEL}' label but no explicit adoption is recorded.`,
    );
  }
  if (candidate.stage === 6 && candidate.outcome !== "adopted") {
    out.push(
      "Legacy stage 6: review the agreement before recording adoption with decide.",
    );
  }
  if (facts) {
    if (!facts.license) {
      out.push("Readiness: review the missing licence before reuse.");
    }
    if (!facts.repositoryVerified) {
      out.push("Readiness: the repository is not verified.");
    }
    if ((facts.scorePercentage ?? 0) < MIN_SCORE) {
      out.push(
        `Readiness: quality score is below the local guideline of ${MIN_SCORE}.`,
      );
    }
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
