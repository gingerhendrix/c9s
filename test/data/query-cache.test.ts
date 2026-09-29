import { describe, expect, test } from "bun:test";

import { CfError } from "../../src/cf/types.ts";
import type { CfClient, CfRequest, CfResult } from "../../src/cf/types.ts";
import { QueryCache, queryKey } from "../../src/data/query-cache.ts";

const fakeClient = (
  answer: (request: CfRequest, call: number) => Promise<CfResult>,
): CfClient & { calls: number } => {
  const client = {
    calls: 0,
    mode: "demo" as const,
    run: async (request: CfRequest) => {
      client.calls += 1;
      return await answer(request, client.calls);
    },
    version: async () => "test",
  };
  return client;
};

describe("QueryCache", () => {
  test("keys on argv, account and zone", () => {
    expect(queryKey({ argv: ["a"] })).not.toBe(queryKey({ argv: ["a"], context: { accountId: "x" } }));
    expect(queryKey({ argv: ["a"], context: { zone: "z" } })).toBe(
      queryKey({ argv: ["a"], context: { zone: "z" } }),
    );
  });

  test("shares one call between concurrent loads and caches the result", async () => {
    const client = fakeClient(async () => ({ data: [1], kind: "json" }));
    const cache = new QueryCache(client);
    const [first, second] = await Promise.all([cache.load({ argv: ["x"] }), cache.load({ argv: ["x"] })]);
    expect(first).toBe(second);
    expect(first.status).toBe("ready");
    await cache.load({ argv: ["x"] });
    expect(client.calls).toBe(1);
    await cache.load({ argv: ["x"] }, { force: true });
    expect(client.calls).toBe(2);
  });

  test("keeps stale rows when a refresh fails", async () => {
    const client = fakeClient(async (_request, call) => {
      if (call === 1) {
        return { data: ["old"], kind: "json" };
      }
      throw new CfError("rate limited");
    });
    const cache = new QueryCache(client);
    await cache.load({ argv: ["x"] });
    const entry = await cache.load({ argv: ["x"] }, { force: true });
    expect(entry.status).toBe("ready");
    expect(entry.result).toEqual({ data: ["old"], kind: "json" });
    expect(entry.error?.message).toBe("rate limited");
  });

  test("reports a first-load failure as an error entry", async () => {
    const cache = new QueryCache(
      fakeClient(async () => Promise.reject(new CfError("nope", { code: "auth" }))),
    );
    const entry = await cache.load({ argv: ["x"] });
    expect(entry.status).toBe("error");
    expect(entry.error?.code).toBe("auth");
  });

  test("notifies subscribers", async () => {
    const cache = new QueryCache(fakeClient(async () => ({ kind: "empty" })));
    let notified = 0;
    const unsubscribe = cache.subscribe(() => {
      notified += 1;
    });
    await cache.load({ argv: ["x"] });
    unsubscribe();
    expect(notified).toBe(2);
  });
});
