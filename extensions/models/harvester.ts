/**
 * @puddleworks/harvester — moves swamp extensions through the stages of
 * Matthew Skelton's harvesting diagram (Team Topologies, Conflux 2024).
 *
 * It records and reports; a person decides. It never deprecates, transfers or
 * contacts anyone. A platform may track a capability from any collective, as
 * Skelton's platform harvests from outside itself. Only `username` and
 * `collectives` are read from the account.
 *
 * Output: a `candidates` resource holding every call for capabilities and
 * every tracked extension, and the weekly `report` as a markdown file and as
 * an HTML page.
 *
 * @module
 */
import { z } from "npm:zod@4";
import {
  addReading,
  advance,
  answerCall,
  type Call,
  type Candidate,
  closeCall,
  decide,
  newCall,
  newCandidate,
  type Outcome,
  parseInfo,
  parseWhoami,
  readToday,
  record,
  type RegistryFacts,
  type Stage,
} from "./_lib/harvest.ts";
import { renderReport, renderReportHtml } from "./_lib/report.ts";

/** The model takes no settings. */
export const GlobalArgsSchema = z.object({});

const StageSchema = z.number().int().min(0).max(6);
const OutcomeSchema = z.enum(["active", "deferred", "declined", "adopted"]);

const CandidateSchema = z.object({
  extension: z.string(),
  stage: StageSchema,
  cycle: z.number().int(),
  // Old labels and free-text decisions cannot establish mutual agreement.
  outcome: OutcomeSchema.default("active"),
  decisions: z.array(z.object({
    outcome: OutcomeSchema,
    note: z.string(),
    at: z.string(),
  })).default([]),
  trackedAt: z.string(),
  stageEnteredAt: z.string(),
  steward: z.string().nullable(),
  platform: z.string().nullable().default(null),
  callId: z.string().nullable().default(null),
  requestRef: z.string().nullable(),
  discoveryNotes: z.string().nullable().default(null),
  flowEvidence: z.string().nullable().default(null),
  valueStatement: z.string().nullable(),
  showcases: z.array(z.object({ where: z.string(), at: z.string() })),
  interest: z.string().nullable().default(null),
  negotiationNotes: z.string().nullable(),
  collaborationAgreement: z.string().nullable().default(null),
  collaborationNotes: z.string().nullable().default(null),
  adoptionAgreement: z.string().nullable().default(null),
  offeringRef: z.string().nullable().default(null),
  reuseNotes: z.string().nullable().default(null),
  decision: z.string().nullable(),
  credit: z.string().nullable(),
  baselinePulls: z.number().nullable(),
  readings: z.array(
    z.object({ at: z.string(), pullCount: z.number(), stage: StageSchema }),
  ),
  history: z.array(
    z.object({
      from: StageSchema,
      to: StageSchema,
      at: z.string(),
      note: z.string(),
    }),
  ),
  facts: z.object({
    latestVersion: z.string().nullable(),
    labels: z.array(z.string()),
    license: z.string().nullable(),
    repositoryVerified: z.boolean(),
    scorePercentage: z.number().nullable(),
    pullCount: z.number(),
  }).nullable(),
});

const CallSchema = z.object({
  id: z.string(),
  need: z.string(),
  platform: z.string(),
  ref: z.string().nullable(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  closeNote: z.string().nullable(),
});

/** What is stored: every tracked extension by name, and every call by id. */
export const CandidatesSchema = z.object({
  candidates: z.record(z.string(), CandidateSchema),
  // Records written before calls existed have none.
  calls: z.record(z.string(), CallSchema).default({}),
});

/** How the model reads the registry. Tests pass a stub. */
export interface RegistryPort {
  whoami(): Promise<{ username: string; collectives: string[] }>;
  info(extension: string): Promise<RegistryFacts>;
}

async function swampJson(args: string[]): Promise<Record<string, unknown>> {
  const out = await new Deno.Command("swamp", {
    args: [...args, "--json"],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!out.success) {
    throw new Error(
      `swamp ${args.join(" ")} failed: ${new TextDecoder().decode(out.stderr)}`,
    );
  }
  return JSON.parse(new TextDecoder().decode(out.stdout));
}

/** The real registry, read through the swamp CLI. */
export const swampRegistry: RegistryPort = {
  whoami: async () => parseWhoami(await swampJson(["auth", "whoami"])),
  info: async (extension) =>
    parseInfo(await swampJson(["extension", "info", extension])),
};

interface Ctx {
  readResource?: (name: string) => Promise<Record<string, unknown> | null>;
  writeResource: (
    spec: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
  createFileWriter: (
    spec: string,
    name: string,
  ) => { writeText: (text: string) => Promise<unknown> };
  logger: {
    info: (msg: string, props: Record<string, unknown>) => void;
    warn: (msg: string, props: Record<string, unknown>) => void;
  };
}

interface Store {
  candidates: Record<string, Candidate>;
  calls: Record<string, Call>;
}

async function load(context: Ctx): Promise<Store> {
  const stored = await context.readResource?.("candidates");
  return CandidatesSchema.parse(stored ?? { candidates: {} }) as Store;
}

async function save(context: Ctx, store: Store) {
  const handle = await context.writeResource("candidates", "candidates", {
    candidates: store.candidates,
    calls: store.calls,
  });
  return { dataHandles: [handle] };
}

function tracked(store: Store, extension: string): Candidate {
  // Own keys only: "constructor" or "toString" would match any object.
  const c = Object.hasOwn(store.candidates, extension)
    ? store.candidates[extension]
    : undefined;
  if (!c) throw new Error(`${extension} is not tracked. Run 'track' first.`);
  return c;
}

function called(store: Store, id: string): Call {
  const call = Object.hasOwn(store.calls, id) ? store.calls[id] : undefined;
  if (!call) throw new Error(`There is no call '${id}'. Run 'openCall' first.`);
  return call;
}

const Registry = z.any().optional().describe("Test hook: a registry stub.");

/** The model type. */
export const model = {
  type: "@puddleworks/harvester",
  version: "2026.11.12.1",
  globalArguments: GlobalArgsSchema,
  upgrades: [
    {
      toVersion: "2026.11.06.3",
      description: "Links the repository; no schema changes.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.11.06.4",
      description: "Corrects the README; no schema changes.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.11.09.1",
      description: "Adds an HTML report file; no schema changes.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.11.12.1",
      description:
        "Adds calls for capabilities, tracking from any collective, and negotiated adoption evidence and outcomes. Existing resource evidence is preserved; missing fields default on read without inferring adoption.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
  ],
  resources: {
    candidates: {
      description:
        "Every call for capabilities, and every tracked extension with its stage, evidence and readings.",
      schema: CandidatesSchema,
      lifetime: "infinite" as const,
      // History lives inside the document, but keep many versions anyway.
      garbageCollection: 200,
    },
  },
  files: {
    report: {
      description: "The weekly stage report.",
      contentType: "text/markdown",
      lifetime: "infinite" as const,
      garbageCollection: 52,
    },
    reportHtml: {
      description: "The weekly stage report as a page with a stage track.",
      contentType: "text/html",
      lifetime: "infinite" as const,
      garbageCollection: 52,
    },
  },
  methods: {
    openCall: {
      description:
        "Open a call for a capability a platform needs (stage 0). No candidate is needed yet, and several may answer.",
      arguments: z.object({
        id: z.string().describe("A short id, such as faster-onboarding."),
        need: z.string().describe("The capability needed and for whom."),
        platform: z.string().describe("The platform asking."),
        ref: z.string().optional().describe(
          "Where the call is posted, such as a Lab request.",
        ),
      }),
      execute: async (
        args: { id: string; need: string; platform: string; ref?: string },
        context: Ctx,
      ) => {
        const store = await load(context);
        if (Object.hasOwn(store.calls, args.id)) {
          throw new Error(`There is already a call '${args.id}'.`);
        }
        store.calls[args.id] = newCall(
          args.id,
          args.need,
          args.platform,
          args.ref ?? null,
        );
        context.logger.info("Opened call {id}", { id: args.id });
        return save(context, store);
      },
    },
    answerCall: {
      description: "Link a tracked extension to the open call it answers.",
      arguments: z.object({ extension: z.string(), call: z.string() }),
      execute: async (
        args: { extension: string; call: string },
        context: Ctx,
      ) => {
        const store = await load(context);
        store.candidates[args.extension] = answerCall(
          tracked(store, args.extension),
          called(store, args.call),
        );
        return save(context, store);
      },
    },
    closeCall: {
      description:
        "Close a call with a reason: answered, withdrawn or no longer needed. Its candidates stay tracked.",
      arguments: z.object({ id: z.string(), note: z.string().trim().min(1) }),
      execute: async (args: { id: string; note: string }, context: Ctx) => {
        const store = await load(context);
        store.calls[args.id] = closeCall(called(store, args.id), args.note);
        context.logger.info("Closed call {id}", { id: args.id });
        return save(context, store);
      },
    },
    track: {
      description:
        "Start tracking an extension from any collective as a candidate (stage 1, or 0 for older records). Pass call to answer an open call.",
      arguments: z.object({
        extension: z.string().describe("@collective/name"),
        stage: z.number().int().min(0).max(1).default(1),
        call: z.string().optional().describe("The id of the call it answers."),
      }),
      execute: async (
        args: { extension: string; stage: number; call?: string },
        context: Ctx,
      ) => {
        const store = await load(context);
        if (Object.hasOwn(store.candidates, args.extension)) {
          throw new Error(`${args.extension} is already tracked.`);
        }
        const candidate = newCandidate(args.extension, args.stage as Stage);
        store.candidates[args.extension] = args.call === undefined
          ? candidate
          : answerCall(candidate, called(store, args.call));
        context.logger.info("Tracking {e}", { e: args.extension });
        return save(context, store);
      },
    },
    record: {
      description: "Record the evidence a stage needs on a tracked extension.",
      arguments: z.object({
        extension: z.string(),
        requestRef: z.string().optional(),
        steward: z.string().optional().describe("Team or person. No default."),
        platform: z.string().optional().describe(
          "The platform considering adoption.",
        ),
        discoveryNotes: z.string().optional().describe(
          "Source team, discovery event or referral, and follow-up owner/action.",
        ),
        flowEvidence: z.string().optional().describe(
          "A demonstrated improvement to flow, with a reference.",
        ),
        valueStatement: z.string().optional().describe(
          "Wider value, beneficiaries, sharing incentives, costs and how to assess benefit.",
        ),
        showcase: z.string().optional().describe("Where it was shown."),
        interest: z.string().optional().describe(
          "Interested consumers/platforms and their feedback; not an adoption commitment.",
        ),
        negotiationNotes: z.string().optional(),
        collaborationAgreement: z.string().optional().describe(
          "Both parties' agreement to a trial, including scope and care responsibilities.",
        ),
        collaborationNotes: z.string().optional().describe(
          "Trial feedback, original team's needs and resulting changes.",
        ),
        adoptionAgreement: z.string().optional().describe(
          "Both parties' acceptance and maintenance/support responsibilities; consumers remain free to choose.",
        ),
        offeringRef: z.string().optional().describe(
          "Link to the usable offering, documentation and support route.",
        ),
        reuseNotes: z.string().optional().describe(
          "Voluntary uptake, user feedback and observed outcomes, including no uptake.",
        ),
        decision: z.string().optional().describe(
          "Legacy free-text notes only. Use decide to set an outcome.",
        ),
        credit: z.string().optional(),
      }),
      execute: async (
        args: { extension: string } & Record<string, string | undefined>,
        context: Ctx,
      ) => {
        const { extension, ...evidence } = args;
        const store = await load(context);
        store.candidates[extension] = record(
          tracked(store, extension),
          evidence,
        );
        return save(context, store);
      },
    },
    decide: {
      description:
        "Record a reasoned defer, decline, resume (active), or adoption decision. Adoption requires agreement evidence at stage 5 and records stage 6. No registry writes or ownership transfer.",
      arguments: z.object({
        extension: z.string(),
        outcome: OutcomeSchema,
        note: z.string().trim().min(1),
      }),
      execute: async (
        args: { extension: string; outcome: Outcome; note: string },
        context: Ctx,
      ) => {
        const store = await load(context);
        store.candidates[args.extension] = decide(
          tracked(store, args.extension),
          args.outcome,
          args.note,
        );
        return save(context, store);
      },
    },
    untrack: {
      description:
        "Stop tracking an extension. Older stored versions keep its history.",
      arguments: z.object({ extension: z.string() }),
      execute: async (args: { extension: string }, context: Ctx) => {
        const store = await load(context);
        tracked(store, args.extension);
        delete store.candidates[args.extension];
        context.logger.info("Untracked {e}", { e: args.extension });
        return save(context, store);
      },
    },
    refresh: {
      description:
        "Take a pull-count reading of every tracked extension (run weekly).",
      arguments: z.object({ _registry: Registry }),
      execute: async (
        args: { _registry?: RegistryPort },
        context: Ctx,
      ) => {
        const reg = args._registry ?? swampRegistry;
        const store = await load(context);
        const candidates = store.candidates;
        const now = new Date().toISOString();
        for (const name of Object.keys(candidates)) {
          // A rerun on the same day must not add a second reading.
          if (readToday(candidates[name], now)) continue;
          try {
            candidates[name] = addReading(
              candidates[name],
              await reg.info(name),
            );
          } catch (error) {
            // One unreadable extension must not lose this week's other readings.
            context.logger.warn("Could not read {e}: {error}", {
              e: name,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        return save(context, store);
      },
    },
    advance: {
      description:
        "Move through activities 0–5 once their evidence is recorded. Use decide for adoption; stage 6 never loops back.",
      arguments: z.object({
        extension: z.string(),
        to: StageSchema,
        note: z.string().default(""),
      }),
      execute: async (
        args: { extension: string; to: number; note: string },
        context: Ctx,
      ) => {
        const store = await load(context);
        store.candidates[args.extension] = advance(
          tracked(store, args.extension),
          args.to as Stage,
          args.note,
        );
        return save(context, store);
      },
    },
    report: {
      description:
        "Write the markdown and HTML reports of every tracked extension.",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: Ctx) => {
        const store = await load(context);
        const candidates = Object.values(store.candidates);
        const calls = Object.values(store.calls);
        const now = new Date().toISOString();
        const md = await context.createFileWriter("report", "weekly")
          .writeText(renderReport(candidates, now, calls));
        const html = await context.createFileWriter("reportHtml", "weekly")
          .writeText(renderReportHtml(candidates, now, calls));
        return { dataHandles: [md, html] };
      },
    },
  },
};
