/**
 * Tests for the weekly markdown report.
 *
 * Run with: make test
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  addReading,
  agree,
  answerCall,
  closeCall,
  decide,
  newCall,
  newCandidate,
  record,
  type RegistryFacts,
} from "./harvest.ts";
import { renderReport, renderReportHtml } from "./report.ts";

const facts: RegistryFacts = {
  latestVersion: "1.0.0",
  labels: [],
  license: "MIT",
  repositoryVerified: true,
  scorePercentage: 90,
  pullCount: 40,
};
const T0 = "2026-11-06T09:00:00.000Z";
const T1 = "2026-11-13T09:00:00.000Z";

Deno.test("an empty report says nothing is tracked", () => {
  assert(renderReport([], T0).includes("No extensions are tracked."));
});

Deno.test("each extension shows stage, pulls, change and blockers", () => {
  let c = newCandidate("@a/b", 1, T0);
  c = addReading(c, facts, T0);
  c = addReading(c, { ...facts, pullCount: 55 }, T1);
  const md = renderReport([c], T1);
  assert(md.includes("| @a/b | 1 Candidate |"));
  assert(md.includes("| 55 | +15 |"));
  assert(md.includes("Steward: none named"));
});

Deno.test("blockers and flags are listed under the extension", () => {
  const c = newCandidate("@a/b", 1, T0);
  const md = renderReport([c], T0);
  assert(md.includes("flowEvidence"));
});

Deno.test("no reading shows a dash, not a number", () => {
  const md = renderReport([newCandidate("@a/b", 1, T0)], T0);
  assert(md.includes("| – | – |"));
});

Deno.test("the report keeps no personal data", () => {
  const md = renderReport([newCandidate("@a/b", 1, T0)], T0);
  assertEquals(md.includes("@") && md.includes("mailto"), false);
});

Deno.test("the HTML report shows blockers, escapes names and counts who can move", () => {
  const stuck = newCandidate("@a/<b>", 1, T0);
  let ready = newCandidate("@a/ok", 1, T0);
  ready = addReading(ready, facts, T0);
  ready = addReading(ready, { ...facts, pullCount: 55 }, T1);
  ready = record(ready, {
    discoveryNotes: "Team demo",
    flowEvidence: "Less onboarding effort",
  });
  const html = renderReportHtml([stuck, ready], T1);
  assert(
    html.includes(
      "1 ready · 1 waiting for evidence · 0 adopted, retired, paused or under review",
    ),
  );
  assert(html.includes("flowEvidence"));
  assert(html.includes("@a/&lt;b&gt;") && !html.includes("@a/<b>"));
  assert(html.includes('<i class="now ready"></i>'));
  assert(html.includes("Ready to move to stage 2."));
});

Deno.test("the HTML report for no extensions says so", () => {
  assert(renderReportHtml([], T0).includes("No extensions are tracked"));
});

Deno.test("reports distinguish closed outcomes and legacy adoption from missing evidence", () => {
  const candidate = record(newCandidate("@a/tool"), {
    flowEvidence: "Faster setup",
    discoveryNotes: "Team demo",
  });
  const deferred = decide(candidate, "deferred", "No capacity <yet>", T1);
  const declined = decide(
    { ...candidate, extension: "@a/declined" },
    "declined",
    "Wrong fit",
    T1,
  );
  const adopted = {
    ...candidate,
    extension: "@a/adopted",
    stage: 6 as const,
    outcome: "adopted" as const,
    reuseNotes: "No voluntary uptake <yet>",
  };
  const legacy = { ...candidate, extension: "@a/legacy", stage: 6 as const };
  const retired = decide(
    { ...adopted, extension: "@a/retired" },
    "retired",
    "Superseded <2027>",
    T1,
  );
  const candidates = [deferred, declined, adopted, legacy, retired];
  const html = renderReportHtml(candidates, T1);
  assert(
    html.includes(
      "0 ready · 0 waiting for evidence · 5 adopted, retired, paused or under review",
    ),
  );
  for (
    const label of [
      "Deferred",
      "Declined",
      "Adopted",
      "Review adoption",
      "Retired",
    ]
  ) {
    assert(html.includes(`">${label}</span>`), label);
  }
  assert(html.includes("Superseded &lt;2027&gt;"));
  assert(
    html.includes("No capacity &lt;yet&gt;") &&
      !html.includes("No capacity <yet>"),
  );
  assert(html.includes("No voluntary uptake &lt;yet&gt;"));
  for (const report of [html, renderReport(candidates, T1)]) {
    assert(!report.includes("move to stage 0"));
    assert(!report.includes("flowEvidence"));
    assert(report.includes("voluntary use"));
    assert(report.includes("current owner retains care"));
    assert(report.includes("Legacy stage 6"));
    assert(report.includes("Reuse review:"));
    assert(report.includes("No longer offered by the platform."));
  }
});

Deno.test("reports show which party has agreed, the inspection and the attribution", () => {
  let c = record({ ...newCandidate("@a/tool", 1, T0), stage: 4 }, {
    platform: "developer platform",
    steward: "platform-team",
    negotiationNotes: "Discussed",
    inspectionNotes: "Read the <code>",
    collaborationAgreement: "Two-team trial",
    credit: "Payments team: cut onboarding to 30 minutes",
  }, T0);
  c = agree(c, "collaboration", "platform", "platform-team", T1);
  const md = renderReport([c], T1);
  assert(
    md.includes(
      "Trial handshake – platform: agreed (platform-team); original grouping: not recorded.",
    ),
  );
  assert(md.includes("Inspected 2026-11-06: Read the <code>"));
  assert(
    md.includes(
      "Value attributed to the original grouping: Payments team: cut onboarding to 30 minutes",
    ),
  );
  assert(md.includes("- Record that the original grouping agrees"));
  assert(!md.includes("Adoption handshake"));
  const html = renderReportHtml([c], T1);
  assert(html.includes("Read the &lt;code&gt;") && !html.includes("<code>"));
  assert(html.includes("original grouping: not recorded"));
  assert(html.includes('<span class="badge waiting">Waiting</span>'));
});

Deno.test("reports show the calls an adopted capability led to: the 6 to 0 arrow", () => {
  const adopted = {
    ...newCandidate("@payments/tool", 1, T0),
    stage: 6 as const,
    outcome: "adopted" as const,
  };
  const other = { ...adopted, extension: "@search/kit" };
  const next = newCall("audit", "Audit trail", "data", null, T1, adopted);
  const done = closeCall(
    newCall("billing", "Billing events", "data", null, T0, adopted),
    "Answered",
    T1,
  );
  const unrelated = newCall("search", "Search", "dev", null, T0);
  const calls = [next, done, unrelated];
  const md = renderReport([adopted, other], T1, calls);
  assert(
    md.includes(
      "| audit | data | Audit trail | – | @payments/tool | open | no candidate yet: look for one |",
    ),
  );
  assert(md.includes("| search | dev | Search | – | – | open |"));
  assertEquals(
    md.split("\n").filter((l) => l.startsWith("Led to calls:")),
    ["Led to calls: audit, billing (closed)."],
  );
  const html = renderReportHtml([adopted, other], T1, calls);
  assert(html.includes("Follows from: @payments/tool."));
  assertEquals(html.split("Led to calls: audit, billing (closed).").length, 2);
});

Deno.test("reports list calls, who answers them and which still need a candidate", () => {
  const answered = newCall(
    "onboarding",
    "Quicker | safer onboarding",
    "dev",
    null,
    T0,
  );
  const open = newCall("audit", "Audit <trail>", "data platform", "Lab 7", T1);
  const closed = closeCall(
    newCall("search", "Search", "dev", null, T0),
    "No longer needed",
    T1,
  );
  const a = answerCall(newCandidate("@payments/tool", 1, T0), answered);
  const b = answerCall(newCandidate("@search/kit", 1, T0), answered);
  const calls = [closed, open, answered];

  const md = renderReport([a, b], T1, calls);
  const rows = md.split("\n").filter((l) =>
    /^\| (onboarding|audit|search) /.test(l)
  );
  assertEquals(rows, [
    "| onboarding | dev | Quicker \\| safer onboarding | – | – | open | @payments/tool (stage 1, active), @search/kit (stage 1, active) |",
    "| audit | data platform | Audit <trail> | Lab 7 | – | open | no candidate yet: look for one |",
    "| search | dev | Search | – | – | closed: No longer needed | – |",
  ]);
  assert(md.includes("Answers call: onboarding."));

  const html = renderReportHtml([a, b], T1, calls);
  assert(html.includes("Audit &lt;trail&gt;") && !html.includes("<trail>"));
  assert(html.includes('<span class="badge waiting">Unanswered</span>'));
  assert(
    html.includes("Answered by: @payments/tool (stage 1, active), @search/kit"),
  );
  assert(html.includes("Closed: No longer needed"));
});

Deno.test("calls are reported even when no extension is tracked", () => {
  const call = newCall("audit", "Audit trail", "data platform", null, T0);
  for (
    const report of [
      renderReport([], T0, [call]),
      renderReportHtml([], T0, [call]),
    ]
  ) {
    assert(report.includes("Audit trail"));
    assert(report.includes("No extensions are tracked"));
  }
});
