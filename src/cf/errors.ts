import { CfError } from "./types.ts";
import type { CfErrorCode } from "./types.ts";

/**
 * `cf` reports failures on stderr as clack boxes:
 *
 *   ┌ APIError
 *   │ [error] This command has no local equivalent. ...
 *   │ 404 Not Found
 *   └
 *
 * Usage errors print the full yargs help first and the box last, so the
 * last box is the one that explains the failure.
 */
export interface ParsedCfError {
  readonly title: string;
  readonly message: string;
  readonly detail: readonly string[];
}

const BOX_OPEN = /^┌\s?(.*)$/u;
const BOX_LINE = /^│\s?(.*)$/u;
const BOX_CLOSE = /^└/u;
// oxlint-disable-next-line no-control-regex -- ESC is the start of the ANSI colour codes being stripped
const ANSI = /\u001B\[[\d;]*m/gu;

export const parseCfStderr = function parseCfStderr(stderr: string): ParsedCfError | null {
  const lines = stderr.replace(ANSI, "").split(/\r?\n/u);
  let lastBox: { title: string; body: string[] } | null = null;
  let open: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    const opened = BOX_OPEN.exec(line);
    if (opened) {
      open = { body: [], title: (opened[1] ?? "").trim() };
      continue;
    }
    if (open === null) {
      continue;
    }
    if (BOX_CLOSE.test(line)) {
      lastBox = open;
      open = null;
      continue;
    }
    const body = BOX_LINE.exec(line);
    open.body.push((body?.[1] ?? line).trim());
  }
  const box = lastBox ?? open;

  if (box !== null) {
    const body = box.body
      .map((line) => line.replace(/^\[(?:error|warn|warning)\]\s*/iu, ""))
      .filter((line) => line !== "");
    const [message = box.title, ...detail] = body;
    return { detail, message, title: box.title };
  }

  const plain = lines.map((line) => line.trim()).filter((line) => line !== "");
  const last = plain.at(-1);
  return last === undefined ? null : { detail: [], message: last, title: "Error" };
};

const classify = function classify(parsed: ParsedCfError): CfErrorCode {
  const text = [parsed.title, parsed.message, ...parsed.detail].join("\n");
  if (/no authentication token|not logged in|cf auth login|authentication error/iu.test(text)) {
    return "auth";
  }
  if (/no local equivalent/iu.test(text)) {
    return "no-local-equivalent";
  }
  if (/\b404\b|not found/iu.test(text)) {
    return "not-found";
  }
  return "failed";
};

/** Build a CfError from a failed process. */
export const cfErrorFromProcess = function cfErrorFromProcess(
  argv: readonly string[],
  stderr: string,
  exitCode: number | null,
): CfError {
  const parsed = parseCfStderr(stderr);
  if (parsed === null) {
    return new CfError(`cf exited with code ${exitCode ?? "unknown"}`, { argv, exitCode });
  }
  const detail = parsed.detail.filter((line) => !/^\d{3} [A-Z]/u.test(line)).slice(0, 4);
  const message = [parsed.message, ...detail].join("\n");
  return new CfError(message, { argv, code: classify(parsed), exitCode });
};
