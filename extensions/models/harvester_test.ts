/**
 * Tests for the harvester model: the methods, with a stub registry.
 *
 * Run with: make test
 */
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createModelTestContext } from "jsr:@swamp-club/swamp-testing@0.20261030.68";
import { model, type RegistryPort } from "./harvester.ts";
import {
  addReading,
  type Candidate,
  newCandidate,
  type RegistryFacts,
} from "./_lib/harvest.ts";

const facts: RegistryFacts = {
  latestVersion: "1.0.0",
  labels: [],
  license: "MIT",
  repositoryVerified: true,
  scorePercentage: 90,
  pullCount: 40,
};

function registry(pulls = 40): RegistryPort {
  return {
    whoami: () => Promise.resolve({ username: "ada", collectives: ["acme"] }),
    info: () => Promise.resolve({ ...facts, pullCount: pulls }),
    list: () => Promise.resolve(["@acme/tool", "@acme/untracked"]),
  };
}

type Written = { data: { candidates: Record<string, unknown> } };

Deno.test("the model type is @puddleworks/harvester", () => {
  assertEquals(model.type, "@puddleworks/harvester");
});

Deno.test("track stores a candidate for an extension in your collective", async () => {
  const { context, getWrittenResources } = createModelTestContext();
  await model.methods.track.execute(
    { extension: "@acme/tool", stage: 1, _registry: registry() },
    context,
  );
  const w = getWrittenResources()[0] as unknown as Written;
  assert("@acme/tool" in w.data.candidates);
});

Deno.test("track refuses an extension outside your collectives", async () => {
  const { context, getWrittenResources } = createModelTestContext();
  await assertRejects(
    () =>
      model.methods.track.execute(
        { extension: "@other/tool", stage: 1, _registry: registry() },
        context,
      ),
    Error,
    "@other",
  );
  assertEquals(getWrittenResources().length, 0);
});

Deno.test("track refuses a duplicate", async () => {
  const { context } = createModelTestContext({
    storedResources: {
      candidates: { candidates: { "@acme/tool": newCandidate("@acme/tool") } },
    },
  });
  await assertRejects(
    () =>
      model.methods.track.execute(
        { extension: "@acme/tool", stage: 1, _registry: registry() },
        context,
      ),
    Error,
    "already tracked",
  );
});

Deno.test("refresh adds a reading to every tracked extension", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    storedResources: {
      candidates: { candidates: { "@acme/tool": newCandidate("@acme/tool") } },
    },
  });
  await model.methods.refresh.execute({ _registry: registry(77) }, context);
  const w = getWrittenResources()[0] as unknown as {
    data: { candidates: Record<string, { readings: { pullCount: number }[] }> };
  };
  assertEquals(w.data.candidates["@acme/tool"].readings[0].pullCount, 77);
});

Deno.test("refresh keeps going when one extension cannot be read", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    storedResources: {
      candidates: {
        candidates: {
          "@acme/bad": newCandidate("@acme/bad"),
          "@acme/good": newCandidate("@acme/good"),
        },
      },
    },
  });
  const reg = registry(9);
  reg.info = (name: string) =>
    name === "@acme/bad"
      ? Promise.reject(new Error("registry down"))
      : Promise.resolve({ ...facts, pullCount: 9 });
  await model.methods.refresh.execute({ _registry: reg }, context);
  const w = getWrittenResources()[0] as unknown as {
    data: { candidates: Record<string, { readings: unknown[] }> };
  };
  assertEquals(w.data.candidates["@acme/bad"].readings.length, 0);
  assertEquals(w.data.candidates["@acme/good"].readings.length, 1);
});

Deno.test("refresh does not add a second reading on the same day", async () => {
  const today = new Date().toISOString();
  const taken = addReading(newCandidate("@acme/tool"), facts, today);
  const { context, getWrittenResources } = createModelTestContext({
    storedResources: { candidates: { candidates: { "@acme/tool": taken } } },
  });
  await model.methods.refresh.execute({ _registry: registry(99) }, context);
  const w = getWrittenResources()[0] as unknown as {
    data: { candidates: Record<string, { readings: unknown[] }> };
  };
  assertEquals(w.data.candidates["@acme/tool"].readings.length, 1);
});

Deno.test("untrack removes an extension and keeps the others", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    storedResources: {
      candidates: {
        candidates: {
          "@acme/a": newCandidate("@acme/a"),
          "@acme/b": newCandidate("@acme/b"),
        },
      },
    },
  });
  await model.methods.untrack.execute({ extension: "@acme/a" }, context);
  const w = getWrittenResources()[0] as unknown as Written;
  assertEquals(Object.keys(w.data.candidates), ["@acme/b"]);
});

Deno.test("untrack refuses an untracked extension", async () => {
  const { context } = createModelTestContext();
  await assertRejects(
    () => model.methods.untrack.execute({ extension: "@acme/a" }, context),
    Error,
    "not tracked",
  );
});

Deno.test("names every object inherits, such as constructor, are not tracked", async () => {
  const { context, getWrittenResources } = createModelTestContext();
  await assertRejects(
    () =>
      model.methods.record.execute(
        { extension: "constructor", steward: "x" },
        context,
      ),
    Error,
    "not tracked",
  );
  await assertRejects(
    () =>
      model.methods.untrack.execute({ extension: "hasOwnProperty" }, context),
    Error,
    "not tracked",
  );
  assertEquals(getWrittenResources(), []);
});

Deno.test("record stores evidence on a tracked extension", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    storedResources: {
      candidates: { candidates: { "@acme/tool": newCandidate("@acme/tool") } },
    },
  });
  await model.methods.record.execute(
    { extension: "@acme/tool", steward: "platform-team" },
    context,
  );
  const w = getWrittenResources()[0] as unknown as {
    data: { candidates: Record<string, { steward: string }> };
  };
  assertEquals(w.data.candidates["@acme/tool"].steward, "platform-team");
});

Deno.test("record refuses an untracked extension", async () => {
  const { context } = createModelTestContext();
  await assertRejects(
    () =>
      model.methods.record.execute(
        { extension: "@acme/tool", steward: "x" },
        context,
      ),
    Error,
    "not tracked",
  );
});

Deno.test("advance refuses and names the blockers", async () => {
  const { context } = createModelTestContext({
    storedResources: {
      candidates: { candidates: { "@acme/tool": newCandidate("@acme/tool") } },
    },
  });
  await assertRejects(
    () =>
      model.methods.advance.execute(
        { extension: "@acme/tool", to: 2, note: "go" },
        context,
      ),
    Error,
    "flowEvidence",
  );
});

Deno.test("decide persists a decline and prevents advancement until resumed", async () => {
  const original = {
    ...newCandidate("@acme/tool"),
    discoveryNotes: "Payments demo",
    flowEvidence: "Two days of setup saved",
  };
  const first = createModelTestContext({
    storedResources: { candidates: { candidates: { "@acme/tool": original } } },
  });
  await model.methods.decide.execute({
    extension: "@acme/tool",
    outcome: "declined",
    note: "No platform capacity",
  }, first.context);
  const saved = first.getWrittenResources()[0].data as unknown as {
    candidates: Record<string, Candidate>;
  };
  assertEquals(saved.candidates["@acme/tool"].outcome, "declined");
  assertEquals(
    saved.candidates["@acme/tool"].flowEvidence,
    original.flowEvidence,
  );
  const second = createModelTestContext({
    storedResources: { candidates: saved },
  });
  await assertRejects(
    () =>
      model.methods.advance.execute({
        extension: "@acme/tool",
        to: 2,
        note: "go",
      }, second.context),
    Error,
    "declined",
  );
  await model.methods.decide.execute({
    extension: "@acme/tool",
    outcome: "active",
    note: "Capacity available",
  }, second.context);
  const resumed = second.getWrittenResources()[0].data as unknown as {
    candidates: Record<string, Candidate>;
  };
  assertEquals(
    resumed.candidates["@acme/tool"].decisions.map((d) => d.outcome),
    ["declined", "active"],
  );
});

Deno.test("old stage 6 data retains its evidence without inferring adoption", async () => {
  const legacy = {
    extension: "@acme/tool",
    stage: 6,
    cycle: 2,
    trackedAt: "2026-11-06T09:00:00.000Z",
    stageEnteredAt: "2026-11-09T09:00:00.000Z",
    steward: "platform-team",
    requestRef: "Lab request",
    valueStatement: "Shared onboarding",
    showcases: [{ where: "Community demo", at: "2026-11-07T09:00:00.000Z" }],
    negotiationNotes: "Discussed support",
    decision: "Not accepted yet",
    credit: "Payments team",
    baselinePulls: 40,
    readings: [],
    history: [],
    facts: { ...facts, labels: ["harvest-core"] },
  };
  const first = createModelTestContext({
    storedResources: { candidates: { candidates: { "@acme/tool": legacy } } },
  });
  await model.methods.report.execute({ _registry: registry() }, first.context);
  assert(first.getWrittenFiles()[0].text?.includes("Legacy stage 6"));
  await assertRejects(
    () =>
      model.methods.decide.execute({
        extension: "@acme/tool",
        outcome: "adopted",
        note: "Review",
      }, first.context),
    Error,
    "adoptionAgreement",
  );
  await model.methods.record.execute({
    extension: "@acme/tool",
    reuseNotes: "Review scheduled",
  }, first.context);
  const saved = first.getWrittenResources()[0].data as unknown as {
    candidates: Record<string, Candidate>;
  };
  const c = saved.candidates["@acme/tool"];
  assertEquals(c.outcome, "active");
  assertEquals(c.decisions, []);
  for (const key of Object.keys(legacy) as (keyof typeof legacy)[]) {
    assertEquals(c[key], legacy[key]);
  }
  const second = createModelTestContext({
    storedResources: {
      candidates: {
        candidates: {
          "@acme/tool": {
            ...c,
            platform: "developer platform",
            collaborationAgreement: "Both teams agreed to trial",
            collaborationNotes: "Trial worked",
            adoptionAgreement: "Both teams approved support responsibilities",
            offeringRef: "https://example.com/tool/docs",
          },
        },
      },
    },
  });
  await model.methods.decide.execute({
    extension: "@acme/tool",
    outcome: "adopted",
    note: "Agreement reviewed",
  }, second.context);
  const adopted = (second.getWrittenResources()[0].data as unknown as {
    candidates: Record<string, Candidate>;
  }).candidates["@acme/tool"];
  assertEquals(adopted.outcome, "adopted");
  assertEquals(adopted.stageEnteredAt, legacy.stageEnteredAt);
  assertEquals(adopted.credit, legacy.credit);
  assertEquals(adopted.cycle, 2);
});

Deno.test("a call is stored, answered, reported and closed", async () => {
  const first = createModelTestContext({
    storedResources: {
      // Data from before calls existed has no calls key.
      candidates: {
        candidates: { "@acme/tool": newCandidate("@acme/tool", 0) },
      },
    },
  });
  await model.methods.call.execute({
    id: "fast-onboarding",
    need: "Onboard a new team in a day",
    platform: "Developer platform",
  }, first.context);
  type Saved = {
    candidates: Record<string, Candidate>;
    calls: Record<string, { closedAt: string | null }>;
  };
  let saved = first.getWrittenResources()[0].data as unknown as Saved;
  assert("@acme/tool" in saved.candidates);
  const second = createModelTestContext({
    storedResources: { candidates: saved },
  });
  await model.methods.answer.execute(
    { extension: "@acme/tool", call: "fast-onboarding" },
    second.context,
  );
  saved = second.getWrittenResources()[0].data as unknown as Saved;
  assertEquals(saved.candidates["@acme/tool"].callId, "fast-onboarding");
  const third = createModelTestContext({
    storedResources: { candidates: saved },
  });
  await model.methods.advance.execute(
    { extension: "@acme/tool", to: 1, note: "answers the call" },
    third.context,
  );
  await model.methods.report.execute({ _registry: registry() }, third.context);
  const md = third.getWrittenFiles()[0].text ?? "";
  assert(md.includes("Answered by @acme/tool"));
  await model.methods.closeCall.execute(
    { id: "fast-onboarding", note: "Met" },
    third.context,
  );
  const closed = third.getWrittenResources().at(-1)!.data as unknown as Saved;
  assert(closed.calls["fast-onboarding"].closedAt);
  assertEquals(closed.candidates["@acme/tool"].stage, 1);
  await assertRejects(
    () =>
      model.methods.closeCall.execute(
        { id: "missing", note: "x" },
        third.context,
      ),
    Error,
    "No call",
  );
});

Deno.test("report writes a markdown file", async () => {
  const { context, getWrittenFiles } = createModelTestContext({
    storedResources: {
      candidates: { candidates: { "@acme/tool": newCandidate("@acme/tool") } },
    },
  });
  await model.methods.report.execute({ _registry: registry() }, context);
  const f = getWrittenFiles()[0];
  assertEquals(f.specName, "report");
  assert(f.text?.includes("@acme/tool"));
  const h = getWrittenFiles()[1];
  assertEquals(h.specName, "reportHtml");
  assert(h.text?.includes("<!doctype html>") && h.text.includes("@acme/tool"));
  assertEquals(getWrittenFiles().map((file) => file.name), [
    "weekly",
    "weekly-html",
  ]);
});

Deno.test("report includes all own collectives without tracking registry entries or leaking other collectives", async () => {
  const original = {
    "@acme/tool": newCandidate("@acme/tool"),
    "@acme/unlisted": newCandidate("@acme/unlisted"),
    "@outsider/private": newCandidate("@outsider/private"),
  };
  const { context, getWrittenFiles, getWrittenResources } =
    createModelTestContext({
      storedResources: { candidates: { candidates: original } },
    });
  const reg = registry();
  reg.whoami = () =>
    Promise.resolve({ username: "ada", collectives: ["acme", "other-owned"] });
  reg.list = (collective) =>
    Promise.resolve(
      collective === "acme"
        ? [
          "@acme/tool",
          "@acme/untracked",
          "@acme/untracked",
          "@acme/cloud/nested",
          "@acme-extra/no",
          "@outsider/no",
        ]
        : ["@other-owned/another"],
    );
  await model.methods.report.execute({ _registry: reg }, context);
  const [markdown, html] = getWrittenFiles().map((file) => file.text!);
  for (const text of [markdown, html]) {
    for (
      const name of [
        "@acme/tool",
        "@acme/unlisted",
        "@acme/untracked",
        "@acme/cloud/nested",
        "@other-owned/another",
      ]
    ) assert(text.includes(name));
    assert(!text.includes("@outsider"));
    assert(!text.includes("@acme-extra"));
  }
  assert(markdown.includes("Not yet tracked (3)"));
  assert(html.includes("<strong>5</strong>extensions"));
  assertEquals(getWrittenResources(), []);
  assertEquals(original["@acme/tool"].stage, 1);
});

Deno.test("report distinguishes failed inventory from empty membership and fails closed on identity errors", async () => {
  const setup = () =>
    createModelTestContext({
      storedResources: {
        candidates: {
          candidates: { "@acme/tool": newCandidate("@acme/tool") },
        },
      },
    });
  const reg = registry();
  reg.list = () => Promise.reject(new Error("Offline"));
  const offline = setup();
  await model.methods.report.execute({ _registry: reg }, offline.context);
  for (const file of offline.getWrittenFiles()) {
    assert(file.text?.includes("untracked count is unknown"));
    assert(file.text?.includes("@acme/tool"));
  }
  reg.whoami = () => Promise.resolve({ username: "ada", collectives: [] });
  const empty = setup();
  await model.methods.report.execute({ _registry: reg }, empty.context);
  for (const file of empty.getWrittenFiles()) {
    assert(file.text?.includes("no collectives"));
    assert(!file.text?.includes("@acme/tool"));
    assert(!file.text?.includes("inventory unavailable"));
  }
  reg.whoami = () => Promise.reject(new Error("Sign in required"));
  const anonymous = setup();
  await assertRejects(
    () => model.methods.report.execute({ _registry: reg }, anonymous.context),
    Error,
    "Sign in required",
  );
  assertEquals(anonymous.getWrittenFiles(), []);
});

Deno.test("the current version has an upgrade that keeps the arguments", () => {
  const entry = model.upgrades.find((u) => u.toVersion === model.version);
  assert(entry, `no upgrade entry for ${model.version}`);
  const args = { kept: "value" };
  assertEquals(entry.upgradeAttributes(args), args);
});

Deno.test("the README pulls the extension before creating the model", async () => {
  const readme = await Deno.readTextFile(
    new URL("../../README.md", import.meta.url),
  );
  const pull = readme.indexOf("swamp extension pull @puddleworks/harvester");
  assert(pull !== -1, "README never pulls the extension");
  assert(pull < readme.indexOf("swamp model create"));
});
