import { describe, expect, test } from "bun:test";

import { cfErrorFromProcess, parseCfStderr } from "../../src/cf/errors.ts";

describe("parseCfStderr", () => {
  test("reads the last clack box and drops the [error] tag", () => {
    const stderr = [
      "Commands",
      "  cf zones   Zones",
      "",
      "┌ APIError",
      "│ [error] This command has no local equivalent. Re-run without --local.",
      "│ 404 Not Found",
      "└",
      "",
    ].join("\n");
    expect(parseCfStderr(stderr)).toEqual({
      detail: ["404 Not Found"],
      message: "This command has no local equivalent. Re-run without --local.",
      title: "APIError",
    });
  });

  test("falls back to the last plain line", () => {
    expect(parseCfStderr("warning\nsomething broke\n")?.message).toBe("something broke");
  });

  test("returns null for empty stderr", () => {
    expect(parseCfStderr("\n\n")).toBeNull();
  });
});

describe("cfErrorFromProcess", () => {
  test("classifies authentication failures", () => {
    const error = cfErrorFromProcess(
      ["zones", "list"],
      "┌ Error\n│ No authentication token found.\n│ Please set one of the following:\n└\n",
      1,
    );
    expect(error.code).toBe("auth");
    expect(error.message).toStartWith("No authentication token found.");
    expect(error.argv).toEqual(["zones", "list"]);
  });

  test("classifies local-mode gaps and strips the HTTP status line", () => {
    const error = cfErrorFromProcess(
      ["zones", "list"],
      "┌ APIError\n│ [error] This command has no local equivalent.\n│ 404 Not Found\n└\n",
      1,
    );
    expect(error.code).toBe("no-local-equivalent");
    expect(error.message).toBe("This command has no local equivalent.");
  });

  test("uses the exit code when stderr is empty", () => {
    expect(cfErrorFromProcess([], "", 7).message).toBe("cf exited with code 7");
  });
});
