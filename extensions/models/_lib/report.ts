/**
 * Collective inventory, harvesting wave and evidence. Pure renderers so
 * reports and previews share the same output without registry access.
 *
 * @module
 */
import {
  blockers,
  type Candidate,
  type CapabilityCall,
  flags,
  STAGE_NAMES,
} from "./harvest.ts";

/** A scoped registry listing; incomplete listings never imply zero untracked. */
export interface CollectiveInventory {
  collectives: string[];
  extensions: string[];
  complete: boolean;
}

function untrackedNames(
  candidates: Candidate[],
  inventory?: CollectiveInventory,
): string[] {
  const tracked = new Set(candidates.map((c) => c.extension));
  return inventory?.complete
    ? [...new Set(inventory.extensions)].filter((name) => !tracked.has(name))
      .sort()
    : [];
}

function inventoryNote(inventory?: CollectiveInventory): string {
  if (!inventory?.complete) {
    return "Collective inventory unavailable. Only tracked extensions are shown; the untracked count is unknown.";
  }
  return inventory.collectives.length
    ? `Own collectives only: ${
      inventory.collectives.map((c) => `@${c}`).join(", ")
    }. Registry listing plus tracked records; no stages inferred from registry metadata.`
    : "This identity has no collectives. No registry extensions are included.";
}

/** Each call with the tracked extensions that answer it, open calls first. */
function callRows(calls: CapabilityCall[], candidates: Candidate[]) {
  return [...calls]
    .sort((a, b) => Number(!!a.closedAt) - Number(!!b.closedAt))
    .map((call) => ({
      call,
      answers: candidates.filter((c) => c.callId === call.id)
        .map((c) => c.extension),
    }));
}

function callStatus(call: CapabilityCall, answers: string[]): string {
  if (call.closedAt) return `Closed: ${call.closeNote}`;
  return answers.length === 0
    ? "Open. No candidate has answered yet."
    : `Open. Answered by ${answers.join(", ")}.`;
}

function change(c: Candidate): string {
  const r = c.readings;
  if (r.length === 0) return "–";
  if (r.length === 1) return "first reading";
  const d = r[r.length - 1].pullCount - r[r.length - 2].pullCount;
  return d > 0 ? `+${d}` : `${d}`;
}

function progress(c: Candidate) {
  if (c.outcome === "adopted") {
    return {
      ready: false,
      label: "Adopted",
      message:
        "Available for voluntary use. Record reuseNotes; start new discovery separately.",
      stops: [],
    };
  }
  if (c.outcome === "deferred" || c.outcome === "declined") {
    return {
      ready: false,
      label: c.outcome === "deferred" ? "Deferred" : "Declined",
      message:
        "Not progressing. The current owner retains care; use decide with outcome=active and a reason to resume.",
      stops: [],
    };
  }
  if (c.stage === 6) {
    return {
      ready: false,
      label: "Review adoption",
      message:
        "Legacy stage 6 is not proof of an agreed adoption. Record the evidence and use decide.",
      stops: [],
    };
  }
  const next = (c.stage + 1) as Candidate["stage"];
  const stops = blockers(c, next);
  return {
    ready: stops.length === 0,
    label: stops.length === 0 ? "Ready" : "Waiting",
    message: c.stage === 5
      ? stops.length === 0
        ? "Ready for an adoption decision; adopting is optional."
        : "Before an adoption decision:"
      : stops.length === 0
      ? `Ready to move to stage ${next}.`
      : `Before stage ${next}:`,
    stops,
  };
}

/** Render the report as markdown. */
export function renderReport(
  candidates: Candidate[],
  now: string,
  calls: CapabilityCall[] = [],
  inventory?: CollectiveInventory,
): string {
  const untracked = untrackedNames(candidates, inventory);
  const out = [
    `# Harvester report`,
    ``,
    `Taken ${now}.`,
    ``,
    inventoryNote(inventory),
    ``,
  ];
  if (inventory?.complete) {
    out.push(
      `## Not yet tracked (${untracked.length})`,
      ``,
      "No harvesting stage has been assigned.",
      ``,
    );
    for (const name of untracked) out.push(`- ${name}`);
    out.push(``);
  }
  if (calls.length > 0) {
    out.push(`## Calls for capabilities`, ``);
    for (const { call, answers } of callRows(calls, candidates)) {
      out.push(
        `- ${call.id} (${call.platform}): ${call.need} ${
          callStatus(call, answers)
        }`,
      );
    }
    out.push(``);
  }
  if (candidates.length === 0) {
    out.push("No extensions are tracked.");
    return out.join("\n") + "\n";
  }
  out.push(
    "| Extension | Stage | Outcome | Pulls | Change since last reading |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const c of candidates) {
    const last = c.readings.at(-1);
    out.push(
      `| ${c.extension} | ${c.stage} ${STAGE_NAMES[c.stage]} | ${c.outcome} | ${
        last ? last.pullCount : "–"
      } | ${change(c)} |`,
    );
  }
  out.push("");
  for (const c of candidates) {
    const state = progress(c);
    out.push(
      `## ${c.extension}`,
      ``,
      `Platform: ${c.platform ?? "none named"}. Steward: ${
        c.steward ?? "none named"
      }.`,
      ``,
      state.message,
    );
    if (c.callId) out.push(`Answers call: ${c.callId}`);
    if (c.decision) out.push(`Decision notes: ${c.decision}`);
    if (c.reuseNotes) out.push(`Reuse review: ${c.reuseNotes}`);
    for (const s of state.stops) out.push(`- ${s}`);
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
main{max-width:1500px;margin:0 auto;padding:32px 32px 64px}
h1{font-size:30px;font-weight:600;letter-spacing:-.03em;margin-bottom:6px}
.sub{font-size:13px;color:var(--text2);margin-bottom:24px}
h2{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text2);margin:32px 0 12px}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;padding:14px 18px}
.top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.name{flex:1 1 180px;min-width:0;font-weight:500;overflow-wrap:anywhere}
.meta{font-size:12px;color:var(--text2)}
.badge{display:inline-block;font-size:11px;font-weight:500;padding:2px 8px;border-radius:12px;border:1px solid transparent;white-space:nowrap}
.badge.ready{background:rgba(94,196,212,.12);color:var(--accent);border-color:rgba(94,196,212,.25)}
.badge.waiting{background:rgba(252,211,77,.12);color:var(--warn);border-color:rgba(252,211,77,.25)}
.badge.settled{color:var(--text2);border-color:var(--border2)}
.track{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin:12px 0 8px}
.track i{height:6px;border-radius:3px;background:rgba(255,255,255,.06)}
.track i.past{background:var(--text3)}
.track i.now{background:var(--text2)}
.track i.now.ready{background:var(--accent)}
.state{font-size:13px;color:var(--text2)}
ul{margin:6px 0 0;padding-left:20px;font-size:13px;color:var(--text2)}
li{margin-bottom:4px}
.key{font-size:12px;color:var(--text2);margin-top:24px}
a{color:var(--accent);text-underline-offset:3px}
a:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:var(--accent);margin-bottom:8px}
.intro{max-width:720px;color:var(--text2);margin-bottom:24px}
.summary{display:flex;gap:28px;flex-wrap:wrap;margin:24px 0}
.summary strong{font-size:26px;font-weight:500;color:var(--text);margin-right:6px}
.summary span{color:var(--text2);font-size:12px}
.scope{font-size:12px;color:var(--text2);margin-bottom:18px;max-width:900px}
.notice{border-left:3px solid var(--warn);padding:10px 14px;background:rgba(252,211,77,.06)}
.harvest{display:grid;grid-template-columns:200px minmax(0,1fr);gap:24px;align-items:start;margin:8px 0 16px}
.legend-title{font-size:15px;font-weight:600;line-height:1.3;margin-bottom:14px}
.legend{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.legend li{margin:0;padding:10px 12px;font-size:12px;line-height:1.4;color:var(--text2);background:#232a3d;border-radius:4px;box-shadow:0 4px 8px rgba(0,0,0,.35)}
.legend b{color:var(--text);font-weight:600}
.legend li:last-child{border:1px dashed #6d5fa8;background:none;box-shadow:none}
.flow{display:flex;align-items:center;gap:10px;font-size:11px;font-weight:600;color:var(--text2);margin:0 0 6px 22%}
.flow i{flex:0 0 220px;border-top:1px dashed var(--text3);position:relative}
.flow i::after{content:"";position:absolute;right:-2px;top:-6px;border:6px solid transparent;border-left-color:var(--text3)}
.canvas{position:relative;aspect-ratio:1000/770}
.canvas svg{position:absolute;inset:0;width:100%;height:100%}
.bg-group{fill:none;stroke:rgba(252,211,77,.28);stroke-width:3;stroke-dasharray:14 10}
.bg-platform{fill:rgba(120,150,220,.07);stroke:rgba(120,150,220,.18)}
.bg-label{fill:rgba(232,236,241,.24);font:13px Inter,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
.flow-path{fill:none;stroke:var(--accent);stroke-width:2}
.flow-path.back{stroke:#c4b5fd}
.stages{list-style:none;padding:0;margin:0}
.stage{position:absolute;left:calc(var(--x) * .1%);top:calc(var(--y) * 1% / 7.7);width:19%;margin:0;padding:6px 6px 8px;background:rgba(15,18,25,.88);border-radius:6px}
.stage:has(details[open]),.stage:focus-within{z-index:2}
.stage-head{display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;color:var(--text)}
.stage-number{flex:0 0 26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:#e8ecf1;color:#0f1219;font-size:13px;font-weight:600}
.stage:last-child .stage-number{background:#c4b5fd}
.stage h3{font-size:12px;font-weight:500;line-height:1.3}
.stage-count{display:block;font-size:10px;color:var(--text2)}
.stage-desc{display:none}
.stage-items{list-style:none;padding:0 0 0 34px;margin:0;display:grid;gap:2px}
.stage-items li{margin:0}
.stage-more summary{cursor:pointer;font-size:11px;color:var(--accent);margin:2px 0 0 34px}
.stage-more .stage-items{margin-top:2px}
.wave-item{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:0 6px;padding:1px 0 1px 7px;border-left:3px solid var(--text3);text-decoration:none;color:var(--text);line-height:1.35}
.wave-item:hover strong{text-decoration:underline;text-underline-offset:3px}
.wave-item .collective{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.wave-item strong{font-size:12px;font-weight:500;min-width:0}
.wave-status{flex:none;margin-left:auto;font-size:10px;color:var(--text2)}
.wave-item.ready{border-left:3px solid var(--accent)}
.wave-item.ready .wave-status{color:var(--accent)}
.wave-item.deferred{border-left:3px solid var(--warn)}
.wave-item.deferred .wave-status{color:var(--warn)}
.wave-item.declined{border-left:3px solid #fda4af}
.wave-item.declined .wave-status{color:#fda4af}
.wave-item.adopted{border-left:3px solid #c4b5fd}
.wave-item.adopted .wave-status{color:#c4b5fd}
.wave-item.call{border-left-style:dashed}
.stage-empty{font-size:11px;color:var(--text2);padding-left:34px}
.wave-caption{font-size:12px;color:var(--text2);max-width:980px}
.untracked{border:1px dashed var(--border2);border-radius:12px;padding:20px;margin:24px 0 32px}
.untracked h2{margin:0 0 6px;color:var(--text);font-size:14px;letter-spacing:0;text-transform:none}
.untracked p{font-size:12px;color:var(--text2)}
.untracked ul{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin-top:14px}
.untracked li{margin:0;border:1px solid var(--border2);padding:6px 10px;border-radius:6px;overflow-wrap:anywhere;max-width:100%}
.evidence{max-width:1000px;margin:0 auto}
.card[id]{scroll-margin-top:24px}
.card:target{border-color:var(--accent);outline:1px solid var(--accent)}
.back{display:inline-block;font-size:12px;margin-top:10px}
@media(max-width:1279px){
.harvest{display:block}
.legend-col,.flow,.canvas svg{display:none}
.canvas{aspect-ratio:auto}
.stages{border-left:2px solid #345660;margin:24px 0 0 17px;padding-left:28px}
.stage{position:static;width:auto;padding:0 0 28px;background:none;border:0;box-shadow:none}
.stage-head{display:block;position:relative;margin-bottom:4px}
.stage-number{position:absolute;left:-46px;top:0;width:34px;height:34px;border-radius:50%;font-size:15px}
.stage h3{padding-top:5px;font-size:15px}
.stage-count{margin-top:2px;font-size:11px}
.stage-desc{display:block;font-size:12px;color:var(--text2);margin-bottom:10px;max-width:640px}
.stage-items{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 16px;padding:0}
.stage-more summary{margin-left:0}
.stage-empty{padding:0}
.wave-item{display:block;padding:4px 0 4px 10px}
.wave-item .collective{position:static;width:auto;height:auto;clip:auto;display:block;font-size:10px;color:var(--text2)}
.wave-item strong{font-size:13px}
.wave-status{display:block;font-size:12px;margin-top:4px}
.stage:last-child{padding-bottom:0}
}
@media(max-width:1000px){
main{padding:24px 20px 48px}
}
@media(max-width:480px){
header{padding:0 20px}
h1{font-size:26px}
.summary{gap:12px 20px}
.summary strong{font-size:23px}
.stage-items{grid-template-columns:1fr}
.untracked{padding:16px}
.card{padding:14px}
}
`;

const MARK =
  `<svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="7" r="3" fill="currentColor"/><ellipse cx="16" cy="19" rx="5" ry="2.25" fill="currentColor"/><ellipse cx="16" cy="19" rx="9" ry="4.5" stroke="currentColor" stroke-width="1.5" opacity=".55"/><ellipse cx="16" cy="19" rx="14" ry="7" stroke="currentColor" stroke-width="1" opacity=".25"/></svg>`;

/** Names stay readable on the wave; the full collective remains visible. */
function waveName(name: string): string {
  const slash = name.indexOf("/") + 1;
  return `<span class="collective">${
    escapeHtml(name.slice(0, slash))
  }</span><strong>${escapeHtml(name.slice(slash))}</strong>`;
}

/** Skelton's legend for 0–5 (printed page 69). Node 6 has none there. */
const LEGEND = [
  "Core platform areas post calls for key capabilities needed.",
  "A product area (grouping) develops a capability that enhances flow: a candidate for sharing.",
  "The product area defines the value proposition in terms of wider organisational value, with incentives to share.",
  "Showcase the offering to find “buyers”.",
  "Core platform areas reach out to negotiate stewardship.",
  "A period of collaboration and possible adoption: value recognised and attributed back to the original grouping.",
  "Harvester’s local interpretation: adopted by agreement and offered for voluntary use. Skelton’s legend has no entry for 6.",
];

/**
 * Where each stage sits on a 1000 × 770 canvas, after the diagram: 0 at the
 * bottom left, 1 and 2 high up, 3 to 5 stepping down on the right, and 6 at
 * the bottom with the loop back to 0. Arrows meet each card 20 units below
 * its top, beside its number, so a card's height never moves them.
 */
const NODES = [
  [20, 470],
  [330, 30],
  [560, 60],
  [790, 215],
  [520, 320],
  [790, 540],
  [540, 560],
];
const FLOW = [
  "M210 490 C290 490 250 50 324 50",
  "M520 50 C540 50 536 80 554 80",
  "M750 80 C860 80 885 120 885 209",
  "M790 235 C680 235 615 250 615 314",
  "M710 340 C800 340 885 460 885 534",
  "M790 560 C765 560 760 580 736 580",
];
const LOOP =
  "M540 580 C495 580 500 748 410 748 L70 748 C25 748 8 725 8 650 L8 530 C8 500 10 490 14 490";
const BACKGROUND =
  `<rect class="bg-group" x="40" y="10" width="950" height="195" rx="18"/>` +
  `<text class="bg-label" x="62" y="36">Customer-facing teams (stream-aligned)</text>` +
  `<rect class="bg-platform" x="780" y="25" width="200" height="90" rx="4"/>` +
  `<text class="bg-label" x="880" y="62" text-anchor="middle">Specific platform</text>` +
  `<rect class="bg-group" x="40" y="215" width="950" height="175" rx="18"/>` +
  `<text class="bg-label" x="62" y="242">Customer-facing teams (stream-aligned)</text>` +
  `<rect class="bg-platform" x="240" y="405" width="250" height="80" rx="4"/>` +
  `<text class="bg-label" x="365" y="450" text-anchor="middle">Higher-level platform</text>` +
  `<rect class="bg-platform" x="40" y="510" width="950" height="250" rx="4"/>` +
  `<text class="bg-label" x="300" y="540" text-anchor="middle">Lower-level platform</text>`;
/** Items shown on a stage card before the rest fold into "+N more". */
const SHOWN = 5;

function renderWave(candidates: Candidate[], calls: CapabilityCall[]): string {
  const open = calls.filter((call) => !call.closedAt);
  const stages = STAGE_NAMES.map((name, stage) => {
    const here = candidates.filter((c) => c.stage === stage);
    const items = here.map((c) => {
      const state = progress(c);
      return `<li><a class="wave-item ${
        state.ready ? "ready" : c.outcome
      }" href="#extension-${candidates.indexOf(c)}">${
        waveName(c.extension)
      }<span class="wave-status">${state.label}</span></a></li>`;
    });
    if (stage === 0) {
      items.unshift(
        ...open.map((call) =>
          `<li><a class="wave-item call" href="#call-${
            calls.indexOf(call)
          }" title="Open call from ${
            escapeHtml(call.platform)
          }"><span class="collective">Open call · ${
            escapeHtml(call.platform)
          }</span><strong>${
            escapeHtml(call.id)
          }</strong><span class="wave-status">${
            candidates.filter((c) => c.callId === call.id).length
          } answering</span></a></li>`
        ),
      );
    }
    const count = `${here.length} extension${here.length === 1 ? "" : "s"}${
      stage === 0
        ? ` · ${open.length} open call${open.length === 1 ? "" : "s"}`
        : ""
    }`;
    const [x, y] = NODES[stage];
    const more = items.slice(SHOWN);
    const list = items.length === 0
      ? `<p class="stage-empty">Nothing here yet</p>`
      : `<ul class="stage-items">${items.slice(0, SHOWN).join("")}</ul>` +
        (more.length
          ? `<details class="stage-more"><summary>+${more.length} more</summary><ul class="stage-items">${
            more.join("")
          }</ul></details>`
          : "");
    return `<li class="stage" style="--x:${x};--y:${y}" data-stage="${stage}"><div class="stage-head"><span class="stage-number">${stage}</span><div><h3>${name}</h3><span class="stage-count">${count}</span></div></div><p class="stage-desc">${
      LEGEND[stage]
    }</p>${list}</li>`;
  }).join("");
  const arrow = (id: string, color: string) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="${color}"/></marker>`;
  return `<section id="wave" tabindex="-1" aria-label="Harvesting wave">
    <div class="harvest">
      <div class="legend-col"><p class="legend-title">Learning and sharing dynamics: harvesting</p>
        <ol class="legend">${
    LEGEND.map((text, i) => `<li><b>${i}</b> · ${text}</li>`).join("")
  }</ol></div>
      <div><p class="flow" aria-hidden="true">Flow of value <i></i></p>
        <div class="canvas"><svg viewBox="0 0 1000 770" aria-hidden="true">
          <defs>${arrow("arrow", "#5ec4d4")}${
    arrow("arrow-back", "#c4b5fd")
  }</defs>
          ${BACKGROUND}
          ${
    FLOW.map((d) =>
      `<path class="flow-path" d="${d}" marker-end="url(#arrow)"/>`
    )
      .join("")
  }
          <path class="flow-path back" d="${LOOP}" marker-end="url(#arrow-back)"/>
        </svg><ol class="stages">${stages}</ol></div>
      </div>
    </div>
    <p class="wave-caption">After Matthew Skelton’s harvesting diagram (Conflux 2024). The team and platform bands are the diagram’s context only: Harvester does not record which team or platform an extension belongs to. Select an extension or call for its evidence below. Deferred and declined extensions stay at their recorded stage; adoption is optional. New discovery does not reset an adopted extension.</p>
  </section>`;
}

/** Render one self-contained page; no scripts or external assets required. */
export function renderReportHtml(
  candidates: Candidate[],
  now: string,
  calls: CapabilityCall[] = [],
  inventory?: CollectiveInventory,
): string {
  const callCards = callRows(calls, candidates).map(({ call, answers }) =>
    `<div class="card" id="call-${
      calls.indexOf(call)
    }" tabindex="-1"><div class="top"><span class="name">${
      escapeHtml(call.id)
    }</span><span class="meta">${escapeHtml(call.platform)}</span>` +
    `<span class="badge ${call.closedAt ? "settled" : "waiting"}">${
      call.closedAt ? "Closed" : "Open"
    }</span></div><div class="state">${escapeHtml(call.need)}</div>` +
    `<div class="state">${
      escapeHtml(callStatus(call, answers))
    }</div><a class="back" href="#wave">Back to wave ↑</a></div>`
  ).join("");
  const states = candidates.map(progress);
  const ready = states.filter((s) => s.ready).length;
  const waiting = states.filter((s) => s.label === "Waiting").length;
  const settled = candidates.length - ready - waiting;
  const title = candidates.length === 0
    ? "No extensions are tracked"
    : `${ready} ready · ${waiting} waiting for evidence · ${settled} adopted, paused or under review`;
  const rows = candidates.map((c, index) => {
    const state = states[index];
    const last = c.readings.at(-1);
    const track = STAGE_NAMES.map((_, i) =>
      `<i class="${
        i < c.stage
          ? "past"
          : i === c.stage
          ? `now${state.ready ? " ready" : ""}`
          : ""
      }"></i>`
    ).join("");
    const items = [...state.stops, ...flags(c).map((f) => `Flag: ${f}`)];
    return `<div class="card" id="extension-${index}" tabindex="-1"><div class="top"><span class="name">${
      escapeHtml(c.extension)
    }</span><span class="meta">${c.stage} ${STAGE_NAMES[c.stage]} · ${
      last ? last.pullCount.toLocaleString("en-GB") : "–"
    } pulls · ${change(c)}</span><span class="badge ${
      state.ready ? "ready" : state.label === "Waiting" ? "waiting" : "settled"
    }">${state.label}</span></div>` +
      `<div class="track">${track}</div>` +
      `<div class="state">${state.message} Platform: ${
        escapeHtml(c.platform ?? "none named")
      }. Steward: ${escapeHtml(c.steward ?? "none named")}.</div>${
        c.callId
          ? `<div class="state">Answers call: ${escapeHtml(c.callId)}</div>`
          : ""
      }${
        c.decision
          ? `<div class="state">Decision notes: ${escapeHtml(c.decision)}</div>`
          : ""
      }${
        c.reuseNotes
          ? `<div class="state">Reuse review: ${escapeHtml(c.reuseNotes)}</div>`
          : ""
      }${
        items.length === 0
          ? ""
          : `<ul>${items.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
      }<a class="back" href="#wave">Back to wave ↑</a></div>`;
  }).join("");
  const untracked = untrackedNames(candidates, inventory);
  const openCalls = calls.filter((call) => !call.closedAt).length;
  const inventorySection =
    `<section class="untracked" aria-label="Not yet tracked"><h2>Not yet tracked${
      inventory?.complete ? ` · ${untracked.length}` : ""
    }</h2><p>${
      inventory?.complete
        ? "In your collective registry, outside the wave. No harvesting stage assigned; tracking is a deliberate choice."
        : "The registry listing could not be loaded. This is not a count of zero."
    }</p>${
      untracked.length
        ? `<ul>${
          untracked.map((name) => `<li>${escapeHtml(name)}</li>`).join("")
        }</ul>`
        : inventory?.complete
        ? `<p>No untracked extensions in this listing.</p>`
        : ""
    }</section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="dark">` +
    `<title>Harvester report</title><style>${HTML_STYLE}</style></head><body>` +
    `<header>${MARK}<span class="brand-name">puddle <span>works</span></span>` +
    `<span class="brand-app">Harvester</span></header><main>` +
    `<p class="eyebrow">Collective harvesting</p><h1>From local innovation to shared capability</h1>` +
    `<p class="intro">A wave of discovery, collaboration and voluntary adoption. Each extension sits at its recorded activity, not a score or a deadline.</p>` +
    `<div class="summary"><span><strong>${
      inventory?.complete ? candidates.length + untracked.length : "?"
    }</strong>extensions</span><span><strong>${candidates.length}</strong>tracked</span><span><strong>${
      inventory?.complete ? untracked.length : "?"
    }</strong>not yet tracked</span><span><strong>${openCalls}</strong>open calls</span></div>` +
    `<p class="scope${inventory?.complete ? "" : " notice"}">${
      escapeHtml(inventoryNote(inventory))
    }</p>` +
    renderWave(candidates, calls) + inventorySection +
    `<div class="evidence"><h2>Evidence &amp; decisions</h2><p class="sub">${title}<br>Report taken ${
      escapeHtml(now)
    }.</p>` +
    (callCards ? `<h2>Calls for capabilities</h2>${callCards}` : "") +
    `<h2>Tracked extensions</h2>${rows}` +
    `<p class="key">${
      STAGE_NAMES.map((n, i) => `${i} ${n}`).join(" · ")
    }. Teal marks evidence ready for the next activity or decision, not an obligation to adopt. Pull counts are context, not proof of value.</p>` +
    `<p class="key">Wave adapted from Matthew Skelton’s harvesting diagram, Conflux 2024, printed page 69. <a href="https://files.speakerdeck.com/presentations/d0d5e587dd6e47e9912082ac1c317272/slide_66.jpg">View the source diagram</a>. The wave groups activities; it does not assign teams to platforms.</p></div></main></body></html>\n`;
}
