import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import type { Catalogue } from "../cf/catalogue.ts";
import type { CfClient } from "../cf/types.ts";
import type { QueryCache, QueryEntry, QueryRequest } from "../data/query-cache.ts";
import { queryKey } from "../data/query-cache.ts";
import type { SessionStore } from "../data/session.ts";
import type { Registry } from "../resources/registry.ts";
import type { SessionContext } from "../resources/types.ts";

export interface AppOptions {
  /** Auto-refresh interval for resource views; 0 turns it off. */
  readonly refreshMs: number;
  /** The c9s package version. */
  readonly version: string;
  /** `cf` version, filled in once known. */
  readonly cfVersion: Promise<string>;
  /** Minimum time the splash screen stays up, so it does not flash. */
  readonly splashMs: number;
}

/** Everything a screen needs that is not React state. */
export interface AppServices {
  readonly client: CfClient;
  readonly cache: QueryCache;
  readonly session: SessionStore;
  readonly registry: Registry;
  readonly catalogue: Catalogue | null;
  readonly options: AppOptions;
}

const ServicesContext = createContext<AppServices | null>(null);

export const ServicesProvider = function ServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}): ReactNode {
  return <ServicesContext value={services}>{children}</ServicesContext>;
};

export const useServices = function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (services === null) {
    throw new Error("useServices() needs a ServicesProvider");
  }
  return services;
};

export const useSession = function useSession(): SessionContext {
  const { session } = useServices();
  return useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.state,
  );
};

export interface QueryOptions {
  /** Refresh in the background on this interval while mounted. */
  readonly refreshMs?: number;
  /** Refresh on mount when the cached entry is older than this. */
  readonly staleMs?: number;
  /** Stop the interval, e.g. while an overlay is open. */
  readonly paused?: boolean;
}

export interface QueryHandle {
  readonly entry: QueryEntry | undefined;
  readonly refresh: () => void;
}

/** Subscribe to one `cf` call, loading it on mount and refreshing on an interval. */
export const useQuery = function useQuery(
  request: QueryRequest | null,
  options: QueryOptions = {},
): QueryHandle {
  const { cache } = useServices();
  const key = request === null ? null : queryKey(request);
  const requestRef = useRef(request);
  requestRef.current = request;
  const staleMs = options.staleMs ?? 15_000;

  const entry = useSyncExternalStore(
    (listener) => cache.subscribe(listener),
    () => (key === null ? undefined : cache.get(key)),
  );

  useEffect(() => {
    const current = requestRef.current;
    if (key === null || current === null) {
      return;
    }
    const cached = cache.get(key);
    const stale = cached?.fetchedAt !== undefined && Date.now() - cached.fetchedAt > staleMs;
    void cache.load(current, { force: stale });
  }, [cache, key, staleMs]);

  const { refreshMs, paused } = options;
  useEffect(() => {
    if (key === null || refreshMs === undefined || refreshMs <= 0 || paused === true) {
      return;
    }
    const timer = setInterval(() => {
      const current = requestRef.current;
      if (current !== null) {
        void cache.load(current, { force: true });
      }
    }, refreshMs);
    return () => {
      clearInterval(timer);
    };
  }, [cache, key, refreshMs, paused]);

  const refresh = useCallback(() => {
    const current = requestRef.current;
    if (current !== null) {
      void cache.load(current, { force: true });
    }
  }, [cache]);

  return { entry, refresh };
};

/** Resolve a promise into state; `undefined` until it settles. */
export const usePromise = function usePromise<T>(promise: Promise<T>): T | undefined {
  const store = useRef<{ value?: T; listeners: Set<() => void> }>({ listeners: new Set() });
  useEffect(() => {
    let active = true;
    void promise.then(
      (value) => {
        if (active) {
          store.current.value = value;
          for (const listener of store.current.listeners) {
            listener();
          }
        }
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [promise]);
  return useSyncExternalStore(
    (listener) => {
      store.current.listeners.add(listener);
      return () => {
        store.current.listeners.delete(listener);
      };
    },
    () => store.current.value,
  );
};
