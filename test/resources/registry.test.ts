import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "bun:test";

import { decodeCatalogue } from "../../src/cf/catalogue.ts";
import { CURATED_KINDS } from "../../src/resources/curated.ts";
import { createRegistry } from "../../src/resources/registry.ts";

const FIXTURE = path.join(import.meta.dir, "..", "fixtures", "commands.json");
const catalogue = decodeCatalogue(readFileSync(FIXTURE, "utf8"), FIXTURE);

describe("curated kinds", () => {
  test("have unique ids", () => {
    const ids = CURATED_KINDS.map((kind) => kind.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("children point at kinds that exist, and supply the params those kinds require", () => {
    const byId = new Map(CURATED_KINDS.map((kind) => [kind.id, kind]));
    const sampleRow = { id: "i", name: "n", queue_id: "q", queue_name: "qn", title: "t", uuid: "u" };
    for (const kind of CURATED_KINDS) {
      for (const child of kind.children ?? []) {
        const target = byId.get(child.kind);
        expect(target, `${kind.id} -> ${child.kind}`).toBeDefined();
        const params = child.params(sampleRow);
        for (const name of target?.requires ?? []) {
          expect(params[name], `${child.kind} needs ${name}`).toBeString();
        }
      }
    }
  });

  test("never send write commands", () => {
    const WRITE_VERBS = /\b(create|update|delete|put|patch|edit|deploy|purge)\b/u;
    const sample = { id: "i", name: "n", queue_id: "q", title: "t", uuid: "u" };
    const params = {
      bucket: "b",
      doNamespaceId: "d",
      namespaceId: "n",
      projectName: "p",
      queueId: "q",
      workerId: "w",
      workerName: "w",
      zoneId: "z",
    };
    for (const kind of CURATED_KINDS) {
      expect(kind.list(params, { accountId: "a" }).argv.join(" ")).not.toMatch(WRITE_VERBS);
      const describeCall = kind.describe?.(sample, params);
      if (describeCall !== undefined) {
        expect(describeCall.argv.join(" ")).not.toMatch(WRITE_VERBS);
      }
    }
  });
});

describe("createRegistry", () => {
  const registry = createRegistry(catalogue);

  test("adds generic kinds for browsable commands that no curated kind covers", () => {
    const generic = registry.kinds.filter((kind) => kind.generic === true).map((kind) => kind.id);
    expect(generic).toEqual(["cf:rules", "cf:shared", "cf:widgets"]);
  });

  test("generic kinds describe through the sibling get command", () => {
    const widgets = registry.get("cf:widgets");
    expect(widgets?.describe?.({ id: "w1" }, {})).toEqual({ argv: ["widgets", "get", "w1"] });
    expect(registry.get("cf:rules")?.describe).toBeUndefined();
  });

  test("zone-scoped generic kinds pass the session zone", () => {
    expect(registry.get("cf:rules")?.list({}, { zoneId: "z1" })).toEqual({
      argv: ["rules", "list"],
      context: { zone: "z1" },
    });
  });

  test("resolves aliases for openable kinds only", () => {
    expect(registry.resolve("dns")?.id).toBe("dns-records");
    expect(registry.resolve(":z")?.id).toBe("zones");
    expect(registry.resolve("KV")?.id).toBe("kv-namespaces");
    expect(registry.resolve("widgets")?.id).toBe("cf:widgets");
    expect(registry.resolve("versions")).toBeUndefined();
    expect(registry.openable.some((kind) => kind.requires !== undefined)).toBeFalse();
  });

  test("works without a catalogue", () => {
    const bare = createRegistry(null);
    expect(bare.kinds).toHaveLength(CURATED_KINDS.length);
  });
});
