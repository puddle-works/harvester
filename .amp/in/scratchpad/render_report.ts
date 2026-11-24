// Renders the HTML and markdown reports from synthetic data covering calls,
// both handshake states, an adopted capability with a follow-on call and a
// retired one. Usage: deno run --allow-write render_report.ts <outdir>
import {
  addReading,
  advance,
  agree,
  answerCall,
  type Candidate,
  closeCall,
  decide,
  newCall,
  newCandidate,
  record,
  type RegistryFacts,
} from "../../../extensions/models/_lib/harvest.ts";
import {
  renderReport,
  renderReportHtml,
} from "../../../extensions/models/_lib/report.ts";

const T = (d: number) => `2026-11-${String(d).padStart(2, "0")}T09:00:00.000Z`;
const facts: RegistryFacts = {
  latestVersion: "1.0.0",
  labels: [],
  license: "MIT",
  repositoryVerified: true,
  scorePercentage: 92,
  pullCount: 40,
};
const onboarding = newCall(
  "onboarding",
  "Quicker onboarding for new services",
  "developer platform",
  "Lab request 12",
  T(1),
);

function toStage4(name: string, extra: Partial<RegistryFacts> = {}): Candidate {
  let c = answerCall(newCandidate(name, 1, T(1)), onboarding);
  c = addReading(c, { ...facts, ...extra }, T(2));
  c = record(c, {
    discoveryNotes: "Payments demo; platform team follows up",
    flowEvidence: "Onboarding fell from 2 days to 30 minutes",
    valueStatement: "Three teams benefit; source team shares support",
    showcase: "Engineering community",
    interest: "Two teams want a trial",
    platform: "developer platform",
    steward: "platform-team",
    negotiationNotes: "Source keeps upstream development",
  }, T(3));
  for (const to of [2, 3, 4] as const) c = advance(c, to, "reviewed", T(4));
  return c;
}
function adopt(name: string): Candidate {
  let c = record(toStage4(name), {
    inspectionNotes: "Read the code, docs and licence; nothing blocks a trial",
    collaborationAgreement: "Two-team trial; source team keeps care",
  }, T(5));
  c = agree(c, "collaboration", "platform", "platform-team", T(5));
  c = agree(c, "collaboration", "source", "payments team", T(6));
  c = advance(c, 5, "trial", T(6));
  c = record(c, {
    collaborationNotes: "Simpler setup after the trial",
    adoptionAgreement: "Platform supports it; use stays optional",
    credit: "Payments team: built it and cut onboarding to 30 minutes",
    offeringRef: "https://example.com/tool",
  }, T(8));
  c = agree(c, "adoption", "platform", "platform-team", T(9));
  c = agree(c, "adoption", "source", "payments team", T(9));
  c = addReading(c, { ...facts, pullCount: 58 }, T(9));
  return decide(c, "adopted", "Both teams approved the supported offering", T(10));
}

const adopted = record(adopt("@payments/onboard"), {
  reuseNotes: "Two more teams chose to use it; one asked for audit events.",
});
let oneSided = record(toStage4("@search/scaffold", { license: null }), {
  inspectionNotes: "No licence yet: source team adds MIT before adoption",
  collaborationAgreement: "One-team trial; platform reviews setup docs",
}, T(7));
oneSided = agree(oneSided, "collaboration", "platform", "platform-team", T(8));
const uninspected = toStage4("@data/bootstrap-with-a-rather-long-extension-name");
const retired = decide(
  adopt("@legacy/vm-onboard"),
  "retired",
  "Superseded by the registry's own onboarding",
  T(11),
);
const fresh = answerCall(
  newCandidate("@billing/events", 1, T(11)),
  newCall("audit", "x", "p", null, T(11)),
);

const calls = [
  onboarding,
  newCall(
    "audit",
    "Audit trail built on the onboarding events",
    "data platform",
    null,
    T(11),
    adopted,
  ),
  newCall("cost", "Per-team cost reports", "finance platform", null, T(11), adopted),
  closeCall(
    newCall("vm", "VM images", "developer platform", null, T(1)),
    "No longer needed",
    T(11),
  ),
];
const candidates = [adopted, oneSided, uninspected, retired, fresh];
const out = Deno.args[0];
await Deno.writeTextFile(`${out}/report.html`, renderReportHtml(candidates, T(12), calls));
await Deno.writeTextFile(`${out}/report.md`, renderReport(candidates, T(12), calls));
