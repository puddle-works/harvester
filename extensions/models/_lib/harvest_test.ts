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
  agree,
  type Agreement,
  answerCall,
  blockers,
  type Candidate,
  closeCall,
  CORE_LABEL,
  decide,
  flags,
  newCall,
  newCandidate,
  parseInfo,
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

/** Both parties agree to the recorded terms. */
function shake(c: Candidate, to: Agreement, now = T1): Candidate {
  return agree(
    agree(c, to, "platform", "platform-team", now),
    to,
    "source",
    "payments team",
    now,
  );
}

/** A candidate at stage 4 with everything a trial needs except the handshake. */
function negotiated(): Candidate {
  return record(at(4), {
    steward: "platform-team",
    platform: "developer platform",
    negotiationNotes: "Discussed responsibilities",
    inspectionNotes: "Read the code and docs; nothing blocks a trial.",
    collaborationAgreement: "Two-team trial; source team retains care.",
  }, T0);
}

/** A candidate at stage 5 with everything adoption needs. */
function adoptable(): Candidate {
  let c = advance(shake(negotiated(), "collaboration"), 5, "trial", T1);
  c = record(c, {
    collaborationNotes: "Trial feedback led to a simpler setup",
    adoptionAgreement: "Platform supports it; use stays optional",
    credit: "Payments team: built it and cut onboarding to 30 minutes",
    offeringRef: "https://example.com/tool/docs-and-support",
  }, T1);
  return shake(c, "adoption");
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
    inspectionNotes: "Code and licence reviewed",
    collaborationAgreement:
      "Both teams agree to a trial; source team retains care.",
  });
  const next = advance(shake(c, "collaboration"), 5, "handover", T1);
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

Deno.test("a call names a need and the platform asking, before any candidate", () => {
  const call = newCall(
    "faster-onboarding",
    " Quicker onboarding for new services ",
    "developer platform",
    null,
    T0,
  );
  assertEquals(call, {
    id: "faster-onboarding",
    need: "Quicker onboarding for new services",
    platform: "developer platform",
    ref: null,
    openedAt: T0,
    closedAt: null,
    closeNote: null,
    follows: null,
  });
  assertThrows(() => newCall("Faster Onboarding", "x", "p"), Error, "call id");
  assertThrows(() => newCall("a", " ", "p"), Error, "need");
  assertThrows(() => newCall("a", "x", " "), Error, "platform");
});

Deno.test("answering a call satisfies stage 0, and several candidates may answer", () => {
  const call = newCall("onboarding", "Quicker onboarding", "platform", null);
  const waiting = newCandidate("@payments/tool", 0, T0);
  assertThrows(() => advance(waiting, 1, "go"), Error, "answerCall");
  const first = answerCall(waiting, call);
  const second = answerCall(newCandidate("@search/kit", 0, T0), call);
  assertEquals([first.callId, second.callId], ["onboarding", "onboarding"]);
  assertEquals(advance(first, 1, "answers the call").stage, 1);
  assertEquals(answerCall(first, call), first);
  assertThrows(
    () => answerCall(first, newCall("other", "x", "p")),
    Error,
    "already answers call 'onboarding'",
  );
});

Deno.test("a closed call takes no more answers and cannot be closed twice", () => {
  const call = newCall("onboarding", "Quicker onboarding", "platform", null);
  assertThrows(() => closeCall(call, " ", T1), Error, "reason");
  const closed = closeCall(call, "Answered by @payments/tool", T1);
  assertEquals(closed.closedAt, T1);
  assertEquals(closed.closeNote, "Answered by @payments/tool");
  assertThrows(() => closeCall(closed, "again"), Error, "already closed");
  assertThrows(
    () => answerCall(newCandidate("@a/b", 1, T0), closed),
    Error,
    "is closed",
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
    inspectionNotes: "Platform read the code, docs and licence",
    collaborationAgreement:
      "Trial with two teams; source team keeps care during the trial",
    collaborationNotes:
      "Trial feedback led to a simpler setup; source team's needs retained",
    adoptionAgreement: "Platform supports the integration; use stays optional",
    credit: "Payments team",
  });
  c = shake(c, "collaboration");
  for (const to of [1, 2, 3, 4, 5] as Stage[]) {
    c = advance(c, to, "evidence reviewed", T1);
  }
  assertEquals(c.baselinePulls, null);
  c = shake(c, "adoption");
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
    "ends only with outcome=retired",
  );
});

Deno.test("a handshake needs each party's own agreement, not text that mentions one", () => {
  const refused = record(negotiated(), {
    collaborationAgreement: "The payments team refused the trial.",
  });
  assertThrows(() => advance(refused, 5, "go"), Error, "party=source");

  const oneSided = agree(
    negotiated(),
    "collaboration",
    "platform",
    "platform-team",
    T1,
  );
  assertEquals(blockers(oneSided, 5), [
    "Record that the original grouping agrees to the collaboration terms (agree to=collaboration party=source).",
  ]);
  // The platform agreeing twice is still one party.
  assertEquals(
    blockers(agree(oneSided, "collaboration", "platform", "cto", T2), 5).length,
    1,
  );

  const both = agree(oneSided, "collaboration", "source", "payments team", T2);
  assertEquals(both.consents.collaboration, {
    platform: { by: "platform-team", at: T1 },
    source: { by: "payments team", at: T2 },
  });
  assertEquals(advance(both, 5, "trial").stage, 5);
});

Deno.test("agreement is to recorded terms, and new terms need agreeing again", () => {
  const bare = record(at(4), { negotiationNotes: "Talking" });
  assertThrows(
    () => agree(bare, "collaboration", "source", "payments team"),
    Error,
    "collaborationAgreement",
  );
  assertThrows(
    () => agree(negotiated(), "collaboration", "source", "  "),
    Error,
    "by",
  );
  const shaken = shake(negotiated(), "collaboration");
  // Recording the same terms again changes nothing.
  assertEquals(
    record(shaken, {
      collaborationAgreement: "Two-team trial; source team retains care.",
    }).consents,
    shaken.consents,
  );
  const changed = record(shaken, {
    collaborationAgreement: "Platform takes over care during the trial.",
  });
  assertEquals(changed.consents.collaboration, {
    platform: null,
    source: null,
  });
  assertEquals(blockers(changed, 5).length, 2);
});

Deno.test("adoption is agreed separately, after the trial, by both parties", () => {
  const early = record(shake(negotiated(), "collaboration"), {
    adoptionAgreement: "Platform supports it",
  });
  assertThrows(
    () => agree(early, "adoption", "platform", "platform-team"),
    Error,
    "stage 5",
  );
  const ready = adoptable();
  const half: Candidate = {
    ...ready,
    consents: {
      ...ready.consents,
      adoption: { ...ready.consents.adoption, source: null },
    },
  };
  // Agreeing to the trial is not agreeing to hand the capability over.
  assertThrows(
    () => decide(half, "adopted", "Platform wants it"),
    Error,
    "agree to=adoption party=source",
  );
  assertEquals(decide(ready, "adopted", "Both agreed", T2).stage, 6);
});

Deno.test("the platform inspects before the handshake", () => {
  const { inspection: _, ...rest } = negotiated();
  const uninspected = shake(
    { ...rest, inspection: null },
    "collaboration",
  );
  assertThrows(() => advance(uninspected, 5, "go"), Error, "inspectionNotes");
  assertThrows(
    () => decide({ ...adoptable(), inspection: null }, "adopted", "go"),
    Error,
    "inspectionNotes",
  );
});

Deno.test("an inspection covers the concerns the registry showed, and no later ones", () => {
  const poor = { ...good, license: null, scorePercentage: 38 };
  // Inspected with the concerns in view: a person has judged them, so they stay advice.
  let seen = addReading(at(4), poor, T0);
  seen = record(seen, {
    steward: "platform-team",
    platform: "developer platform",
    negotiationNotes: "Discussed",
    inspectionNotes: "No licence yet: source team adds MIT before adoption.",
    collaborationAgreement: "Trial",
  }, T1);
  assertEquals(seen.inspection, {
    notes: "No licence yet: source team adds MIT before adoption.",
    at: T1,
    seen: ["licence", "score"],
  });
  seen = shake(seen, "collaboration");
  assertEquals(blockers(seen, 5), []);
  assertEquals(flags(seen).length, 2);

  // Inspected before the registry showed anything wrong.
  const stale = addReading(
    shake(negotiated(), "collaboration"),
    { ...poor, repositoryVerified: false },
    T2,
  );
  assertEquals(blockers(stale, 5), [
    "Inspect again (inspectionNotes): since the inspection of 2026-11-06 the registry shows a concern with the licence, repository, score.",
  ]);
  const again = record(stale, { inspectionNotes: "Reviewed all three." }, T2);
  assertEquals(blockers(again, 5), []);
});

Deno.test("adoption attributes the value back to the original grouping", () => {
  const { credit: _, ...rest } = adoptable();
  assertThrows(
    () => decide({ ...rest, credit: null }, "adopted", "go"),
    Error,
    "attribute it back to the original grouping (credit)",
  );
});

Deno.test("what both parties agreed cannot be rewritten after adoption", () => {
  const adopted = decide(adoptable(), "adopted", "Both agreed", T2);
  for (
    const field of ["adoptionAgreement", "collaborationAgreement", "credit"]
  ) {
    assertThrows(
      () => record(adopted, { [field]: "rewritten" }),
      Error,
      "kept as agreed",
    );
  }
  assertThrows(
    () => agree(adopted, "adoption", "source", "someone else"),
    Error,
    "only an active candidate",
  );
  assertEquals(
    record(adopted, { reuseNotes: "Two teams use it" }).reuseNotes,
    "Two teams use it",
  );
});

Deno.test("an adoption can be retired with a reason, keeping its record", () => {
  assertThrows(
    () => decide(adoptable(), "retired", "skip"),
    Error,
    "Only an adopted capability is retired",
  );
  const adopted = decide(adoptable(), "adopted", "Both agreed", T1);
  assertThrows(() => decide(adopted, "retired", " "), Error, "reason");
  const retired = decide(
    adopted,
    "retired",
    "Superseded by the registry's own onboarding",
    T2,
  );
  assertEquals(retired.outcome, "retired");
  assertEquals(retired.stage, 6);
  assertEquals(retired.decisions.map((d) => d.outcome), ["adopted", "retired"]);
  assertEquals(retired.credit, adopted.credit);
  assertEquals(retired.adoptionAgreement, adopted.adoptionAgreement);
  assertEquals(retired.consents, adopted.consents);
  assertEquals(retired.history, adopted.history);
  for (const outcome of ["active", "adopted", "deferred", "retired"] as const) {
    assertThrows(
      () => decide(retired, outcome, "again"),
      Error,
      "stays as history",
    );
  }
  assertThrows(() => advance(retired, 0, "restart"), Error, "never resets");
  const labelled = addReading(retired, { ...good, labels: [CORE_LABEL] }, T2);
  assertEquals(flags(labelled), [
    `Still has the '${CORE_LABEL}' label after the adoption was retired.`,
  ]);
});

Deno.test("a new call can follow from an adopted capability, which keeps its record", () => {
  assertThrows(
    () => newCall("next", "Audit trail", "data platform", null, T2, at(5)),
    Error,
    "follows an adopted capability",
  );
  const adopted = decide(adoptable(), "adopted", "Both agreed", T1);
  const call = newCall(
    "audit",
    "Audit trail built on the onboarding events",
    "data platform",
    null,
    T2,
    adopted,
  );
  assertEquals(call.follows, "@a/b");
  assertEquals(adopted.stage, 6);
  // A retired capability may still have led somewhere.
  const retired = decide(adopted, "retired", "Superseded", T2);
  assertEquals(newCall("b", "x", "p", null, T2, retired).follows, "@a/b");
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
