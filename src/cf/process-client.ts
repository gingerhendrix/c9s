import { cfErrorFromProcess } from "./errors.ts";
import { CfError } from "./types.ts";
import type { CfClient, CfRequest, CfResult } from "./types.ts";

export interface ProcessClientOptions {
  /** The `cf` executable. Defaults to `cf` on PATH. */
  readonly bin?: string;
  /** Send every call to cf's local Miniflare explorer (`--local`). */
  readonly local?: boolean;
  /** Local state directory (`--persist-to`); only used with `local`. */
  readonly persistTo?: string;
  /** Kill a call that has not finished after this long. */
  readonly timeoutMs?: number;
  /**
   * In local mode, treat output as complete after this much stdout silence.
   *
   * `cf --local` (1.0.0-beta.5) prints its result and then keeps Miniflare
   * alive, so the process never exits on its own for most list calls.
   */
  readonly settleMs?: number;
  /** Maximum number of concurrent `cf` processes. */
  readonly maxConcurrent?: number;
  /** Extra environment for the child process. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_SETTLE_MS = 400;
const DEFAULT_MAX_CONCURRENT = 4;

/** Decode what `cf` printed on stdout. */
export const parseCfOutput = function parseCfOutput(stdout: string): CfResult {
  const text = stdout.trim();
  if (text === "") {
    return { kind: "empty" };
  }
  try {
    const data: unknown = JSON.parse(text);
    return { data, kind: "json" };
  } catch {
    return { kind: "text", text: stdout };
  }
};

/** A counting semaphore: at most `limit` holders at once, FIFO. */
const createLimiter = function createLimiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const release = (): void => {
    active -= 1;
    const next = waiting.shift();
    if (next) {
      active += 1;
      next();
    }
  };
  return async (): Promise<() => void> => {
    if (active < limit) {
      active += 1;
      return release;
    }
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
    return release;
  };
};

/** Build the full argument list for one request. */
export const buildCfArgs = function buildCfArgs(
  request: CfRequest,
  options: Pick<ProcessClientOptions, "local" | "persistTo">,
): string[] {
  const args = [...request.argv];
  const zone = request.context?.zone;
  if (zone !== undefined && zone !== "") {
    args.push("--zone", zone);
  }
  if (options.local === true) {
    args.push("--local");
    if (options.persistTo !== undefined && options.persistTo !== "") {
      args.push("--persist-to", options.persistTo);
    }
  }
  return args;
};

/** Build the child environment for one request. */
export const buildCfEnv = function buildCfEnv(
  request: CfRequest,
  options: Pick<ProcessClientOptions, "env">,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...options.env,
    // Plain JSON on stdout, and no OSC progress sequences on stderr.
    CF_NO_OSC_PROGRESS: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
  };
  const accountId = request.context?.accountId;
  if (accountId !== undefined && accountId !== "") {
    env.CLOUDFLARE_ACCOUNT_ID = accountId;
  }
  return env;
};

const readAll = async function readAll(
  stream: ReadableStream<Uint8Array>,
  onChunk?: (text: string) => void,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) {
    const piece = decoder.decode(chunk, { stream: true });
    text += piece;
    onChunk?.(piece);
  }
  return text + decoder.decode();
};

/**
 * Runs `cf` as a child process per call.
 *
 * Each call settles exactly once: on process exit, on local-mode output
 * silence, on timeout, or on abort. Any path that settles early kills the
 * child, so a hung `cf --local` never leaks.
 */
export const createProcessClient = function createProcessClient(
  options: ProcessClientOptions = {},
): CfClient {
  const bin = options.bin ?? "cf";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const acquire = createLimiter(options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT);
  let versionPromise: Promise<string> | undefined;

  const spawnCf = async (request: CfRequest, applyMode: boolean): Promise<CfResult> => {
    const local = applyMode && options.local === true;
    const release = await acquire();
    try {
      if (request.signal?.aborted === true) {
        throw new CfError("Cancelled", { argv: request.argv, code: "aborted" });
      }
      const args = applyMode ? buildCfArgs(request, options) : [...request.argv];
      let child: ReturnType<typeof Bun.spawn<"ignore", "pipe", "pipe">>;
      try {
        child = Bun.spawn([bin, ...args], {
          env: buildCfEnv(request, options),
          stderr: "pipe",
          stdin: "ignore",
          stdout: "pipe",
        });
      } catch {
        throw new CfError(
          `Could not run \`${bin}\`. Install it with \`npm install -g cf\` (Node 22 or later).`,
          { argv: request.argv, code: "missing-cli" },
        );
      }

      return await new Promise<CfResult>((resolve, reject) => {
        let settled = false;
        let stdout = "";
        let silenceTimer: ReturnType<typeof setTimeout> | undefined;

        const finish = (outcome: () => void): void => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutTimer);
          clearTimeout(silenceTimer);
          request.signal?.removeEventListener("abort", onAbort);
          if (child.exitCode === null) {
            child.kill();
          }
          outcome();
        };

        const onAbort = (): void => {
          finish(() => {
            reject(new CfError("Cancelled", { argv: request.argv, code: "aborted" }));
          });
        };
        request.signal?.addEventListener("abort", onAbort, { once: true });

        const timeoutTimer = setTimeout(() => {
          finish(() => {
            reject(
              new CfError(`Timed out after ${Math.round(timeoutMs / 1000)}s`, {
                argv: request.argv,
                code: "timeout",
              }),
            );
          });
        }, timeoutMs);

        const stdoutDone = readAll(child.stdout, (piece) => {
          stdout += piece;
          if (local) {
            clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
              finish(() => {
                resolve(parseCfOutput(stdout));
              });
            }, settleMs);
          }
        });
        const stderrDone = readAll(child.stderr);

        void Promise.all([child.exited, stdoutDone, stderrDone]).then(
          ([exitCode, out, err]) => {
            finish(() => {
              if (exitCode === 0) {
                resolve(parseCfOutput(out));
              } else {
                reject(cfErrorFromProcess(request.argv, err, exitCode));
              }
            });
          },
          (error: unknown) => {
            finish(() => {
              reject(
                new CfError(error instanceof Error ? error.message : String(error), {
                  argv: request.argv,
                }),
              );
            });
          },
        );
      });
    } finally {
      release();
    }
  };

  return {
    mode: options.local === true ? "local" : "live",
    run: async (request) => await spawnCf(request, true),
    version: async () => {
      versionPromise ??= spawnCf({ argv: ["--version"] }, false).then((result) => {
        const text = result.kind === "text" ? result.text : "";
        return /v?(\d+\.\d+\.\d+[\w.-]*)/u.exec(text)?.[1] ?? "unknown";
      });
      return await versionPromise;
    },
  };
};
