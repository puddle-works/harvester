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

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

const HTML_STYLE = `
:root{color-scheme:dark;--bg:#0f1219;--card:#1c2233;--text:#e8ecf1;--text2:#8b95a8;--text3:#5a6478;--accent:#5ec4d4;--warn:#fcd34d;--border:rgba(255,255,255,.06);--border2:rgba(255,255,255,.12)}
*{box-sizing:border-box;margin:0;padding:0}
body{font:14px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased}
header{display:flex;align-items:center;gap:8px;padding:0 24px;min-height:60px;border-bottom:1px solid var(--border);color:var(--accent)}
.brand-name{font-size:18px;font-weight:600;letter-spacing:-.02em;color:var(--text)}
.brand-name span{color:var(--accent)}
.brand-app{font-size:13px;font-weight:500;color:var(--text2);border-left:1px solid var(--border2);padding-left:10px;margin-left:2px}
main{max-width:860px;margin:0 auto;padding:40px 24px 64px}
h1{font-size:22px;font-weight:600;letter-spacing:-.01em;margin-bottom:6px}
.sub{font-size:13px;color:var(--text2);margin-bottom:24px}
h2{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin:32px 0 12px}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;padding:14px 18px}
.top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.name{flex:1;min-width:0;font-weight:500;overflow-wrap:anywhere}
.meta{font-size:12px;color:var(--text2)}
.badge{display:inline-block;font-size:11px;font-weight:500;padding:2px 8px;border-radius:12px;border:1px solid transparent;white-space:nowrap}
.badge.ready{background:rgba(94,196,212,.12);color:var(--accent);border-color:rgba(94,196,212,.25)}
.badge.waiting{background:rgba(252,211,77,.12);color:var(--warn);border-color:rgba(252,211,77,.25)}
.track{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin:12px 0 8px}
.track i{height:6px;border-radius:3px;background:rgba(255,255,255,.06)}
.track i.past{background:var(--text3)}
.track i.now{background:var(--text2)}
.track i.now.ready{background:var(--accent)}
.state{font-size:13px;color:var(--text2)}
ul{margin:6px 0 0;padding-left:20px;font-size:13px;color:var(--text2)}
li{margin-bottom:4px}
.key{font-size:12px;color:var(--text2);margin-top:24px}
`;

const MARK =
  `<svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="7" r="3" fill="currentColor"/><ellipse cx="16" cy="19" rx="5" ry="2.25" fill="currentColor"/><ellipse cx="16" cy="19" rx="9" ry="4.5" stroke="currentColor" stroke-width="1.5" opacity=".55"/><ellipse cx="16" cy="19" rx="14" ry="7" stroke="currentColor" stroke-width="1" opacity=".25"/></svg>`;

/** Render the report as one self-contained HTML page: a stage track per extension. */
export function renderReportHtml(candidates: Candidate[], now: string): string {
  const ready = (c: Candidate) =>
    blockers(c, (c.stage === 6 ? 0 : c.stage + 1) as Candidate["stage"])
      .length === 0;
  const waiting = candidates.filter((c) => !ready(c)).length;
  const title = candidates.length === 0
    ? "No extensions are tracked"
    : `${candidates.length - waiting} of ${candidates.length} ${
      candidates.length === 1 ? "extension" : "extensions"
    } can move on now; ${waiting} wait${
      waiting === 1 ? "s" : ""
    } on missing evidence`;
  const rows = candidates.map((c) => {
    const next = c.stage === 6 ? 0 : c.stage + 1;
    const stops = blockers(c, next as Candidate["stage"]);
    const last = c.readings.at(-1);
    const track = STAGE_NAMES.map((_, i) =>
      `<i class="${
        i < c.stage
          ? "past"
          : i === c.stage
          ? `now${stops.length === 0 ? " ready" : ""}`
          : ""
      }"></i>`
    ).join("");
    const items = [...stops, ...flags(c).map((f) => `Flag: ${f}`)];
    return `<div class="card"><div class="top"><span class="name">${
      escapeHtml(c.extension)
    }</span><span class="meta">${c.stage} ${STAGE_NAMES[c.stage]} · ${
      last ? last.pullCount.toLocaleString("en-GB") : "–"
    } pulls · ${change(c)}</span><span class="badge ${
      stops.length === 0 ? "ready" : "waiting"
    }">${stops.length === 0 ? "Ready" : "Waiting"}</span></div>` +
      `<div class="track">${track}</div>` +
      `<div class="state">${
        stops.length === 0
          ? `Ready to move to stage ${next}.`
          : `Before stage ${next}:`
      } Steward: ${
        escapeHtml(c.steward ?? "none named")
      }. Cycle ${c.cycle}.</div>${
        items.length === 0
          ? ""
          : `<ul>${items.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
      }</div>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="dark">` +
    `<title>Harvester report</title><style>${HTML_STYLE}</style></head><body>` +
    `<header>${MARK}<span class="brand-name">puddle <span>works</span></span>` +
    `<span class="brand-app">Harvester</span></header><main>` +
    `<h1>${title}</h1><p class="sub">Report taken ${escapeHtml(now)}.</p>` +
    `<h2>Tracked extensions</h2>${rows}` +
    `<p class="key">${
      STAGE_NAMES.map((n, i) => `${i} ${n}`).join(" · ")
    }. The current stage is teal when the extension can move on and grey when something blocks it.</p>` +
    `</main></body></html>\n`;
}
