import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { mock } from "bun:test";

/**
 * Test isolation:
 * - Tooee reads `$XDG_CONFIG_HOME/tooee/config.json`; point it at an empty directory.
 * - `@tooee/clipboard` shells out to wl-copy/pbcopy; replace it with an in-memory sink.
 *   Register before any test loads `@tooee/shell`, which keeps its import binding.
 */
process.env.XDG_CONFIG_HOME = mkdtempSync(path.join(tmpdir(), "c9s-test-config-"));

export const copied: string[] = [];

await mock.module("@tooee/clipboard", () => ({
  copyToClipboard: async (text: string) => {
    copied.push(text);
  },
  copyToPrimary: async () => undefined,
  readClipboard: async () => undefined,
  readClipboardText: () => "",
  readPrimaryText: () => "",
}));
