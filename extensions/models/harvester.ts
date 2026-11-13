/**
 * @puddleworks/harvester — moves swamp extensions through the stages of
 * Matthew Skelton's harvesting diagram (Team Topologies, Conflux 2024).
 *
 * It records and reports; a person decides. It never deprecates, transfers or
 * contacts anyone. Only extensions in the runner's own collectives can be
 * tracked, and only the username (or a collective token's collective) and
 * `collectives` are read from the account.
 *
 * Output: a `candidates` resource holding every tracked extension, and the
 * weekly `report` as a markdown file and as an HTML page.
 *
 * @module
 */
import { z } from "npm:zod@4";
import {
  addReading,
  advance,
  answerCall,
  assertOwnCollective,
  type Candidate,
  type CapabilityCall,
  closeCall,
  collectiveOf,
  decide,
  newCandidate,
  openCall,
  type Outcome,
  parseInfo,
  parseWhoami,
  readToday,
  record,
  type RegistryFacts,
  type Stage,
} from "./_lib/harvest.ts";
import {
  type CollectiveInventory,
  renderReport,
  renderReportHtml,
} from "./_lib/report.ts";

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
  requestRef: z.string().nullable(),
  callId: z.string().nullable().default(null),
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
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  closeNote: z.string().nullable(),
});

/** What is stored: every tracked extension by name, and the open calls. */
export const CandidatesSchema = z.object({
  candidates: z.record(z.string(), CandidateSchema),
  // Older stored versions have no calls.
  calls: z.record(z.string(), CallSchema).default({}),
});

/** How the model reads the registry. Tests pass a stub. */
export interface RegistryPort {
  whoami(): Promise<{ username: string; collectives: string[] }>;
  info(extension: string): Promise<RegistryFacts>;
  list(collective: string): Promise<string[]>;
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
  list: async (collective) => {
    // The name becomes a subprocess argument; refuse anything but a slug.
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(collective)) {
      throw new Error(`'${collective}' is not a collective name.`);
    }
    const names = new Set<string>();
    const schema = z.object({
      extensions: z.array(z.object({ name: z.string() })),
      meta: z.object({ total: z.number().int().nonnegative() }),
    });
    for (let page = 1;; page++) {
      const result = schema.parse(
        await swampJson([
          "extension",
          "search",
          "--collective",
          collective,
          "--per-page",
          "100",
          "--page",
          String(page),
        ]),
      );
      const before = names.size;
      for (const extension of result.extensions) names.add(extension.name);
      if (names.size >= result.meta.total) return [...names];
      if (names.size === before) {
        throw new Error("Incomplete collective listing");
      }
    }
  },
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

type Store = Record<string, Candidate>;
type State = { candidates: Store; calls: Record<string, CapabilityCall> };

async function load(context: Ctx): Promise<State> {
  const stored = await context.readResource?.("candidates");
  return CandidatesSchema.parse(stored ?? { candidates: {} }) as State;
}

async function save(context: Ctx, state: State) {
  const handle = await context.writeResource("candidates", "candidates", {
    candidates: state.candidates,
    calls: state.calls,
  });
  return { dataHandles: [handle] };
}

function tracked(store: Store, extension: string): Candidate {
  // Own keys only: "constructor" or "toString" would match any object.
  const c = Object.hasOwn(store, extension) ? store[extension] : undefined;
  if (!c) throw new Error(`${extension} is not tracked. Run 'track' first.`);
  return c;
}

const Registry = z.any().optional().describe("Test hook: a registry stub.");

/** The model type. */
export const model = {
  type: "@puddleworks/harvester",
  version: "2026.11.13.1",
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
        "Adds calls for capabilities, negotiated adoption evidence and outcomes. Existing resource evidence is preserved; missing fields default on read without inferring adoption.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.11.13.1",
      description:
        "Adds the collective harvesting wave and untracked inventory. Stored evidence is unchanged. HTML reports now use the distinct weekly-html instance name.",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
  ],
  resources: {
    candidates: {
      description: "Every tracked extension, its stage, evidence and readings.",
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
      description:
        "The collective harvesting wave and evidence as an HTML page.",
      contentType: "text/html",
      lifetime: "infinite" as const,
      garbageCollection: 52,
    },
  },
  methods: {
    call: {
      description:
        "Post a call for a capability a platform needs (stage 0). No extension needs to exist yet; candidates answer it with 'answer'.",
      arguments: z.object({
        id: z.string().describe(
          "Short lower-case id, such as fast-onboarding.",
        ),
        need: z.string().describe(
          "The capability needed and who would use it.",
        ),
        platform: z.string().describe("The platform area posting the call."),
      }),
      execute: async (
        args: { id: string; need: string; platform: string },
        context: Ctx,
      ) => {
        const state = await load(context);
        state.calls[args.id] = openCall(
          state.calls,
          args.id,
          args.need,
          args.platform,
        );
        context.logger.info("Opened call {id}", { id: args.id });
        return save(context, state);
      },
    },
    closeCall: {
      description:
        "Close a call, with the reason. Candidates that answered it keep the link.",
      arguments: z.object({ id: z.string(), note: z.string() }),
      execute: async (args: { id: string; note: string }, context: Ctx) => {
        const state = await load(context);
        const call = Object.hasOwn(state.calls, args.id)
          ? state.calls[args.id]
          : undefined;
        if (!call) throw new Error(`No call '${args.id}'.`);
        state.calls[args.id] = closeCall(call, args.note);
        context.logger.info("Closed call {id}", { id: args.id });
        return save(context, state);
      },
    },
    answer: {
      description:
        "Link a tracked extension to the open call it answers. This is stage 0's evidence.",
      arguments: z.object({ extension: z.string(), call: z.string() }),
      execute: async (
        args: { extension: string; call: string },
        context: Ctx,
      ) => {
        const state = await load(context);
        const store = state.candidates;
        store[args.extension] = answerCall(
          tracked(store, args.extension),
          state.calls,
          args.call,
        );
        context.logger.info("{e} answers call {id}", {
          e: args.extension,
          id: args.call,
        });
        return save(context, state);
      },
    },
    track: {
      description:
        "Start tracking an extension in one of your collectives (stage 0 or 1).",
      arguments: z.object({
        extension: z.string().describe("@collective/name"),
        stage: z.number().int().min(0).max(1).default(1),
        _registry: Registry,
      }),
      execute: async (
        args: { extension: string; stage: number; _registry?: RegistryPort },
        context: Ctx,
      ) => {
        const reg = args._registry ?? swampRegistry;
        const who = await reg.whoami();
        assertOwnCollective(args.extension, who.collectives);
        const state = await load(context);
        const store = state.candidates;
        if (store[args.extension]) {
          throw new Error(`${args.extension} is already tracked.`);
        }
        store[args.extension] = newCandidate(
          args.extension,
          args.stage as Stage,
        );
        context.logger.info("Tracking {e}", { e: args.extension });
        return save(context, state);
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
        const state = await load(context);
        const store = state.candidates;
        store[extension] = record(tracked(store, extension), evidence);
        context.logger.info("Recorded {fields} for {e}", {
          fields: Object.keys(evidence).join(", "),
          e: extension,
        });
        return save(context, state);
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
        const state = await load(context);
        const store = state.candidates;
        store[args.extension] = decide(
          tracked(store, args.extension),
          args.outcome,
          args.note,
        );
        context.logger.info("Decision for {e}: {outcome}", {
          e: args.extension,
          outcome: args.outcome,
        });
        return save(context, state);
      },
    },
    untrack: {
      description:
        "Stop tracking an extension. Older stored versions keep its history.",
      arguments: z.object({ extension: z.string() }),
      execute: async (args: { extension: string }, context: Ctx) => {
        const state = await load(context);
        const store = state.candidates;
        tracked(store, args.extension);
        delete store[args.extension];
        context.logger.info("Untracked {e}", { e: args.extension });
        return save(context, state);
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
        const state = await load(context);
        const store = state.candidates;
        const now = new Date().toISOString();
        let read = 0;
        for (const name of Object.keys(store)) {
          // A rerun on the same day must not add a second reading.
          if (readToday(store[name], now)) continue;
          try {
            store[name] = addReading(store[name], await reg.info(name));
            read++;
          } catch (error) {
            // One unreadable extension must not lose this week's other readings.
            context.logger.warn("Could not read {e}: {error}", {
              e: name,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        context.logger.info(
          "Added {read} reading(s) for {total} extension(s)",
          {
            read,
            total: Object.keys(store).length,
          },
        );
        return save(context, state);
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
        const state = await load(context);
        const store = state.candidates;
        store[args.extension] = advance(
          tracked(store, args.extension),
          args.to as Stage,
          args.note,
        );
        context.logger.info("Moved {e} to stage {to}", {
          e: args.extension,
          to: args.to,
        });
        return save(context, state);
      },
    },
    report: {
      description:
        "Write markdown and HTML reports for your own collectives, including untracked registry extensions. Reads one registry listing per collective (paginated above 100); never starts tracking automatically.",
      arguments: z.object({ _registry: Registry }),
      execute: async (args: { _registry?: RegistryPort }, context: Ctx) => {
        const reg = args._registry ?? swampRegistry;
        // Authenticate before rendering: an old tracked record must not expose
        // extensions from a collective the runner no longer belongs to.
        const who = await reg.whoami();
        const collectives = [
          ...new Set(who.collectives.map((c) => c.toLowerCase())),
        ];
        const state = await load(context);
        const candidates = Object.values(state.candidates).filter((c) =>
          collectives.includes(collectiveOf(c.extension))
        );
        const calls = Object.values(state.calls);
        const inventory: CollectiveInventory = {
          collectives,
          extensions: [],
          complete: true,
        };
        try {
          for (const collective of collectives) {
            const names = await reg.list(collective);
            // Scope locally too; do not trust a search result's prefix match.
            inventory.extensions.push(
              ...names.filter((name) =>
                name.toLowerCase().startsWith(`@${collective}/`)
              ),
            );
          }
        } catch (error) {
          inventory.extensions = [];
          inventory.complete = false;
          context.logger.warn(
            "Collective inventory unavailable ({error}); reporting scoped tracked extensions only",
            { error: error instanceof Error ? error.message : String(error) },
          );
        }
        const now = new Date().toISOString();
        // Render both before writing either, so a failure writes neither.
        const markdown = renderReport(candidates, now, calls, inventory);
        const page = renderReportHtml(candidates, now, calls, inventory);
        const md = await context.createFileWriter("report", "weekly")
          .writeText(markdown);
        const html = await context.createFileWriter("reportHtml", "weekly-html")
          .writeText(page);
        context.logger.info(
          "Wrote the report: {extensions} extension(s), {calls} call(s)",
          { extensions: candidates.length, calls: calls.length },
        );
        return { dataHandles: [md, html] };
      },
    },
  },
};
