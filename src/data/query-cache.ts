import { CfError } from "../cf/types.ts";
import type { CfClient, CfContext, CfResult } from "../cf/types.ts";

export type QueryStatus = "loading" | "ready" | "error";

/** One cached `cf` call. Stale data stays visible while a refresh runs. */
export interface QueryEntry {
  readonly status: QueryStatus;
  readonly result?: CfResult;
  readonly error?: CfError;
  readonly fetchedAt?: number;
  /** A request is in flight. With `status: "ready"` this is a background refresh. */
  readonly fetching: boolean;
  /** How long the last successful call took. */
  readonly durationMs?: number;
}

export interface QueryRequest {
  readonly argv: readonly string[];
  readonly context?: CfContext;
}

/** Cache key: the argv plus the context that changes what `cf` returns. */
export const queryKey = function queryKey(request: QueryRequest): string {
  return JSON.stringify([request.argv, request.context?.accountId ?? "", request.context?.zone ?? ""]);
};

const toCfError = (error: unknown): CfError =>
  error instanceof CfError ? error : new CfError(error instanceof Error ? error.message : String(error));

/**
 * A small external store for `cf` results, read with `useSyncExternalStore`.
 *
 * - Concurrent loads of one key share one process.
 * - A refresh keeps the previous rows on screen (stale-while-revalidate),
 *   which is what makes back-navigation and auto-refresh feel instant.
 * - Entries are replaced, never mutated, so React can compare by reference.
 */
export class QueryCache {
  readonly #client: CfClient;
  readonly #entries = new Map<string, QueryEntry>();
  readonly #inflight = new Map<string, AbortController>();
  readonly #listeners = new Set<() => void>();
  #disposed = false;

  constructor(client: CfClient) {
    this.#client = client;
  }

  get client(): CfClient {
    return this.#client;
  }

  get(key: string): QueryEntry | undefined {
    return this.#entries.get(key);
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Load a request unless it is cached. `force` refreshes a cached entry. */
  load(request: QueryRequest, options: { force?: boolean } = {}): Promise<QueryEntry> {
    const key = queryKey(request);
    const existing = this.#entries.get(key);
    if (this.#disposed) {
      return Promise.resolve(existing ?? { fetching: false, status: "loading" });
    }
    if (this.#inflight.has(key)) {
      return this.#waitFor(key);
    }
    if (existing !== undefined && options.force !== true) {
      return Promise.resolve(existing);
    }

    const controller = new AbortController();
    this.#inflight.set(key, controller);
    this.#set(
      key,
      existing === undefined ? { fetching: true, status: "loading" } : { ...existing, fetching: true },
    );
    const started = performance.now();

    // Clear the in-flight marker before notifying, so a subscriber that
    // forces a refresh in response starts a new call instead of joining this one.
    const settle = (): boolean => {
      if (this.#inflight.get(key) !== controller) {
        return false;
      }
      this.#inflight.delete(key);
      return true;
    };

    void this.#client.run({ argv: request.argv, context: request.context, signal: controller.signal }).then(
      (result) => {
        if (!settle()) {
          return;
        }
        this.#set(key, {
          durationMs: Math.round(performance.now() - started),
          fetchedAt: Date.now(),
          fetching: false,
          result,
          status: "ready",
        });
      },
      (error: unknown) => {
        const cfError = toCfError(error);
        if (!settle() || cfError.code === "aborted") {
          return;
        }
        const previous = this.#entries.get(key);
        // Keep stale rows after a failed refresh; surface the error beside them.
        this.#set(
          key,
          previous?.result === undefined
            ? { error: cfError, fetchedAt: Date.now(), fetching: false, status: "error" }
            : { ...previous, error: cfError, fetching: false },
        );
      },
    );
    return this.#waitFor(key);
  }

  /** Drop every cached entry, e.g. after an account switch. */
  clear(): void {
    for (const controller of this.#inflight.values()) {
      controller.abort();
    }
    this.#inflight.clear();
    this.#entries.clear();
    this.#emit();
  }

  dispose(): void {
    this.#disposed = true;
    for (const controller of this.#inflight.values()) {
      controller.abort();
    }
    this.#inflight.clear();
    this.#listeners.clear();
  }

  #waitFor(key: string): Promise<QueryEntry> {
    return new Promise((resolve) => {
      const check = (): boolean => {
        const entry = this.#entries.get(key);
        if (entry !== undefined && !entry.fetching) {
          resolve(entry);
          return true;
        }
        return false;
      };
      if (check()) {
        return;
      }
      const unsubscribe = this.subscribe(() => {
        if (check()) {
          unsubscribe();
        }
      });
    });
  }

  #set(key: string, entry: QueryEntry): void {
    this.#entries.set(key, entry);
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
