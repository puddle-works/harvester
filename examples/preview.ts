/** Synthetic review fixture served by the real HTML renderer. No registry access. */
import {
  type Candidate,
  newCandidate,
  openCall,
} from "../extensions/models/_lib/harvest.ts";
import { renderReportHtml } from "../extensions/models/_lib/report.ts";

const now = "2026-11-13T09:00:00.000Z";
const names = [
  "@demo-platform/access-requests",
  "@demo-tools/local-environments",
  "@demo-tools/release-notes",
  "@demo-platform/cost-insights",
  "@demo-tools/legacy-deploy",
  "@demo-tools/service-catalog",
  "@demo-platform/audit-evidence",
  "@demo-platform/preview-environments",
  "@demo-tools/dependency-review",
  "@demo-platform/deploy-kit",
  "@demo-tools/incident-timeline",
  "@demo-tools/docs-search",
  "@demo-tools/test-data",
  "@demo-tools/schema-check",
  "@demo-tools/change-notes",
  "@demo-platform/secret-rotation",
  "@demo-platform/certificate-watch",
  "@demo-platform/backup-check",
  "@demo-platform/onboarding",
];
const stages: Candidate["stage"][] = [0, 1, 1, 2, 2, 3, 4, 5, 5, 6];
const candidates: Candidate[] = names.slice(0, 10).map((name, i) => ({
  ...newCandidate(name, i === 0 ? 0 : 1, "2026-10-15T09:00:00.000Z"),
  stage: stages[i],
  stageEnteredAt: "2026-11-06T09:00:00.000Z",
  discoveryNotes:
    "Found in the Payments team demo; Developer Experience is following up.",
  flowEvidence: i === 2
    ? null
    : "Trial teams reduced setup from half a day to 20 minutes.",
  valueStatement: i === 3
    ? null
    : "Three delivery teams could reuse this; review support effort after the trial.",
  showcases: i >= 3
    ? [{ where: "Engineering community demo", at: "2026-11-04T10:00:00.000Z" }]
    : [],
  interest: i === 5 ? "Search and Payments want to try it in December." : null,
  platform: i >= 6 ? "Developer Experience" : null,
  steward: i >= 6 ? "Developer Experience team" : null,
  negotiationNotes: i >= 6
    ? "Source team keeps upstream ownership. Platform supports the integration."
    : null,
  collaborationAgreement: i >= 6
    ? "Both teams agreed a two-week trial with office-hours support."
    : null,
  collaborationNotes: i >= 7
    ? "Two teams completed onboarding; clearer rollback documentation requested."
    : null,
  adoptionAgreement: i === 9
    ? "Both teams accepted the support rota and maintenance agreement."
    : null,
  offeringRef: i === 9
    ? "Internal handbook: Deploy Kit / Getting started and support"
    : null,
  credit: i === 9
    ? "Originally built by Payments; shared with their permission."
    : null,
  reuseNotes: i === 9
    ? "Two teams chose the offering; a third kept its current deploy process."
    : null,
  outcome: i === 3
    ? "deferred"
    : i === 4
    ? "declined"
    : i === 9
    ? "adopted"
    : "active",
  decision: i === 3
    ? "Revisit in January when FinOps has support capacity."
    : i === 4
    ? "Not a fit for shared support. Source team retains care."
    : i === 9
    ? "Adopted by mutual agreement; use remains voluntary."
    : null,
  callId: i === 0 ? "team-access" : i === 6 ? "audit-trail" : null,
  readings: [
    {
      at: "2026-11-06T09:00:00.000Z",
      pullCount: 21 + i * 67,
      stage: stages[i],
    },
    { at: now, pullCount: 29 + i * 71, stage: stages[i] },
  ],
  facts: {
    latestVersion: "2026.11.06.1",
    labels: [],
    license: "MIT",
    repositoryVerified: true,
    scorePercentage: 92,
    pullCount: 29 + i * 71,
  },
}));
const calls = [
  openCall(
    {},
    "team-access",
    "Let teams request temporary access without a ticket queue.",
    "Developer Experience",
    now,
  ),
  openCall(
    {},
    "audit-trail",
    "Reusable evidence collection for quarterly controls.",
    "Security platform",
    now,
  ),
  {
    ...openCall(
      {},
      "old-onboarding",
      "A supported deploy starter.",
      "Developer Experience",
      now,
    ),
    closedAt: now,
    closeNote: "Met by Deploy Kit; new needs get a new call.",
  },
];
const variants = [
  "all-stages",
  "four-tracked",
  "empty",
  "unavailable",
  "crowded",
];

Deno.serve(
  { hostname: "0.0.0.0", port: Number(Deno.env.get("PORT") ?? 8000) },
  (request) => {
    const variant = new URL(request.url).searchParams.get("view") ??
      "all-stages";
    if (!variants.includes(variant)) {
      return new Response("Unknown preview", {
        status: 404,
      });
    }
    const shown = variant === "empty"
      ? []
      : variant === "four-tracked"
      ? [candidates[1], candidates[3], candidates[7], candidates[9]]
      : variant === "crowded"
      ? names.map((name, i) => ({
        ...candidates[i % candidates.length],
        extension: name,
        stage: 1 as const,
        outcome: "active" as const,
      }))
      : candidates;
    const page = renderReportHtml(
      shown,
      now,
      variant === "empty" ? [] : calls,
      {
        collectives: ["demo-platform", "demo-tools"],
        extensions: names,
        complete: variant !== "unavailable",
      },
    );
    const banner =
      `<aside style="padding:12px 24px;border-bottom:1px solid #344054;color:#c4b5fd;font-size:12px"><strong>Synthetic preview</strong> · 19 fictional extensions, not your live data.<nav aria-label="Preview scenarios" style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px">${
        variants.map((name) =>
          `<a href="?view=${name}"${
            variant === name ? ' aria-current="page"' : ""
          }>${name.replaceAll("-", " ")}</a>`
        ).join("")
      }</nav></aside>`;
    return new Response(page.replace("</header>", `</header>${banner}`), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
);
