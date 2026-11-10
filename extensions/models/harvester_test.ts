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
    "Take at least two readings",
  );
});

Deno.test("report writes a markdown file", async () => {
  const { context, getWrittenFiles } = createModelTestContext({
    storedResources: {
      candidates: { candidates: { "@acme/tool": newCandidate("@acme/tool") } },
    },
  });
  await model.methods.report.execute({}, context);
  const f = getWrittenFiles()[0];
  assertEquals(f.specName, "report");
  assert(f.text?.includes("@acme/tool"));
  const h = getWrittenFiles()[1];
  assertEquals(h.specName, "reportHtml");
  assert(h.text?.includes("<!doctype html>") && h.text.includes("@acme/tool"));
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
