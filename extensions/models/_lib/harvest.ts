/**
 * The harvesting stage rules: what each stage of Matthew Skelton's diagram
 * needs before an extension may move on, and which registry facts those rules
 * read. Pure functions only, so the rules are testable without swamp.
 *
 * Stage 0 belongs to a call for capabilities, which a platform opens before
 * any candidate exists; candidates answer it or are found without one.
 *
 * Node 6 has no legend in the diagram. Here it records an agreed adoption
 * and a usable shared offering. This is a local interpretation, not Skelton's
 * stage definition. The diagram's 6→0 arrow is a new call that follows from an
 * adopted capability; the adopted capability keeps its own record.
 *
 * @module
 */

/** A stage of the harvesting diagram (0 to 6). */
export type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A harvesting decision, independent of the activity stage. */
export type Outcome =
  | "active"
  | "deferred"
  | "declined"
  | "adopted"
  | "retired";

/** Every outcome, for validation. */
export const OUTCOMES: readonly Outcome[] = [
  "active",
  "deferred",
  "declined",
  "adopted",
  "retired",
];

/** The two sides of the handshake: the platform and the original grouping. */
export type Party = "platform" | "source";

/** What a party agrees to: the trial, then the adoption. */
export type Agreement = "collaboration" | "adoption";

/** One party's agreement to the recorded terms. */
export interface Consent {
  /** The team or role that agreed. */
  by: string;
  at: string;
}

/** Each party's agreement, or null until it is recorded. */
export type Handshake = Record<Party, Consent | null>;

/** What the platform inspected and found before shaking hands. */
export interface Inspection {
  notes: string;
  at: string;
  /** The readiness concerns the registry showed when it was recorded. */
  seen: ReadinessKey[];
}

/** A registry fact worth inspecting before a trial or an adoption. */
export type ReadinessKey = "licence" | "repository" | "score";

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

/**
 * A call for a capability: stage 0 of the diagram. A platform opens it before
 * any candidate exists, and any number of candidates may answer it.
 */
export interface Call {
  id: string;
  need: string;
  /** The platform asking. */
  platform: string;
  /** Where the call is posted, such as a Lab request. */
  ref: string | null;
  openedAt: string;
  closedAt: string | null;
  closeNote: string | null;
  /** The adopted capability this call follows from: the 6→0 arrow. */
  follows: string | null;
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
  /** The call this candidate answers, if it answers one. */
  callId: string | null;
  /** A call kept outside Harvester, for records that predate calls. */
  requestRef: string | null;
  discoveryNotes: string | null;
  flowEvidence: string | null;
  valueStatement: string | null;
  showcases: { where: string; at: string }[];
  interest: string | null;
  negotiationNotes: string | null;
  inspection: Inspection | null;
  /** The terms of the trial; each party agrees to them in `consents`. */
  collaborationAgreement: string | null;
  collaborationNotes: string | null;
  /** The terms of the adoption; each party agrees to them in `consents`. */
  adoptionAgreement: string | null;
  consents: Record<Agreement, Handshake>;
  offeringRef: string | null;
  reuseNotes: string | null;
  decision: string | null;
  /** The value recognised, attributed back to the original grouping. */
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
    /** What the platform inspected and found. Replaces the last inspection. */
    inspectionNotes: string;
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

const CALL_ID = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Open a call for a capability a platform needs. `follows` is the adopted
 * capability that made the call possible, if one did.
 */
export function newCall(
  id: string,
  need: string,
  platform: string,
  ref: string | null = null,
  now: string = new Date().toISOString(),
  follows: Candidate | null = null,
): Call {
  if (
    follows && follows.outcome !== "adopted" && follows.outcome !== "retired"
  ) {
    throw new Error(
      `A call follows an adopted capability: ${follows.extension} is at stage ${follows.stage} (${follows.outcome}).`,
    );
  }
  if (!CALL_ID.test(id)) {
    throw new Error(
      `'${id}' is not a call id: use lower-case letters, digits and hyphens.`,
    );
  }
  if (!need.trim()) throw new Error("A call must say what is needed (need).");
  if (!platform.trim()) {
    throw new Error("A call must name the platform asking (platform).");
  }
  return {
    id,
    need: need.trim(),
    platform: platform.trim(),
    ref: ref?.trim() || null,
    openedAt: now,
    closedAt: null,
    closeNote: null,
    follows: follows?.extension ?? null,
  };
}

/** Close a call, saying why: answered, withdrawn or no longer needed. */
export function closeCall(
  call: Call,
  note: string,
  now: string = new Date().toISOString(),
): Call {
  if (call.closedAt) throw new Error(`Call '${call.id}' is already closed.`);
  if (!note.trim()) throw new Error("Closing a call needs a reason.");
  return { ...call, closedAt: now, closeNote: note.trim() };
}

/** Link a candidate to the open call it answers. */
export function answerCall(candidate: Candidate, call: Call): Candidate {
  if (call.closedAt) throw new Error(`Call '${call.id}' is closed.`);
  if (candidate.callId && candidate.callId !== call.id) {
    throw new Error(
      `${candidate.extension} already answers call '${candidate.callId}'.`,
    );
  }
  return { ...candidate, callId: call.id };
}

/** Nobody has agreed to anything yet. */
export function noConsents(): Record<Agreement, Handshake> {
  return {
    collaboration: { platform: null, source: null },
    adoption: { platform: null, source: null },
  };
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
    callId: null,
    requestRef: null,
    discoveryNotes: null,
    flowEvidence: null,
    valueStatement: null,
    showcases: [],
    interest: null,
    negotiationNotes: null,
    inspection: null,
    collaborationAgreement: null,
    collaborationNotes: null,
    adoptionAgreement: null,
    consents: noConsents(),
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

/** The terms each agreement's consents refer to. */
const TERMS: Record<Agreement, "collaborationAgreement" | "adoptionAgreement"> =
  {
    collaboration: "collaborationAgreement",
    adoption: "adoptionAgreement",
  };

/** What both parties shook hands on; fixed once the capability is adopted. */
const AGREED = ["collaborationAgreement", "adoptionAgreement", "credit"];

/**
 * Set the evidence a person supplies. Empty values are refused. Changing an
 * agreement's terms clears the consents given to the old terms.
 */
export function record(
  candidate: Candidate,
  evidence: Evidence,
  now: string = new Date().toISOString(),
): Candidate {
  const next = { ...candidate };
  const settled = candidate.outcome === "adopted" ||
    candidate.outcome === "retired";
  for (const [key, value] of Object.entries(evidence)) {
    if (value === undefined) continue;
    const known = key === "showcase" || key === "inspectionNotes" ||
      (TEXT_FIELDS as readonly string[]).includes(key);
    if (!known) throw new Error(`Unknown field '${key}'.`);
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`'${key}' must not be empty.`);
    }
    if (settled && AGREED.includes(key)) {
      throw new Error(
        `'${key}' is what both parties agreed when ${candidate.extension} was adopted; it is kept as agreed.`,
      );
    }
    if (key === "showcase") {
      next.showcases = [...next.showcases, { where: value.trim(), at: now }];
    } else if (key === "inspectionNotes") {
      next.inspection = {
        notes: value.trim(),
        at: now,
        seen: readiness(candidate.facts).map((r) => r.key),
      };
    } else {
      for (const agreement of ["collaboration", "adoption"] as const) {
        if (key === TERMS[agreement] && value.trim() !== candidate[key]) {
          next.consents = {
            ...next.consents,
            [agreement]: { platform: null, source: null },
          };
        }
      }
      (next as Record<string, unknown>)[key] = value.trim();
    }
  }
  return next;
}

const PARTY_NAMES: Record<Party, string> = {
  platform: "the platform",
  source: "the original grouping",
};

/**
 * Record one party's agreement to the terms already recorded. The handshake
 * needs both parties, so one party cannot agree for the other.
 */
export function agree(
  candidate: Candidate,
  to: Agreement,
  party: Party,
  by: string,
  now: string = new Date().toISOString(),
): Candidate {
  if (!Object.hasOwn(TERMS, to)) throw new Error("Unknown agreement.");
  if (!Object.hasOwn(PARTY_NAMES, party)) throw new Error("Unknown party.");
  if (!by.trim()) throw new Error("Say which team or role agreed (by).");
  if (candidate.outcome !== "active") {
    throw new Error(
      `${candidate.extension} is ${candidate.outcome}; only an active candidate takes new agreements.`,
    );
  }
  if (!candidate[TERMS[to]]) {
    throw new Error(
      `Record the terms first (${TERMS[to]}); a party agrees to terms.`,
    );
  }
  if (to === "adoption" && candidate.stage < 5) {
    throw new Error(
      "Adoption is agreed after the period of collaboration (stage 5).",
    );
  }
  return {
    ...candidate,
    consents: {
      ...candidate.consents,
      [to]: { ...candidate.consents[to], [party]: { by: by.trim(), at: now } },
    },
  };
}

/** The registry facts a platform should inspect, with the reason for each. */
export function readiness(
  facts: RegistryFacts | null,
): { key: ReadinessKey; text: string }[] {
  if (!facts) return [];
  const out: { key: ReadinessKey; text: string }[] = [];
  if (!facts.license) {
    out.push({
      key: "licence",
      text: "review the missing licence before reuse.",
    });
  }
  if (!facts.repositoryVerified) {
    out.push({ key: "repository", text: "the repository is not verified." });
  }
  if ((facts.scorePercentage ?? 0) < MIN_SCORE) {
    out.push({
      key: "score",
      text: `quality score is below the local guideline of ${MIN_SCORE}.`,
    });
  }
  return out;
}

/** "The platform inspects it": before the handshake, and of what is known now. */
function inspectionBlockers(c: Candidate): string[] {
  if (!c.inspection) {
    return ["Record what the platform inspected and found (inspectionNotes)."];
  }
  const unseen = readiness(c.facts).filter((r) =>
    !c.inspection!.seen.includes(r.key)
  );
  if (unseen.length === 0) return [];
  return [
    `Inspect again (inspectionNotes): since the inspection of ${
      c.inspection.at.slice(0, 10)
    } the registry shows a concern with the ${
      unseen.map((r) => r.key).join(", ")
    }.`,
  ];
}

/** Terms, then each party's own agreement to them. */
function handshakeBlockers(c: Candidate, to: Agreement): string[] {
  if (!c[TERMS[to]]) {
    return [
      to === "collaboration"
        ? "Record the terms of the trial: scope and care responsibilities (collaborationAgreement)."
        : "Record the terms of the adoption: maintenance and support responsibilities (adoptionAgreement).",
    ];
  }
  return (["platform", "source"] as const)
    .filter((party) => !c.consents[to][party])
    .map((party) =>
      `Record that ${
        PARTY_NAMES[party]
      } agrees to the ${to} terms (agree to=${to} party=${party}).`
    );
}

/** What a trial needs: named parties, a negotiation, an inspection, a handshake. */
function collaborationBlockers(c: Candidate): string[] {
  const out: string[] = [];
  if (!c.platform) out.push("Name the adopting platform (platform).");
  if (!c.steward) out.push("Name the steward (steward).");
  if (!c.negotiationNotes) {
    out.push("Record the negotiation notes (negotiationNotes).");
  }
  out.push(...inspectionBlockers(c));
  out.push(...handshakeBlockers(c, "collaboration"));
  return out;
}

function adoptionBlockers(c: Candidate): string[] {
  const out = collaborationBlockers(c);
  if (!c.collaborationNotes) {
    out.push(
      "Record trial feedback and the originating team's needs (collaborationNotes).",
    );
  }
  out.push(...handshakeBlockers(c, "adoption"));
  if (!c.credit) {
    out.push(
      "Record the value recognised and attribute it back to the original grouping (credit).",
    );
  }
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
      "Stage 6 does not restart; what it makes possible is a new call (openCall follows=).",
    ];
  }
  if (to !== c.stage + 1) return ["Move only to the next stage."];
  switch (c.stage) {
    case 0:
      if (!c.callId && !c.requestRef) {
        out.push(
          "Answer a call for capabilities (answerCall), or link one kept elsewhere (requestRef).",
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
      out.push(...collaborationBlockers(c));
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

/**
 * Defer, decline, resume, adopt or retire without discarding evidence or
 * ownership. Retiring ends an adoption: the platform stops offering the
 * capability, and the record stays.
 */
export function decide(
  candidate: Candidate,
  outcome: Outcome,
  note: string,
  now: string = new Date().toISOString(),
): Candidate {
  if (!OUTCOMES.includes(outcome)) {
    throw new Error("Unknown harvesting outcome.");
  }
  if (!note.trim()) throw new Error("A decision needs a reason.");
  if (candidate.outcome === "retired") {
    throw new Error(
      "A retired adoption stays as history; what follows it is a new call or candidate.",
    );
  }
  if (candidate.outcome === "adopted" && outcome !== "retired") {
    throw new Error(
      "An adoption ends only with outcome=retired and a reason; until then record reuseNotes.",
    );
  }
  if (outcome === "retired" && candidate.outcome !== "adopted") {
    throw new Error(
      "Only an adopted capability is retired; before adoption use deferred or declined.",
    );
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
      candidate.outcome === "retired"
        ? `Still has the '${CORE_LABEL}' label after the adoption was retired.`
        : `Has the '${CORE_LABEL}' label but no explicit adoption is recorded.`,
    );
  }
  if (
    candidate.stage === 6 && candidate.outcome !== "adopted" &&
    candidate.outcome !== "retired"
  ) {
    out.push(
      "Legacy stage 6: review the agreement before recording adoption with decide.",
    );
  }
  for (const concern of readiness(facts)) {
    out.push(`Readiness: ${concern.text}`);
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
