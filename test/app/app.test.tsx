import { afterEach, describe, expect, test } from "bun:test";

import { App, providerOptions } from "../../src/app/app.tsx";
import { createC9sRouter } from "../../src/app/router.ts";
import type { AppServices } from "../../src/app/services.tsx";
import { QueryCache } from "../../src/data/query-cache.ts";
import { SessionStore } from "../../src/data/session.ts";
import { createDemoClient } from "../../src/demo/demo-client.ts";
import { ACME } from "../../src/demo/fixtures.ts";
import { createRegistry } from "../../src/resources/registry.ts";
import { copied } from "../setup.ts";
import { renderTui } from "../support/render.tsx";

type Session = Awaited<ReturnType<typeof renderTui>>;
let session: Session | undefined;

afterEach(() => {
  session?.destroy();
  session = undefined;
});

const start = async (options: { accountId?: string } = { accountId: ACME }): Promise<Session> => {
  const client = createDemoClient({ latency: [0, 0] });
  const services: AppServices = {
    cache: new QueryCache(client),
    catalogue: null,
    client,
    options: { cfVersion: client.version(), refreshMs: 0, splashMs: 0, version: "test" },
    registry: createRegistry(null),
    session: new SessionStore({ accountId: options.accountId }),
  };
  const router = createC9sRouter();
  await router.start();
  session = await renderTui(<App services={services} router={router} />, { provider: providerOptions() });
  return session;
};

describe("c9s in demo mode", () => {
  test("boots into zones, drills into DNS, describes a record and comes back", async () => {
    const tui = await start();
    const zones = await tui.waitFor("Zones(Acme Robotics)[6]");
    expect(zones).toContain("acme-robotics.com");
    expect(zones).toContain("<zones>");

    await tui.press("enter");
    const dns = await tui.waitFor("DNS Records(acme-robotics.com)[19]");
    expect(dns).toContain("☁ proxied");
    expect(dns).toContain("<dns(acme-robotics.com)>");
    expect(dns).toContain("Zone:    acme-robotics.com");

    await tui.press("d");
    const described = await tui.waitFor("Describe(dns records/A acme-robotics.com)");
    expect(described).toContain("content: 192.0.2.10");

    await tui.press("f");
    expect(await tui.waitFor('"content": "192.0.2.10"')).toContain('"type": "A"');

    await tui.press("escape");
    await tui.waitFor("DNS Records(acme-robotics.com)[19]");
    await tui.press("escape");
    expect(await tui.waitFor("Zones(Acme Robotics)[6]")).toContain("acme-robotics.com (*)");
  });

  test("filters rows k9s-style", async () => {
    const tui = await start();
    await tui.waitFor("Zones(Acme Robotics)[6]");
    await tui.press("enter");
    await tui.waitFor("DNS Records(acme-robotics.com)[19]");

    await tui.press("/");
    await tui.type("cname");
    const filtered = await tui.waitFor("[7/19]");
    expect(filtered).toContain("</cname>");
    expect(filtered).not.toContain("route1.mx.cloudflare.net");

    await tui.press("enter");
    await tui.press("escape");
    expect(await tui.waitFor("DNS Records(acme-robotics.com)[19]")).toContain("route1.mx.cloudflare.net");
  });

  test("jumps to a resource with : and copies an ID", async () => {
    const tui = await start();
    await tui.waitFor("Zones(Acme Robotics)[6]");

    await tui.press(":");
    await tui.waitFor("Resources  (11 curated");
    await tui.type("workers");
    await tui.press("enter");
    const workers = await tui.waitFor("Workers(Acme Robotics)[8]");
    expect(workers).toContain("api-gateway");

    copied.length = 0;
    await tui.press("c");
    await tui.waitFor("Copied");
    expect(copied).toHaveLength(1);
  });

  test("sorts, and shows help", async () => {
    const tui = await start();
    await tui.waitFor("Zones(Acme Robotics)[6]");
    await tui.press("s");
    expect(await tui.waitFor("NAME↑")).toMatch(/acme-robotics\.com[\s\S]*acme-status\.io[\s\S]*acme\.dev/u);
    await tui.press("s", { shift: true });
    await tui.waitFor("NAME↓");

    await tui.press("?");
    expect(await tui.waitFor("c9s keys")).toContain("Jump to resource");
    await tui.press("escape");
    await tui.waitUntil((frame) => !frame.includes("c9s keys"), "help to close");
  });

  test("asks for an account when several are visible", async () => {
    const tui = await start({});
    const accounts = await tui.waitFor("Accounts(all)[2]");
    expect(accounts).toContain("Gareth (personal)");
    await tui.press("j");
    await tui.press("enter");
    expect(await tui.waitFor("Zones(Gareth (personal))[2]")).toContain("tooee.dev");
  });
});
