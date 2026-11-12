/**
 * Tests for the harvesting stage rules: what each stage needs before an
 * extension may move on, and what the registry facts are read from.
 *
 * Run with: make test
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  addReading,
  advance,
  answerCall,
  assertOwnCollective,
  blockers,
  type Candidate,
  closeCall,
  CORE_LABEL,
  decide,
  flags,
  newCandidate,
  openCall,
  parseInfo,
  parseWhoami,
  readToday,
  record,
  type RegistryFacts,
  type Stage,
} from "./harvest.ts";

const T0 = "2026-11-06T09:00:00.000Z";
const T1 = "2026-11-13T09:00:00.000Z";
const T2 = "2026-11-20T09:00:00.000Z";

/** A candidate placed at any stage, as if it had been advanced there. */
function at(stage: Stage, extension = "@a/b"): Candidate {
  return { ...newCandidate(extension, 1, T0), stage };
}

const good: RegistryFacts = {
  latestVersion: "2026.11.01.1",
  labels: ["obsidian"],
  license: "MIT",
  repositoryVerified: true,
  scorePercentage: 100,
  pullCount: 40,
};

Deno.test("a new candidate starts at stage 1 unless told otherwise", () => {
  const c = newCandidate("@puddleworks/capture", undefined, T0);
  assertEquals(c.stage, 1);
  assertEquals(c.cycle, 1);
  assertEquals(c.steward, null);
  assertEquals(c.readings, []);
});

Deno.test("a candidate can start at stage 0 or 1 only", () => {
  assertEquals(newCandidate("@a/b", 0, T0).stage, 0);
  assertThrows(() => newCandidate("@a/b", 3, T0), Error, "stage 0 or 1");
});

Deno.test("a name must be @collective/name", () => {
  assertThrows(() => newCandidate("capture", 1, T0), Error, "@collective/name");
});

Deno.test("stage 0 needs a capability request linked before it moves on", () => {
  const c = newCandidate("@a/b", 0, T0);
  assertThrows(() => advance(c, 1, "go"), Error, "requestRef");
  const linked = record(c, { requestRef: "https://swamp-club.com/lab/1" });
  assertEquals(blockers(linked, 1), []);
});

Deno.test("pull growth cannot substitute for discovery and demonstrated flow", () => {
  let c = newCandidate("@a/b", 1, T0);
  c = addReading(c, good, T0);
  c = addReading(c, { ...good, pullCount: 55 }, T2);
  assertThrows(() => advance(c, 2, "popular"), Error, "flowEvidence");
  c = record(c, { flowEvidence: "Onboarding fell from 2 days to 30 minutes." });
  assertThrows(() => advance(c, 2, "go"), Error, "discoveryNotes");
  c = record(c, {
    discoveryNotes: "Payments demo; platform team will follow up.",
  });
  assertEquals(advance(c, 2, "useful").stage, 2);
});

Deno.test("registry readiness is advice, not evidence of wider value", () => {
  let c = at(2);
  c = addReading(c, {
    ...good,
    license: null,
    repositoryVerified: false,
    scorePercentage: 38,
  }, T0);
  assertThrows(() => advance(c, 3, "go"), Error, "valueStatement");
  c = record(c, {
    valueStatement:
      "Three teams save onboarding effort; source team shares support costs.",
  });
  assertEquals(advance(c, 3, "show it").stage, 3);
  assertEquals(flags(c).length, 3);
  assert(flags(c).every((f) => f.startsWith("Readiness:")));
});

Deno.test("an unverified repo reported as null counts as not verified", () => {
  let c = at(2);
  c = addReading(c, {
    ...good,
    repositoryVerified: null as unknown as boolean,
  }, T0);
  assert(flags(c).includes("Readiness: the repository is not verified."));
});

Deno.test("a showcase needs buyer interest, not a prematurely appointed steward", () => {
  let c = record(at(3), { showcase: "Platform community demo" });
  assertThrows(() => advance(c, 4, "go"), Error, "interest");
  c = record(c, {
    interest: "Developer platform wants a trial with two teams.",
  });
  assertEquals(advance(c, 4, "negotiate").steward, null);
});

Deno.test("a free-text decision does not establish agreement to collaborate", () => {
  let c = record(at(4), {
    steward: "platform-team",
    platform: "developer platform",
    negotiationNotes: "Discussed responsibilities",
    decision: "declined",
  });
  c = addReading(c, good, T0);
  assertThrows(() => advance(c, 5, "go"), Error, "collaborationAgreement");
});

Deno.test("core label, credit and readings do not establish adoption", () => {
  let c = record(at(5), { credit: "source team", decision: "adopted" });
  c = addReading(c, { ...good, labels: [CORE_LABEL] }, T1);
  assertThrows(() => decide(c, "adopted", "go"), Error, "adoptionAgreement");
  assertThrows(() => advance(c, 6, "go"), Error, "Use decide");
});

Deno.test("stage 6 cannot reset the adoption evidence", () => {
  let c = at(6);
  c = { ...c, steward: "platform-team", decision: "adopted", credit: "ada" };
  assertThrows(() => advance(c, 0, "start over", T1), Error, "never resets");
  assertEquals(c.decision, "adopted");
  assertEquals(c.credit, "ada");
});

Deno.test("an extension cannot skip or go back a stage", () => {
  const c = newCandidate("@a/b", 1, T0);
  assertThrows(() => advance(c, 3, "skip", T1), Error, "next stage");
  assertThrows(() => advance(c, 0, "back", T1), Error, "next stage");
});

Deno.test("advance refuses while anything blocks and says what", () => {
  const c = newCandidate("@a/b", 1, T0);
  assertThrows(
    () => advance(c, 2, "go", T1),
    Error,
    "flowEvidence",
  );
});

Deno.test("advance moves the stage and keeps the history", () => {
  let c = newCandidate("@a/b", 0, T0);
  c = record(c, { requestRef: "https://swamp-club.com/lab/1" });
  const next = advance(c, 1, "request answered", T1);
  assertEquals(next.stage, 1);
  assertEquals(next.history, [
    { from: 0, to: 1, at: T1, note: "request answered" },
  ]);
});

Deno.test("entering stage 5 stores the latest pull count as the baseline", () => {
  let c = at(4);
  c = addReading(c, good, T0);
  c = record(c, {
    steward: "platform-team",
    platform: "developer platform",
    negotiationNotes: "agreed",
    collaborationAgreement:
      "Both teams agree to a trial; source team retains care.",
  });
  const next = advance(c, 5, "handover", T1);
  assertEquals(next.baselinePulls, 40);
});

Deno.test("record rejects an empty value and unknown fields", () => {
  const c = newCandidate("@a/b", 1, T0);
  assertThrows(() => record(c, { steward: "  " }), Error, "steward");
  assertThrows(
    () => record(c, { stage: 6 } as never),
    Error,
    "Unknown field",
  );
});

Deno.test("showcases accumulate rather than replace", () => {
  let c = at(3);
  c = record(c, { showcase: "Conflux talk" }, T0);
  c = record(c, { showcase: "Community call" }, T1);
  assertEquals(c.showcases.map((s: { where: string }) => s.where), [
    "Conflux talk",
    "Community call",
  ]);
});

Deno.test("a reading keeps the latest facts and the stage it was taken at", () => {
  const c = addReading(newCandidate("@a/b", 1, T0), good, T0);
  assertEquals(c.readings, [{ at: T0, pullCount: 40, stage: 1 }]);
  assertEquals(c.facts?.license, "MIT");
});

Deno.test("flags a core label without explicit adoption", () => {
  let c = at(2);
  c = addReading(c, { ...good, labels: [CORE_LABEL] }, T0);
  assertEquals(flags(c), [
    `Has the '${CORE_LABEL}' label but no explicit adoption is recorded.`,
  ]);
});

Deno.test("legacy stage 6 requires review, not adding a label", () => {
  let c = at(6);
  c = addReading(c, good, T0);
  assertEquals(flags(c), [
    "Legacy stage 6: review the agreement before recording adoption with decide.",
  ]);
});

Deno.test("parseInfo keeps only the facts it needs", () => {
  const facts = parseInfo({
    name: "@a/b",
    pullCount: 12,
    latestVersion: "1.0.0",
    labels: ["x"],
    license: "MIT",
    repositoryVerified: null,
    score: { percentage: 90, grade: "A" },
    author: { username: "ada", displayName: "Ada L" },
    description: "kept out",
  });
  assertEquals(facts, {
    latestVersion: "1.0.0",
    labels: ["x"],
    license: "MIT",
    repositoryVerified: false,
    scorePercentage: 90,
    pullCount: 12,
  });
  assert(!JSON.stringify(facts).includes("Ada"));
});

Deno.test("parseInfo refuses output without a pull count", () => {
  assertThrows(() => parseInfo({ name: "@a/b" }), Error, "pullCount");
});

Deno.test("parseWhoami keeps only the username and collectives", () => {
  const who = parseWhoami({
    authenticated: true,
    username: "ada",
    email: "ada@example.com",
    name: "Ada L",
    collectives: ["acme", "ada"],
  });
  assertEquals(who, { username: "ada", collectives: ["acme", "ada"] });
});

Deno.test("parseWhoami accepts a collective token, which has no username", () => {
  // The shape `swamp auth whoami --json` prints for a collective token.
  const token = {
    authenticated: true,
    collectiveToken: true,
    collectiveSlug: "acme",
  };
  assertEquals(parseWhoami({ ...token, collectives: ["acme"] }), {
    username: "acme",
    collectives: ["acme"],
  });
  // An older server lists no collectives; the token still acts for its own.
  assertEquals(parseWhoami(token).collectives, ["acme"]);
  assertThrows(() => parseWhoami({}), Error, "Not signed in");
  assertThrows(
    () => parseWhoami({ collectiveSlug: "acme" }),
    Error,
    "Not signed in",
  );
});

Deno.test("only extensions in the runner's own collectives may be tracked", () => {
  assertOwnCollective("@acme/tool", ["acme"]);
  assertThrows(
    () => assertOwnCollective("@other/tool", ["acme"]),
    Error,
    "@other",
  );
});

Deno.test("readToday is true only when a reading was taken on that UTC day", () => {
  const c = addReading(newCandidate("@a/b", 1, T0), good, T0);
  assertEquals(readToday(c, "2026-11-06T23:59:00.000Z"), true);
  assertEquals(readToday(c, T1), false);
  assertEquals(readToday(newCandidate("@a/b", 1, T0), T0), false);
});

Deno.test("a useful capability can be adopted without registry popularity or labels", () => {
  let c = record(newCandidate("@acme/tool", 0, T0), {
    requestRef: "Lab call for quicker onboarding",
    discoveryNotes: "Payments team demo; platform team owns follow-up",
    flowEvidence: "Onboarding fell from 2 days to 30 minutes",
    valueStatement: "Three teams benefit; source team shares support effort",
    showcase: "Engineering community",
    interest: "Developer platform and two consumer teams want a trial",
    platform: "developer platform",
    steward: "platform-team",
    negotiationNotes:
      "Source team keeps upstream development; platform supports integration",
    collaborationAgreement:
      "Both teams accepted the trial scope and care responsibilities",
    collaborationNotes:
      "Trial feedback led to a simpler setup; source team's needs retained",
    adoptionAgreement:
      "Both teams accepted support responsibilities; use stays optional",
    credit: "Payments team",
  });
  for (const to of [1, 2, 3, 4, 5] as Stage[]) {
    c = advance(c, to, "evidence reviewed", T1);
  }
  assertEquals(c.baselinePulls, null);
  assertThrows(() => decide(c, "adopted", "agree"), Error, "offeringRef");
  c = record(c, { offeringRef: "https://example.com/tool/docs-and-support" });
  assertThrows(() => decide(c, "adopted", "  "), Error, "reason");
  const adopted = decide(
    c,
    "adopted",
    "Both teams approved; publish the offering",
    T2,
  );
  assertEquals(adopted.stage, 6);
  assertEquals(adopted.outcome, "adopted");
  assertEquals(adopted.decisions, [{
    outcome: "adopted",
    note: "Both teams approved; publish the offering",
    at: T2,
  }]);
  assertEquals(adopted.history.at(-1), {
    from: 5,
    to: 6,
    note: "Both teams approved; publish the offering",
    at: T2,
  });
  const reviewed = record(adopted, {
    reuseNotes: "No other team has chosen to use it yet.",
  });
  assertEquals(reviewed.outcome, "adopted");
  assertEquals(reviewed.adoptionAgreement, adopted.adoptionAgreement);
  assertEquals(flags(reviewed), []);
  assertThrows(
    () => decide(adopted, "active", "restart"),
    Error,
    "Keep the adoption agreement",
  );
});

Deno.test("defer and decline retain evidence and require a reasoned resume", () => {
  const c = record(at(1), {
    flowEvidence: "Faster onboarding",
    discoveryNotes: "Team demo",
  });
  assertThrows(() => decide(c, "adopted", "skip"), Error, "stage 5");
  for (const outcome of ["deferred", "declined"] as const) {
    const stopped = decide(c, outcome, "Platform cannot support this yet", T1);
    assertEquals(stopped.stage, 1);
    assertEquals(stopped.flowEvidence, c.flowEvidence);
    assertThrows(() => advance(stopped, 2, "ignore decision"), Error, outcome);
    assertThrows(
      () => decide({ ...stopped, stage: 5 }, "adopted", "skip resume"),
      Error,
      "active candidate",
    );
    const resumed = decide(stopped, "active", "New support capacity", T2);
    assertEquals(advance(resumed, 2, "continue").stage, 2);
    assertEquals(resumed.decisions.map((d) => d.outcome), [outcome, "active"]);
  }
});

Deno.test("a call exists before any extension and stage 0 accepts answering it", () => {
  const call = openCall(
    {},
    "fast-onboarding",
    "Onboard in a day",
    "Dev platform",
    T0,
  );
  assertEquals(call.closedAt, null);
  const calls = { [call.id]: call };
  assertThrows(
    () => openCall(calls, "fast-onboarding", "x", "y"),
    Error,
    "already exists",
  );
  assertThrows(() => openCall({}, "Bad Id", "x", "y"), Error, "lower-case");
  assertThrows(() => openCall({}, "ok", " ", "y"), Error, "need");
  assertThrows(() => openCall({}, "ok", "x", " "), Error, "platform");
  const c = newCandidate("@a/b", 0, T0);
  assertThrows(() => advance(c, 1, "go"), Error, "call");
  assertThrows(() => answerCall(c, calls, "missing"), Error, "No call");
  assertThrows(() => answerCall(c, calls, "constructor"), Error, "No call");
  const answered = answerCall(c, calls, "fast-onboarding");
  assertEquals(advance(answered, 1, "answers the call").stage, 1);
});

Deno.test("a closed call keeps its answers but takes no new ones", () => {
  const call = openCall(
    {},
    "fast-onboarding",
    "Onboard in a day",
    "Dev platform",
    T0,
  );
  const linked = answerCall(
    newCandidate("@a/b", 0, T0),
    { [call.id]: call },
    call.id,
  );
  const closed = closeCall(call, "Met by @a/b", T1);
  assertEquals(closed.closeNote, "Met by @a/b");
  assertThrows(() => closeCall(closed, "again"), Error, "already closed");
  assertThrows(() => closeCall(call, " "), Error, "reason");
  assertThrows(
    () =>
      answerCall(newCandidate("@a/c", 0, T0), { [call.id]: closed }, call.id),
    Error,
    "closed",
  );
  assertEquals(linked.callId, call.id);
});
