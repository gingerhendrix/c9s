/**
 * The contract between c9s and the Cloudflare `cf` CLI.
 *
 * c9s never imports `cf` as a library: `cf` needs Node 22 and its config
 * loader does not run under Bun. Every call is a child process, and the
 * client below is the only place that knows how that process behaves.
 */

/** Where resource data comes from. */
export type CfMode = "live" | "local" | "demo";

/** Account and zone context applied to every call. */
export interface CfContext {
  readonly accountId?: string;
  /** Zone ID or domain name, passed to `cf` as `--zone`. */
  readonly zone?: string;
}

export interface CfRequest {
  /** Arguments after `cf`, for example `["zones", "list"]`. */
  readonly argv: readonly string[];
  readonly context?: CfContext;
  readonly signal?: AbortSignal;
}

/**
 * What a `cf` call printed on stdout.
 *
 * Structured API results are JSON. Some generated commands (KV values, R2
 * objects) print their payload as-is, so text is a separate case. Successful
 * mutations with a null result print nothing.
 */
export type CfResult =
  | { readonly kind: "json"; readonly data: unknown }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "empty" };

export interface CfClient {
  readonly mode: CfMode;
  run: (request: CfRequest) => Promise<CfResult>;
  /** The `cf` version string, for example `1.0.0-beta.5`. */
  version: () => Promise<string>;
}

/** Why a call failed, when c9s can tell. */
export type CfErrorCode =
  | "auth"
  | "not-found"
  | "no-local-equivalent"
  | "missing-cli"
  | "timeout"
  | "aborted"
  | "no-fixture"
  | "failed";

export class CfError extends Error {
  readonly code: CfErrorCode;
  readonly argv: readonly string[];
  readonly exitCode: number | null;

  constructor(
    message: string,
    options: { code?: CfErrorCode; argv?: readonly string[]; exitCode?: number | null } = {},
  ) {
    super(message);
    this.name = "CfError";
    this.code = options.code ?? "failed";
    this.argv = options.argv ?? [];
    this.exitCode = options.exitCode ?? null;
  }
}

/** Format argv the way a user would type it, for errors and help text. */
export const formatCommand = function formatCommand(argv: readonly string[]): string {
  const quoted = argv.map((arg) => (/^[\w./:@=-]+$/u.test(arg) ? arg : JSON.stringify(arg)));
  return ["cf", ...quoted].join(" ");
};
