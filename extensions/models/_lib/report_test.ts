/**
 * Tests for the weekly markdown report.
 *
 * Run with: make test
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { addReading, newCandidate, type RegistryFacts } from "./harvest.ts";
import { renderReport } from "./report.ts";

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
  assert(md.includes("Take at least two readings"));
});

Deno.test("no reading shows a dash, not a number", () => {
  const md = renderReport([newCandidate("@a/b", 1, T0)], T0);
  assert(md.includes("| – | – |"));
});

Deno.test("the report keeps no personal data", () => {
  const md = renderReport([newCandidate("@a/b", 1, T0)], T0);
  assertEquals(md.includes("@") && md.includes("mailto"), false);
});
