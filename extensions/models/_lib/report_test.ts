/**
 * Tests for the weekly markdown report.
 *
 * Run with: make test
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  addReading,
  decide,
  newCandidate,
  openCall,
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
      "1 ready · 1 waiting for evidence · 0 adopted, paused or under review",
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
  const candidates = [deferred, declined, adopted, legacy];
  const html = renderReportHtml(candidates, T1);
  assert(
    html.includes(
      "0 ready · 0 waiting for evidence · 4 adopted, paused or under review",
    ),
  );
  for (const label of ["Deferred", "Declined", "Adopted", "Review adoption"]) {
    assert(html.includes(label));
  }
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
  }
});

Deno.test("reports list calls, including unanswered ones, even with nothing tracked", () => {
  const open = openCall(
    {},
    "fast-onboarding",
    "Onboard <fast>",
    "Dev platform",
    T0,
  );
  const quiet = openCall({}, "audit-logs", "Shared audit logs", "Security", T0);
  const answering = { ...newCandidate("@a/tool"), callId: open.id };
  const md = renderReport([answering], T1, [quiet, open]);
  assert(md.includes("## Calls for capabilities"));
  assert(
    md.includes(
      "audit-logs (Security): Shared audit logs Open. No candidate has answered yet.",
    ),
  );
  assert(md.includes("Answered by @a/tool"));
  assert(md.includes("Answers call: fast-onboarding"));
  assert(
    renderReport([], T1, [quiet]).includes("No candidate has answered yet"),
  );
  const html = renderReportHtml([], T1, [open]);
  assert(html.includes("Calls for capabilities"));
  assert(
    html.includes("Onboard &lt;fast&gt;") && !html.includes("Onboard <fast>"),
  );
  assert(!renderReport([answering], T1).includes("Calls for capabilities"));
});
