import type { SessionContext } from "../resources/types.ts";

/**
 * The account and zone the user is working in, like a k9s context and
 * namespace. Account-scoped calls get `CLOUDFLARE_ACCOUNT_ID`; zone-scoped
 * calls get `--zone`.
 */
export class SessionStore {
  #state: SessionContext;
  readonly #listeners = new Set<() => void>();

  constructor(initial: SessionContext = {}) {
    this.#state = initial;
  }

  get state(): SessionContext {
    return this.#state;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Switch account. The zone belongs to the old account, so it is cleared. */
  useAccount(accountId: string, accountName?: string): void {
    if (this.#state.accountId === accountId && this.#state.accountName === accountName) {
      return;
    }
    this.#set({ accountId, accountName });
  }

  useZone(zoneId: string, zoneName?: string): void {
    if (this.#state.zoneId === zoneId && this.#state.zoneName === zoneName) {
      return;
    }
    this.#set({ ...this.#state, zoneId, zoneName });
  }

  #set(next: SessionContext): void {
    this.#state = next;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
