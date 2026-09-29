import { describe, expect, test } from "bun:test";

import { ArgsError, parseArgs } from "../src/args.ts";

describe("parseArgs", () => {
  test("defaults", () => {
    expect(parseArgs([])).toMatchObject({
      cfBin: "cf",
      demo: false,
      local: false,
      refresh: 30,
      resource: undefined,
    });
  });

  test("resource words and flags", () => {
    expect(
      parseArgs(["ai-gateway", "gateways", "--demo", "--refresh=5", "--theme", "dracula"]),
    ).toMatchObject({
      demo: true,
      refresh: 5,
      resource: "ai-gateway gateways",
      theme: "dracula",
    });
  });

  test("account comes from the flag or CLOUDFLARE_ACCOUNT_ID", () => {
    expect(parseArgs([], { CLOUDFLARE_ACCOUNT_ID: "env" }).account).toBe("env");
    expect(parseArgs(["--account", "flag"], { CLOUDFLARE_ACCOUNT_ID: "env" }).account).toBe("flag");
  });

  test("rejects bad combinations", () => {
    expect(() => parseArgs(["--demo", "--local"])).toThrow(ArgsError);
    expect(() => parseArgs(["--persist-to", "x"])).toThrow("only works with --local");
    expect(() => parseArgs(["--refresh", "-1"])).toThrow(ArgsError);
    expect(() => parseArgs(["--nope"])).toThrow("Unknown option");
    expect(() => parseArgs(["--zone"])).toThrow("needs a value");
  });
});
