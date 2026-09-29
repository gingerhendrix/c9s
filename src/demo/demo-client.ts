import { CfError, formatCommand } from "../cf/types.ts";
import type { CfClient, CfContext, CfRequest, CfResult } from "../cf/types.ts";
import { ACME, createDemoDataset } from "./fixtures.ts";
import type { DemoDataset } from "./fixtures.ts";

export interface DemoClientOptions {
  /** Simulated latency range in milliseconds, so loading states are visible. */
  readonly latency?: readonly [number, number];
  readonly now?: number;
}

interface ParsedArgv {
  readonly words: readonly string[];
  readonly flags: ReadonlyMap<string, string>;
}

/** Split argv into command words and `--flag value` pairs. */
export const parseArgv = function parseArgv(argv: readonly string[]): ParsedArgv {
  const words: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg.startsWith("--")) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        flags.set(arg.slice(2), "true");
      } else {
        flags.set(arg.slice(2), next);
        index += 1;
      }
    } else {
      words.push(arg);
    }
  }
  return { flags, words };
};

const json = (data: unknown): CfResult => ({ data, kind: "json" });

const sleep = async (ms: number, signal?: AbortSignal): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new CfError("Cancelled", { code: "aborted" }));
      },
      { once: true },
    );
  });
};

/**
 * A `CfClient` backed by fixtures instead of the Cloudflare API. It answers
 * the same argv the curated resource kinds send, so every view works offline.
 */
export const createDemoClient = function createDemoClient(options: DemoClientOptions = {}): CfClient {
  const data: DemoDataset = createDemoDataset(options.now);
  const [minLatency, maxLatency] = options.latency ?? [120, 520];

  const account = (context: CfContext | undefined): string => {
    const id = context?.accountId ?? ACME;
    if (!data.accounts.some((candidate) => candidate.id === id)) {
      throw new CfError(`Account ${id} is not in the demo dataset`, { code: "not-found" });
    }
    return id;
  };

  const zoneId = (context: CfContext | undefined): string => {
    const zone = context?.zone;
    if (zone === undefined || zone === "") {
      throw new CfError("This command needs a zone. Pick one in :zones first.", { code: "failed" });
    }
    const match = data.zones.find((candidate) => candidate.id === zone || candidate.name === zone);
    if (match === undefined || typeof match.id !== "string") {
      throw new CfError(`Zone ${zone} not found`, { code: "not-found" });
    }
    return match.id;
  };

  const byId = <T extends Record<string, unknown>>(
    rows: readonly T[] | undefined,
    key: string,
    value: string | undefined,
  ): T => {
    const match = rows?.find((row) => row[key] === value);
    if (match === undefined) {
      throw new CfError(`${value ?? "resource"} not found`, { code: "not-found" });
    }
    return match;
  };

  const answer = (request: CfRequest): CfResult => {
    const { words, flags } = parseArgv(request.argv);
    const command = words.join(" ");
    const context = request.context;

    switch (command) {
      case "--version":
      case "":
        return { kind: "text", text: "cf · v1.0.0-beta.5 (demo)\n" };
      case "accounts list":
        return json(data.accounts);
      case "accounts get":
        return json(byId(data.accounts, "id", account(context)));
      case "zones list": {
        const filter = flags.get("account-id");
        return json(
          data.zones.filter(
            (zone) => filter === undefined || (zone.account as { id?: string } | undefined)?.id === filter,
          ),
        );
      }
      case "zones get":
        return json(byId(data.zones, "id", zoneId(context)));
      case "dns records list":
        return json(data.dnsRecords.get(zoneId(context)) ?? []);
      case "workers list":
        return json(data.workers.get(account(context)) ?? []);
      case "workers versions list":
        return json(data.workerVersions.get(flags.get("worker-id") ?? "") ?? []);
      case "workers deployments list":
        return json({ deployments: data.workerDeployments.get(flags.get("worker") ?? "") ?? [] });
      case "kv namespaces list":
        return json(data.kvNamespaces.get(account(context)) ?? []);
      case "kv keys list":
        return json(data.kvKeys.get(flags.get("namespace-id") ?? "") ?? []);
      case "r2 buckets list":
        return json({ buckets: data.r2Buckets.get(account(context)) ?? [] });
      case "r2 objects list":
        return json(data.r2Objects.get(flags.get("bucket-name") ?? "") ?? []);
      case "d1 list":
        return json(data.d1.get(account(context)) ?? []);
      case "queues list":
        return json(data.queues.get(account(context)) ?? []);
      case "queues consumers list":
        return json(data.queueConsumers.get(flags.get("queue-id") ?? "") ?? []);
      case "tunnels list":
        return json(data.tunnels.get(account(context)) ?? []);
      case "pages projects list":
        return json(data.pages.get(account(context)) ?? []);
      case "pages projects deployments list":
        return json(data.pagesDeployments.get(flags.get("project-name") ?? "") ?? []);
      case "durable-objects namespaces list":
        return json(data.doNamespaces.get(account(context)) ?? []);
      case "durable-objects namespaces objects list":
        return json(data.doObjects.get(flags.get("id") ?? "") ?? []);
      default:
        break;
    }

    // `<group> get <id>` for the curated kinds.
    const getTarget = words.at(-1);
    const getCommand = words.slice(0, -1).join(" ");
    switch (getCommand) {
      case "dns records get":
        return json(byId(data.dnsRecords.get(zoneId(context)), "id", getTarget));
      case "workers get":
        return json(byId(data.workers.get(account(context)), "id", getTarget));
      case "workers versions get":
        return json(byId(data.workerVersions.get(flags.get("worker-id") ?? ""), "id", getTarget));
      case "kv namespaces get":
        return json(byId(data.kvNamespaces.get(account(context)), "id", getTarget));
      case "kv keys get": {
        const value = data.kvValues.get(`${flags.get("namespace-id") ?? ""}:${getTarget ?? ""}`);
        if (value === undefined) {
          throw new CfError(`Key ${getTarget ?? ""} not found`, { code: "not-found" });
        }
        return { kind: "text", text: value };
      }
      case "r2 buckets get":
        return json(byId(data.r2Buckets.get(account(context)), "name", getTarget));
      case "d1 get":
        return json(byId(data.d1.get(account(context)), "uuid", getTarget));
      case "queues get":
        return json(byId(data.queues.get(account(context)), "queue_id", getTarget));
      case "tunnels get":
        return json(byId(data.tunnels.get(account(context)), "id", getTarget));
      case "pages projects get":
        return json(byId(data.pages.get(account(context)), "name", getTarget));
      default:
        break;
    }

    const zoneFixture = context?.zone === undefined ? undefined : data.zoneGeneric.get(zoneId(context));
    const fixtureFor = (name: string): unknown =>
      zoneFixture?.get(name) ?? data.generic.get(account(context))?.get(name);
    const fixture = fixtureFor(command);
    if (fixture !== undefined) {
      return json(fixture);
    }
    // `<group> get <id>` for a generic fixture: find the item in `<group> list`.
    if (words.at(-2) === "get") {
      const listed = fixtureFor(`${words.slice(0, -2).join(" ")} list`);
      const item = Array.isArray(listed)
        ? listed.find(
            (candidate: unknown) =>
              typeof candidate === "object" &&
              candidate !== null &&
              Object.values(candidate).some((value) => value === getTarget),
          )
        : undefined;
      if (item !== undefined) {
        return json(item);
      }
    }
    if (command.endsWith(" list")) {
      // Most catalogue commands have no demo data; an empty list still shows the view.
      return json([]);
    }
    throw new CfError(`Demo mode has no data for \`${formatCommand(request.argv)}\`.`, {
      argv: request.argv,
      code: "no-fixture",
    });
  };

  return {
    mode: "demo",
    run: async (request) => {
      const span = Math.max(0, maxLatency - minLatency);
      await sleep(minLatency + Math.random() * span, request.signal);
      return answer(request);
    },
    version: async () => await Promise.resolve("1.0.0-beta.5"),
  };
};
