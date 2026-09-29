import { launchCli } from "@tooee/shell";

import pkg from "../package.json" with { type: "json" };
import { App, providerOptions } from "./app/app.tsx";
import type { ResourceTarget } from "./app/navigation.ts";
import { createC9sRouter } from "./app/router.ts";
import type { AppServices } from "./app/services.tsx";
import { ArgsError, parseArgs, USAGE } from "./args.ts";
import { loadCatalogue } from "./cf/catalogue.ts";
import { createProcessClient } from "./cf/process-client.ts";
import { QueryCache } from "./data/query-cache.ts";
import { SessionStore } from "./data/session.ts";
import { createDemoClient } from "./demo/demo-client.ts";
import { ACME } from "./demo/fixtures.ts";
import { createRegistry } from "./resources/registry.ts";
import { shortName } from "./ui/pickers.tsx";

const main = async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), process.env);
  } catch (error) {
    if (error instanceof ArgsError) {
      process.stderr.write(`c9s: ${error.message}\n\n${USAGE}`);
      return 2;
    }
    throw error;
  }
  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`c9s ${pkg.version}\n`);
    return 0;
  }

  const catalogue = loadCatalogue(args.cfBin);
  const registry = createRegistry(catalogue);

  if (args.listResources) {
    const lines = registry.openable.map(
      (kind) => `${shortName(kind).padEnd(44)} ${kind.title}${kind.generic === true ? "" : "  (curated)"}`,
    );
    const source =
      catalogue === null ? " (cf catalogue not found; curated only)" : ` from ${catalogue.source}`;
    // A closed pipe (`c9s --resources | head`) is not an error.
    process.stdout.on("error", () => undefined);
    process.stdout.write(`${lines.join("\n")}\n\n${registry.openable.length} resources${source}\n`);
    return 0;
  }

  let target: ResourceTarget | undefined;
  if (args.resource !== undefined) {
    const kind = registry.resolve(args.resource);
    if (kind === undefined) {
      process.stderr.write(`c9s: unknown resource "${args.resource}". Run c9s --resources to list them.\n`);
      return 2;
    }
    target = { kind: kind.id, params: {} };
  }

  const client = args.demo
    ? createDemoClient()
    : createProcessClient({ bin: args.cfBin, local: args.local, persistTo: args.persistTo });
  const cfVersion = client.version();
  // Boot reads the version; this handler only stops an unhandled-rejection warning.
  cfVersion.catch(() => undefined);

  const session = new SessionStore({
    accountId: args.account ?? (args.demo ? ACME : undefined),
    zoneId: args.zone,
    zoneName: args.zone,
  });
  const cache = new QueryCache(client);
  const services: AppServices = {
    cache,
    catalogue,
    client,
    options: { cfVersion, refreshMs: args.refresh * 1000, splashMs: 900, version: pkg.version },
    registry,
    session,
  };

  const router = createC9sRouter(target);
  const started = await router.start();
  if (started.status !== "committed") {
    throw started.status === "failed" ? started.error : new Error(`Router startup ${started.status}`);
  }

  const handle = await launchCli(<App services={services} router={router} />, {
    provider: providerOptions(args.theme),
  });
  if (!handle.destroyed) {
    await new Promise<void>((resolve) => {
      handle.renderer.once("destroy", () => {
        resolve();
      });
    });
  }
  cache.dispose();
  return 0;
};

try {
  const code = await main();
  process.exitCode = code;
} catch (error) {
  process.stderr.write(`c9s: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
}
