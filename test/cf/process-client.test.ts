import path from "node:path";

import { describe, expect, test } from "bun:test";

import { buildCfArgs, createProcessClient, parseCfOutput } from "../../src/cf/process-client.ts";
import { CfError } from "../../src/cf/types.ts";

const FAKE_CF = path.join(import.meta.dir, "..", "fixtures", "fake-cf");

describe("parseCfOutput", () => {
  test("decodes JSON, text and empty output", () => {
    expect(parseCfOutput('{"a":1}\n')).toEqual({ data: { a: 1 }, kind: "json" });
    expect(parseCfOutput("plain value\n")).toEqual({ kind: "text", text: "plain value\n" });
    expect(parseCfOutput("  \n")).toEqual({ kind: "empty" });
  });
});

describe("buildCfArgs", () => {
  test("adds --zone and local flags", () => {
    expect(
      buildCfArgs(
        { argv: ["dns", "records", "list"], context: { zone: "example.com" } },
        { local: true, persistTo: "./state" },
      ),
    ).toEqual(["dns", "records", "list", "--zone", "example.com", "--local", "--persist-to", "./state"]);
    expect(buildCfArgs({ argv: ["zones", "list"] }, {})).toEqual(["zones", "list"]);
  });
});

describe("createProcessClient", () => {
  test("passes the account as CLOUDFLARE_ACCOUNT_ID and disables colour", async () => {
    const client = createProcessClient({ bin: FAKE_CF });
    const result = await client.run({ argv: ["echo", "x"], context: { accountId: "acct-1", zone: "z1" } });
    expect(result).toEqual({
      data: { account: "acct-1", args: ["x", "--zone", "z1"], noColor: "1", osc: "1" },
      kind: "json",
    });
    expect(client.mode).toBe("live");
  });

  test("settles on output silence in local mode, because cf --local never exits", async () => {
    const client = createProcessClient({ bin: FAKE_CF, local: true, settleMs: 150 });
    const started = performance.now();
    const result = await client.run({ argv: ["hang"] });
    expect(result).toEqual({ data: [{ id: "a" }], kind: "json" });
    expect(performance.now() - started).toBeLessThan(4000);
    expect(client.mode).toBe("local");
  });

  test("turns a failed process into a classified CfError", async () => {
    const client = createProcessClient({ bin: FAKE_CF });
    const error = await client.run({ argv: ["fail-auth"] }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CfError);
    expect((error as CfError).code).toBe("auth");
    expect((error as CfError).exitCode).toBe(1);
  });

  test("reads the last error box after a usage dump", async () => {
    const client = createProcessClient({ bin: FAKE_CF });
    const error = (await client.run({ argv: ["fail-api"] }).catch((caught: unknown) => caught)) as CfError;
    expect(error.code).toBe("no-local-equivalent");
  });

  test("times out and kills a slow call", async () => {
    const client = createProcessClient({ bin: FAKE_CF, timeoutMs: 200 });
    const error = (await client.run({ argv: ["slow"] }).catch((caught: unknown) => caught)) as CfError;
    expect(error.code).toBe("timeout");
  });

  test("cancels on abort", async () => {
    const client = createProcessClient({ bin: FAKE_CF });
    const controller = new AbortController();
    const pending = client.run({ argv: ["slow"], signal: controller.signal });
    setTimeout(() => {
      controller.abort();
    }, 50);
    const error = (await pending.catch((caught: unknown) => caught)) as CfError;
    expect(error.code).toBe("aborted");
  });

  test("reports a missing cf binary", async () => {
    const client = createProcessClient({ bin: "/nonexistent/cf-binary" });
    const error = (await client
      .run({ argv: ["zones", "list"] })
      .catch((caught: unknown) => caught)) as CfError;
    expect(error.code).toBe("missing-cli");
  });

  test("reads the version banner", async () => {
    const client = createProcessClient({ bin: FAKE_CF, local: true });
    expect(await client.version()).toBe("1.0.0-beta.5");
  });

  test("returns plain text output as text", async () => {
    const client = createProcessClient({ bin: FAKE_CF });
    expect(await client.run({ argv: ["text"] })).toEqual({ kind: "text", text: "hello value\n" });
  });
});
