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
  assertOwnCollective,
  blockers,
  type Candidate,
  CORE_LABEL,
  flags,
  newCandidate,
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

Deno.test("stage 0 needs a Lab request linked before it moves on", () => {
  const c = newCandidate("@a/b", 0, T0);
  assertEquals(blockers(c, 1), ["Link the Lab feature request (requestRef)."]);
  const linked = record(c, { requestRef: "https://swamp-club.com/lab/1" });
  assertEquals(blockers(linked, 1), []);
});

Deno.test("stage 1 needs pull growth across two readings", () => {
  let c = newCandidate("@a/b", 1, T0);
  assertEquals(blockers(c, 2), [
    "Take at least two readings to see pull growth.",
  ]);
  c = addReading(c, good, T0);
  c = addReading(c, good, T1);
  assertEquals(blockers(c, 2), ["Pulls have not grown between the readings."]);
  c = addReading(c, { ...good, pullCount: 55 }, T2);
  assertEquals(blockers(c, 2), []);
});

Deno.test("stage 2 needs licence, verified repo, score and a value statement", () => {
  let c = at(2);
  assertEquals(blockers(c, 3), [
    "Take a reading so the registry facts are known.",
    "Write the value statement (valueStatement).",
  ]);
  c = addReading(c, {
    ...good,
    license: null,
    repositoryVerified: false,
    scorePercentage: 38,
  }, T0);
  assertEquals(blockers(c, 3), [
    "Add a licence to the extension.",
    "Verify the extension's repository.",
    "Raise the quality score to 80 or more (now 38).",
    "Write the value statement (valueStatement).",
  ]);
});

Deno.test("an unverified repo reported as null counts as not verified", () => {
  let c = at(2);
  c = addReading(c, {
    ...good,
    repositoryVerified: null as unknown as boolean,
  }, T0);
  assert(blockers(c, 3).includes("Verify the extension's repository."));
});

Deno.test("stage 3 needs a showcase record, and the steward to enter stage 4", () => {
  const c = at(3);
  assertEquals(blockers(c, 4), [
    "Record where it was shown (showcase).",
    "Name the steward (steward).",
  ]);
});

Deno.test("stage 4 needs notes, a decision and a reading as the baseline", () => {
  const c = at(4);
  assertEquals(blockers(c, 5), [
    "Record the negotiation notes (negotiationNotes).",
    "Record the stewardship decision (decision).",
    "Take a reading to be the 'before' pull count.",
  ]);
});

Deno.test("stage 5 needs credit, the core label and a later reading", () => {
  let c = at(5);
  c = addReading(c, good, T0);
  c = { ...c, baselinePulls: 40 };
  assertEquals(blockers(c, 6), [
    "Credit the original author (credit).",
    `Add the '${CORE_LABEL}' label to the extension and publish it.`,
    "Take a reading after entering stage 5 for the 'after' pull count.",
  ]);
});

Deno.test("stage 6 loops back to 0 as a new cycle", () => {
  let c = at(6);
  c = { ...c, steward: "platform-team", decision: "adopted", credit: "ada" };
  assertEquals(blockers(c, 0), []);
  const next = advance(c, 0, "start over", T1);
  assertEquals(next.stage, 0);
  assertEquals(next.cycle, 2);
  assertEquals(next.steward, "platform-team");
  assertEquals(next.decision, null);
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
    "Take at least two readings",
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
    negotiationNotes: "agreed",
    decision: "adopted",
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

Deno.test("flags a core label with no stewardship decision", () => {
  let c = at(2);
  c = addReading(c, { ...good, labels: [CORE_LABEL] }, T0);
  assertEquals(flags(c), [
    `Has the '${CORE_LABEL}' label but no stewardship decision is recorded.`,
  ]);
});

Deno.test("flags stage 6 when the core label is missing", () => {
  let c = at(6);
  c = addReading(c, good, T0);
  assertEquals(flags(c), [
    `At stage 6 but the '${CORE_LABEL}' label is missing.`,
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
