/**
 * @puddleworks/harvester — moves swamp extensions through the stages of
 * Matthew Skelton's harvesting diagram (Team Topologies, Conflux 2024).
 *
 * It records and reports; a person decides. It never deprecates, transfers or
 * contacts anyone. Only extensions in the runner's own collectives can be
 * tracked, and only `username` and `collectives` are read from the account.
 *
 * Output: a `candidates` resource holding every tracked extension, and a
 * `report` markdown file.
 *
 * @module
 */
import { z } from "npm:zod@4";
import {
  addReading,
  advance,
  assertOwnCollective,
  type Candidate,
  newCandidate,
  parseInfo,
  parseWhoami,
  record,
  type RegistryFacts,
  type Stage,
} from "./_lib/harvest.ts";
import { renderReport } from "./_lib/report.ts";

/** The model takes no settings. */
export const GlobalArgsSchema = z.object({});

const StageSchema = z.number().int().min(0).max(6);

const CandidateSchema = z.object({
  extension: z.string(),
  stage: StageSchema,
  cycle: z.number().int(),
  trackedAt: z.string(),
  stageEnteredAt: z.string(),
  steward: z.string().nullable(),
  requestRef: z.string().nullable(),
  valueStatement: z.string().nullable(),
  showcases: z.array(z.object({ where: z.string(), at: z.string() })),
  negotiationNotes: z.string().nullable(),
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

/** What is stored: every tracked extension by name. */
export const CandidatesSchema = z.object({
  candidates: z.record(z.string(), CandidateSchema),
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

type Store = Record<string, Candidate>;

async function load(context: Ctx): Promise<Store> {
  const stored = await context.readResource?.("candidates");
  return structuredClone((stored?.candidates ?? {}) as Store);
}

async function save(context: Ctx, store: Store) {
  const handle = await context.writeResource("candidates", "candidates", {
    candidates: store,
  });
  return { dataHandles: [handle] };
}

function tracked(store: Store, extension: string): Candidate {
  const c = store[extension];
  if (!c) throw new Error(`${extension} is not tracked. Run 'track' first.`);
  return c;
}

const Registry = z.any().optional().describe("Test hook: a registry stub.");

/** The model type. */
export const model = {
  type: "@puddleworks/harvester",
  version: "2026.11.06.1",
  globalArguments: GlobalArgsSchema,
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
  },
  methods: {
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
        const store = await load(context);
        if (store[args.extension]) {
          throw new Error(`${args.extension} is already tracked.`);
        }
        store[args.extension] = newCandidate(
          args.extension,
          args.stage as Stage,
        );
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
        valueStatement: z.string().optional(),
        showcase: z.string().optional().describe("Where it was shown."),
        negotiationNotes: z.string().optional(),
        decision: z.string().optional(),
        credit: z.string().optional(),
      }),
      execute: async (
        args: { extension: string } & Record<string, string | undefined>,
        context: Ctx,
      ) => {
        const { extension, ...evidence } = args;
        const store = await load(context);
        store[extension] = record(tracked(store, extension), evidence);
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
        for (const name of Object.keys(store)) {
          try {
            store[name] = addReading(store[name], await reg.info(name));
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
        "Move an extension to the next stage once its blockers are cleared.",
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
        store[args.extension] = advance(
          tracked(store, args.extension),
          args.to as Stage,
          args.note,
        );
        return save(context, store);
      },
    },
    report: {
      description: "Write the markdown report of every tracked extension.",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: Ctx) => {
        const store = await load(context);
        const md = renderReport(
          Object.values(store),
          new Date().toISOString(),
        );
        const handle = await context.createFileWriter("report", "weekly")
          .writeText(md);
        return { dataHandles: [handle] };
      },
    },
  },
};
