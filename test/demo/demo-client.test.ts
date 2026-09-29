import { describe, expect, test } from "bun:test";

import { createDemoClient, parseArgv } from "../../src/demo/demo-client.ts";
import { ACME } from "../../src/demo/fixtures.ts";
import { CURATED_KINDS } from "../../src/resources/curated.ts";
import { extractRows } from "../../src/resources/infer.ts";
import type { ResourceKind, ResourceParams } from "../../src/resources/types.ts";

const client = createDemoClient({ latency: [0, 0] });
const session = { accountId: ACME };
const byId = new Map(CURATED_KINDS.map((kind) => [kind.id, kind]));

const listRows = async (kind: ResourceKind, params: ResourceParams) => {
  const call = kind.list(params, session);
  const result = await client.run({ argv: call.argv, context: { accountId: ACME, ...call.context } });
  if (result.kind !== "json") {
    throw new Error(`${kind.id} returned ${result.kind}`);
  }
  return (kind.rows ?? extractRows)(result.data);
};

describe("parseArgv", () => {
  test("splits words and flags", () => {
    const parsed = parseArgv(["kv", "keys", "list", "--namespace-id", "n1", "--local"]);
    expect(parsed.words).toEqual(["kv", "keys", "list"]);
    expect(Object.fromEntries(parsed.flags)).toEqual({ local: "true", "namespace-id": "n1" });
  });
});

describe("demo client", () => {
  test("every curated kind lists rows, reached the way the UI reaches it", async () => {
    const zones = byId.get("zones")!;
    const [zone] = await listRows(zones, {});
    const zoneParams = { zoneId: String(zone?.id), zoneName: String(zone?.name) };

    const visited = new Set<string>();
    const visit = async (kind: ResourceKind, params: ResourceParams): Promise<void> => {
      if (visited.has(kind.id)) {
        return;
      }
      visited.add(kind.id);
      const rows = await listRows(kind, kind.scope === "zone" ? { ...params, ...zoneParams } : params);
      expect(rows.length, kind.id).toBeGreaterThan(0);
      const [row] = rows;
      const describeCall = kind.describe?.(row!, params);
      if (describeCall !== undefined) {
        const result = await client.run({
          argv: describeCall.argv,
          context: { accountId: ACME, zone: zoneParams.zoneId, ...describeCall.context },
        });
        expect(result.kind === "json" || result.kind === "text", `${kind.id} describe`).toBeTrue();
      }
      for (const child of kind.children ?? []) {
        await visit(byId.get(child.kind)!, { ...params, ...child.params(row!) });
      }
    };
    for (const kind of CURATED_KINDS.filter((candidate) => candidate.requires === undefined)) {
      await visit(kind, {});
    }
    expect(visited.size).toBe(CURATED_KINDS.length);
  });

  test("zones filter by account", async () => {
    const result = await client.run({ argv: ["zones", "list", "--account-id", ACME] });
    expect(result.kind === "json" && Array.isArray(result.data) && result.data.length).toBe(6);
  });

  test("KV values come back as text", async () => {
    const namespaces = await client.run({ argv: ["kv", "namespaces", "list"], context: { accountId: ACME } });
    const flags = result(namespaces).find((row) => row.title === "FEATURE_FLAGS");
    const value = await client.run({
      argv: ["kv", "keys", "get", "checkout.v2", "--namespace-id", String(flags?.id)],
    });
    expect(value.kind).toBe("text");
  });

  test("unknown list commands return an empty list, other commands fail clearly", async () => {
    expect(await client.run({ argv: ["unknown", "things", "list"] })).toEqual({ data: [], kind: "json" });
    const error = await client
      .run({ argv: ["unknown", "thing", "get", "x"] })
      .catch((caught: unknown) => caught);
    expect(String(error)).toContain("Demo mode has no data");
  });

  test("zone-scoped calls need a zone", async () => {
    const error = await client.run({ argv: ["dns", "records", "list"] }).catch((caught: unknown) => caught);
    expect(String(error)).toContain("needs a zone");
  });
});

const result = (value: Awaited<ReturnType<typeof client.run>>): Record<string, unknown>[] =>
  value.kind === "json" && Array.isArray(value.data) ? (value.data as Record<string, unknown>[]) : [];
