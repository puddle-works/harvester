/**
 * The weekly report: one table row per tracked extension, then what blocks
 * each from moving on. Pure, so it is tested without swamp.
 *
 * @module
 */
import { blockers, type Candidate, flags, STAGE_NAMES } from "./harvest.ts";

function change(c: Candidate): string {
  const r = c.readings;
  if (r.length === 0) return "–";
  if (r.length === 1) return "first reading";
  const d = r[r.length - 1].pullCount - r[r.length - 2].pullCount;
  return d > 0 ? `+${d}` : `${d}`;
}

/** Render the report as markdown. */
export function renderReport(candidates: Candidate[], now: string): string {
  const out = [`# Harvester report`, ``, `Taken ${now}.`, ``];
  if (candidates.length === 0) {
    out.push("No extensions are tracked.");
    return out.join("\n") + "\n";
  }
  out.push(
    "| Extension | Stage | Pulls | Change since last reading |",
    "| --- | --- | --- | --- |",
  );
  for (const c of candidates) {
    const last = c.readings.at(-1);
    out.push(
      `| ${c.extension} | ${c.stage} ${STAGE_NAMES[c.stage]} | ${
        last ? last.pullCount : "–"
      } | ${change(c)} |`,
    );
  }
  out.push("");
  for (const c of candidates) {
    const next = c.stage === 6 ? 0 : c.stage + 1;
    const stops = blockers(c, next as Candidate["stage"]);
    out.push(
      `## ${c.extension}`,
      ``,
      `Steward: ${c.steward ?? "none named"}. Cycle ${c.cycle}.`,
      ``,
    );
    out.push(
      stops.length === 0
        ? `Ready to move to stage ${next}.`
        : `Before stage ${next}:`,
    );
    for (const s of stops) out.push(`- ${s}`);
    for (const f of flags(c)) out.push(`- Flag: ${f}`);
    out.push("");
  }
  return out.join("\n");
}
