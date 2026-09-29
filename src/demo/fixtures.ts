/**
 * Demo data for `c9s --demo`: two fictional accounts with zones, DNS,
 * Workers, KV, R2, D1, Queues, Pages, Durable Objects and Tunnels.
 *
 * Shapes follow the Cloudflare API responses that `cf` prints, so the same
 * column definitions render live and demo data. IDs are deterministic and
 * timestamps are relative to "now", so ages always look plausible.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };

/** Deterministic 32-character hex ID derived from a seed string. */
export const hexId = function hexId(seed: string, length = 32): string {
  let out = "";
  let hash = 2166136261;
  let round = 0;
  while (out.length < length) {
    for (const char of `${seed}:${round}`) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    out += hash.toString(16).padStart(8, "0");
    round += 1;
  }
  return out.slice(0, length);
};

const uuid = (seed: string): string => {
  const hex = hexId(seed);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const UNITS: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000, w: 604_800_000 };

/** ISO timestamp for a duration ago, e.g. `ago("3d")`. */
const agoFrom =
  (now: number) =>
  (spec: string): string => {
    const match = /^(\d+)([smhdw])$/u.exec(spec);
    const amount = Number(match?.[1] ?? 0);
    const unit = UNITS[match?.[2] ?? "s"] ?? 1000;
    return new Date(now - amount * unit).toISOString();
  };

export interface DemoAccount {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly created_on: string;
}

export interface DemoDataset {
  readonly accounts: Obj[];
  readonly zones: Obj[];
  readonly dnsRecords: ReadonlyMap<string, Obj[]>;
  readonly workers: ReadonlyMap<string, Obj[]>;
  readonly workerVersions: ReadonlyMap<string, Obj[]>;
  readonly workerDeployments: ReadonlyMap<string, Obj[]>;
  readonly kvNamespaces: ReadonlyMap<string, Obj[]>;
  readonly kvKeys: ReadonlyMap<string, Obj[]>;
  readonly kvValues: ReadonlyMap<string, string>;
  readonly r2Buckets: ReadonlyMap<string, Obj[]>;
  readonly r2Objects: ReadonlyMap<string, Obj[]>;
  readonly d1: ReadonlyMap<string, Obj[]>;
  readonly queues: ReadonlyMap<string, Obj[]>;
  readonly queueConsumers: ReadonlyMap<string, Obj[]>;
  readonly tunnels: ReadonlyMap<string, Obj[]>;
  readonly pages: ReadonlyMap<string, Obj[]>;
  readonly pagesDeployments: ReadonlyMap<string, Obj[]>;
  readonly doNamespaces: ReadonlyMap<string, Obj[]>;
  readonly doObjects: ReadonlyMap<string, Obj[]>;
  /** Extra generic catalogue commands, keyed by `path words`, per account. */
  readonly generic: ReadonlyMap<string, ReadonlyMap<string, Json>>;
  readonly zoneGeneric: ReadonlyMap<string, ReadonlyMap<string, Json>>;
}

export const ACME = hexId("acct:acme");
export const PERSONAL = hexId("acct:personal");

const plan = (name: string, price: number): Obj => ({
  can_subscribe: false,
  currency: "USD",
  externally_managed: false,
  frequency: price === 0 ? "" : "monthly",
  id: hexId(`plan:${name}`),
  is_subscribed: true,
  legacy_discount: false,
  legacy_id: name.toLowerCase().split(" ")[0] ?? "free",
  name,
  price,
});

export const createDemoDataset = function createDemoDataset(now = Date.now()): DemoDataset {
  const ago = agoFrom(now);
  const accounts: Obj[] = [
    {
      created_on: ago("900d"),
      id: ACME,
      name: "Acme Robotics",
      settings: { abuse_contact_email: "abuse@acme-robotics.com", enforce_twofactor: true },
      type: "enterprise",
    },
    {
      created_on: ago("1400d"),
      id: PERSONAL,
      name: "Gareth (personal)",
      settings: { abuse_contact_email: null, enforce_twofactor: true },
      type: "standard",
    },
  ];
  const accountRef = (id: string): Obj => ({ id, name: accounts.find((a) => a.id === id)?.name ?? "" });

  const zone = (
    account: string,
    name: string,
    status: string,
    planName: string,
    price: number,
    age: string,
    extra: Obj = {},
  ): Obj => ({
    account: accountRef(account),
    activated_on: status === "active" ? ago(age) : null,
    created_on: ago(age),
    development_mode: 0,
    id: hexId(`zone:${name}`),
    meta: {
      cdn_only: false,
      dns_only: false,
      foundation_dns: false,
      page_rule_quota: 3,
      phishing_detected: false,
    },
    modified_on: ago("2d"),
    name,
    name_servers: ["ada.ns.cloudflare.com", "lloyd.ns.cloudflare.com"],
    original_dnshost: null,
    original_name_servers: ["ns1.registrar-servers.com", "ns2.registrar-servers.com"],
    original_registrar: "namecheap, inc.",
    owner: { email: null, id: null, type: "organization" },
    paused: false,
    permissions: ["#zone:read", "#dns_records:read", "#worker:read"],
    plan: plan(planName, price),
    status,
    type: "full",
    ...extra,
  });

  const zones: Obj[] = [
    zone(ACME, "acme-robotics.com", "active", "Business Website", 200, "880d"),
    zone(ACME, "acme.dev", "active", "Pro Website", 20, "610d"),
    zone(ACME, "rocketparts.shop", "pending", "Free Website", 0, "3d"),
    zone(ACME, "acme-status.io", "active", "Pro Website", 20, "400d"),
    zone(ACME, "legacy-acme.net", "active", "Free Website", 0, "1200d", { paused: true }),
    zone(ACME, "acmebots.ai", "initializing", "Free Website", 0, "40m"),
    zone(PERSONAL, "gandrew.dev", "active", "Free Website", 0, "1300d"),
    zone(PERSONAL, "tooee.dev", "active", "Free Website", 0, "200d"),
  ];

  // --- DNS ------------------------------------------------------------------
  const dnsRecords = new Map<string, Obj[]>();
  const record = (
    zoneName: string,
    type: string,
    name: string,
    content: string,
    options: { proxied?: boolean; ttl?: number; comment?: string; priority?: number; age?: string } = {},
  ): Obj => {
    const fqdn = name === "@" ? zoneName : `${name}.${zoneName}`;
    const proxiable = ["A", "AAAA", "CNAME"].includes(type);
    return {
      comment: options.comment ?? null,
      content,
      created_on: ago(options.age ?? "300d"),
      id: hexId(`dns:${zoneName}:${type}:${name}:${content}`),
      meta: {},
      modified_on: ago(options.age ?? "300d"),
      name: fqdn,
      proxiable,
      proxied: proxiable ? (options.proxied ?? true) : false,
      settings: {},
      tags: [],
      ttl: options.ttl ?? 1,
      type,
      ...(options.priority === undefined ? {} : { priority: options.priority }),
    };
  };
  const mailRecords = (zoneName: string): Obj[] => [
    record(zoneName, "MX", "@", "route1.mx.cloudflare.net", { priority: 12, ttl: 3600 }),
    record(zoneName, "MX", "@", "route2.mx.cloudflare.net", { priority: 55, ttl: 3600 }),
    record(zoneName, "TXT", "@", '"v=spf1 include:_spf.mx.cloudflare.net ~all"', { ttl: 3600 }),
    record(zoneName, "TXT", "_dmarc", '"v=DMARC1; p=quarantine; rua=mailto:dmarc@acme-robotics.com"', {
      ttl: 3600,
    }),
  ];
  dnsRecords.set(hexId("zone:acme-robotics.com"), [
    record("acme-robotics.com", "A", "@", "192.0.2.10", { comment: "Origin LB (eu-west)" }),
    record("acme-robotics.com", "AAAA", "@", "2001:db8:acme::10"),
    record("acme-robotics.com", "CNAME", "www", "acme-robotics.com"),
    record("acme-robotics.com", "CNAME", "api", "api-gateway.acme.workers.dev", {
      age: "40d",
      comment: "Worker: api-gateway",
    }),
    record("acme-robotics.com", "CNAME", "img", "image-resizer.acme.workers.dev", { age: "35d" }),
    record("acme-robotics.com", "CNAME", "docs", "acme-docs.pages.dev", { age: "120d" }),
    record("acme-robotics.com", "CNAME", "shop", "shops.myshopify.com", { proxied: false, ttl: 300 }),
    record("acme-robotics.com", "A", "vpn", "198.51.100.23", {
      proxied: false,
      ttl: 120,
      comment: "WireGuard",
    }),
    record("acme-robotics.com", "A", "grafana", "203.0.113.40", { comment: "Behind Access" }),
    record("acme-robotics.com", "CNAME", "status", "acme-status.io", { proxied: false }),
    ...mailRecords("acme-robotics.com"),
    record("acme-robotics.com", "TXT", "@", '"google-site-verification=Zb3v9Q-acme-demo"', { ttl: 3600 }),
    record("acme-robotics.com", "CAA", "@", '0 issue "letsencrypt.org"', { ttl: 3600 }),
    record("acme-robotics.com", "CAA", "@", '0 issue "pki.goog"', { ttl: 3600 }),
    record("acme-robotics.com", "SRV", "_sip._tls", "10 60 5061 sip.acme-robotics.com", { ttl: 3600 }),
    record("acme-robotics.com", "CNAME", "staging", "staging.acme-robotics.com.cdn.cloudflare.net", {
      age: "2h",
      comment: "Temporary: remove after launch",
    }),
  ]);
  dnsRecords.set(hexId("zone:acme.dev"), [
    record("acme.dev", "A", "@", "192.0.2.44"),
    record("acme.dev", "CNAME", "www", "acme.dev"),
    record("acme.dev", "CNAME", "preview", "marketing-site.pages.dev", { age: "9d" }),
    record("acme.dev", "CNAME", "og", "og-image-renderer.acme.workers.dev", { age: "15d" }),
    ...mailRecords("acme.dev"),
  ]);
  dnsRecords.set(hexId("zone:rocketparts.shop"), [
    record("rocketparts.shop", "A", "@", "192.0.2.80", { age: "3d" }),
    record("rocketparts.shop", "CNAME", "www", "rocketparts.shop", { age: "3d" }),
  ]);
  dnsRecords.set(hexId("zone:acme-status.io"), [
    record("acme-status.io", "CNAME", "@", "status-page.acme.workers.dev"),
    record("acme-status.io", "TXT", "@", '"v=spf1 -all"', { ttl: 3600 }),
  ]);
  dnsRecords.set(hexId("zone:legacy-acme.net"), [
    record("legacy-acme.net", "A", "@", "198.51.100.200", { age: "1100d", proxied: false }),
    record("legacy-acme.net", "CNAME", "www", "legacy-acme.net", { age: "1100d" }),
  ]);
  dnsRecords.set(hexId("zone:acmebots.ai"), []);
  dnsRecords.set(hexId("zone:gandrew.dev"), [
    record("gandrew.dev", "CNAME", "@", "gandrew-com.pages.dev"),
    record("gandrew.dev", "CNAME", "www", "gandrew.dev"),
    ...mailRecords("gandrew.dev"),
  ]);
  dnsRecords.set(hexId("zone:tooee.dev"), [
    record("tooee.dev", "CNAME", "@", "tooee-site.pages.dev", { age: "190d" }),
    record("tooee.dev", "CNAME", "docs", "tooee-docs.acme.workers.dev", { age: "30d" }),
  ]);

  // --- Workers --------------------------------------------------------------
  const workers = new Map<string, Obj[]>();
  const workerVersions = new Map<string, Obj[]>();
  const workerDeployments = new Map<string, Obj[]>();
  const authors = ["maya@acme-robotics.com", "dev@acme-robotics.com", "ci@acme-robotics.com"];
  const sources = ["cf", "wrangler", "dash", "api"];
  const worker = (
    account: string,
    name: string,
    options: {
      age: string;
      updated: string;
      messages: string[];
      tags?: string[];
      observability?: boolean;
      logpush?: boolean;
      subdomain?: boolean;
      gradual?: boolean;
    },
  ): Obj => {
    const id = hexId(`worker:${name}`);
    const versions: Obj[] = options.messages.map((message, index) => {
      const number = options.messages.length - index;
      const hours = index === 0 ? Number.parseInt(options.updated, 10) : (index * 29 + 7) % 900;
      const unit = index === 0 ? options.updated.replace(/^\d+/u, "") || "h" : "h";
      const created = ago(`${hours}${unit}`);
      return {
        annotations: {
          "workers/message": message,
          "workers/tag": index === 0 ? `v${number}` : null,
          "workers/triggered_by": index % 3 === 0 ? "deployment" : "upload",
        },
        compatibility_date: "2026-08-15",
        compatibility_flags: ["nodejs_compat"],
        created_on: created,
        id: uuid(`version:${name}:${number}`),
        main_module: "index.js",
        source: sources[index % sources.length] ?? "cf",
        author_email: authors[index % authors.length] ?? "dev@acme-robotics.com",
        author_id: hexId(`author:${index % authors.length}`),
        number,
        urls: [`https://${uuid(`version:${name}:${number}`).slice(0, 8)}-${name}.acme.workers.dev`],
      };
    });
    workerVersions.set(id, versions);

    const latest = versions[0];
    const previous = versions[1];
    const deployments: Obj[] = [];
    if (latest !== undefined) {
      deployments.push({
        annotations: {
          "workers/message": options.gradual === true ? "Gradual rollout: 10% canary" : "Deploy",
          "workers/triggered_by": "deployment",
        },
        author_email: authors[0] ?? "",
        created_on: typeof latest.created_on === "string" ? latest.created_on : ago("1h"),
        id: uuid(`deployment:${name}:1`),
        source: "cf",
        strategy: "percentage",
        versions:
          options.gradual === true && previous !== undefined
            ? [
                { percentage: 10, version_id: latest.id ?? "" },
                { percentage: 90, version_id: previous.id ?? "" },
              ]
            : [{ percentage: 100, version_id: latest.id ?? "" }],
      });
    }
    if (previous !== undefined) {
      deployments.push({
        annotations: { "workers/message": "Deploy", "workers/triggered_by": "deployment" },
        author_email: authors[1] ?? "",
        created_on: typeof previous.created_on === "string" ? previous.created_on : ago("2d"),
        id: uuid(`deployment:${name}:0`),
        source: "wrangler",
        strategy: "percentage",
        versions: [{ percentage: 100, version_id: previous.id ?? "" }],
      });
    }
    workerDeployments.set(name, deployments);

    return {
      created_on: ago(options.age),
      id,
      logpush: options.logpush ?? false,
      name,
      observability: { enabled: options.observability ?? true, head_sampling_rate: 1 },
      references: { dispatch_namespace_outbounds: [], domains: [], durable_objects: [], queues: [] },
      subdomain: { enabled: options.subdomain ?? true, previews_enabled: true },
      tags: options.tags ?? [],
      tail_consumers: [],
      updated_on: typeof latest?.created_on === "string" ? latest.created_on : ago(options.updated),
    };
  };
  workers.set(ACME, [
    worker(ACME, "api-gateway", {
      age: "400d",
      gradual: true,
      logpush: true,
      messages: [
        "feat: token bucket rate limiting per API key",
        "fix: forward cf-ray to origin logs",
        "chore: bump compatibility date",
        "feat: OpenAPI schema validation",
        "fix: CORS preflight for PATCH",
        "feat: route /v2 to new origin",
        "initial deploy",
      ],
      tags: ["prod", "edge"],
      updated: "2h",
    }),
    worker(ACME, "image-resizer", {
      age: "300d",
      messages: [
        "feat: AVIF output",
        "perf: cache variants in R2",
        "fix: EXIF orientation",
        "initial deploy",
      ],
      tags: ["prod", "media"],
      updated: "3d",
    }),
    worker(ACME, "auth-edge", {
      age: "250d",
      messages: ["feat: passkeys", "fix: refresh token rotation", "feat: session store on Durable Objects"],
      tags: ["prod", "security"],
      updated: "6h",
    }),
    worker(ACME, "og-image-renderer", {
      age: "90d",
      messages: ["feat: dark mode cards", "initial deploy"],
      tags: ["marketing"],
      updated: "15d",
    }),
    worker(ACME, "cron-reporter", {
      age: "500d",
      messages: ["feat: weekly digest to Slack", "fix: timezone for UK summer time"],
      observability: false,
      subdomain: false,
      updated: "40d",
    }),
    worker(ACME, "webhooks-ingest", {
      age: "60d",
      logpush: true,
      messages: [
        "feat: verify Stripe signatures",
        "feat: fan out to Queues",
        "fix: retry on 429",
        "initial deploy",
      ],
      tags: ["prod"],
      updated: "30m",
    }),
    worker(ACME, "status-page", {
      age: "400d",
      messages: ["chore: new incident template"],
      tags: ["public"],
      updated: "80d",
    }),
    worker(ACME, "realtime-chat", {
      age: "20d",
      messages: ["feat: hibernatable WebSockets", "initial deploy"],
      tags: ["beta"],
      updated: "1d",
    }),
  ]);
  workers.set(PERSONAL, [
    worker(PERSONAL, "tooee-docs", {
      age: "30d",
      messages: ["docs: c9s showcase", "initial deploy"],
      updated: "4h",
    }),
    worker(PERSONAL, "link-shortener", {
      age: "700d",
      messages: ["chore: bump deps"],
      updated: "120d",
    }),
  ]);

  // --- KV -------------------------------------------------------------------
  const kvNamespaces = new Map<string, Obj[]>();
  const kvKeys = new Map<string, Obj[]>();
  const kvValues = new Map<string, string>();
  const namespace = (
    title: string,
    keys: { name: string; value: Json; expiresIn?: number; metadata?: Obj }[],
  ): Obj => {
    const id = hexId(`kv:${title}`);
    kvKeys.set(
      id,
      keys.map((key) => ({
        ...(key.expiresIn === undefined ? {} : { expiration: Math.round(now / 1000) + key.expiresIn }),
        ...(key.metadata === undefined ? {} : { metadata: key.metadata }),
        name: key.name,
      })),
    );
    for (const key of keys) {
      kvValues.set(
        `${id}:${key.name}`,
        typeof key.value === "string" ? key.value : JSON.stringify(key.value, null, 2),
      );
    }
    return { beta: false, id, supports_url_encoding: true, title };
  };
  kvNamespaces.set(ACME, [
    namespace(
      "SESSIONS",
      Array.from({ length: 9 }, (_, index) => ({
        expiresIn: 3600 * (index + 1) * 3,
        metadata: { device: index % 2 === 0 ? "ios" : "web" },
        name: `session:${uuid(`session:${index}`)}`,
        value: { exp: Math.round(now / 1000) + 3600, roles: ["user"], sub: `user_${1000 + index}` },
      })),
    ),
    namespace("FEATURE_FLAGS", [
      { name: "checkout.v2", value: { enabled: true, rollout: 0.25 } },
      { name: "search.semantic", value: { enabled: true, rollout: 1 } },
      { name: "dashboard.dark-mode", value: { enabled: false } },
      { name: "api.rate-limit.burst", value: { limit: 120, window: 60 } },
      { name: "maintenance-banner", value: "" },
    ]),
    namespace("OG_CACHE", [
      { metadata: { etag: 'W/"a1"' }, name: "og:/blog/launching-c9s", value: "<cached png: 48 KB>" },
      { metadata: { etag: 'W/"b2"' }, name: "og:/blog/tooee-0-10", value: "<cached png: 51 KB>" },
      { expiresIn: 86_400, name: "og:/products/rover-x", value: "<cached png: 39 KB>" },
    ]),
    namespace("RATE_LIMITS", [
      { expiresIn: 60, name: "rl:key_live_7f3a", value: "87" },
      { expiresIn: 60, name: "rl:key_live_19cc", value: "12" },
    ]),
  ]);
  kvNamespaces.set(PERSONAL, [
    namespace("SHORT_LINKS", [
      { name: "gh", value: "https://github.com/gingerhendrix" },
      { name: "tooee", value: "https://tooee.dev" },
      { name: "c9s", value: "https://github.com/gingerhendrix/c9s" },
    ]),
  ]);

  // --- R2 -------------------------------------------------------------------
  const r2Buckets = new Map<string, Obj[]>();
  const r2Objects = new Map<string, Obj[]>();
  const bucket = (
    name: string,
    location: string,
    age: string,
    objects: [string, number, string, string][],
    storageClass = "Standard",
  ): Obj => {
    r2Objects.set(
      name,
      objects.map(([key, size, contentType, modified]) => ({
        custom_metadata: {},
        etag: `"${hexId(`etag:${name}:${key}`)}"`,
        http_metadata: { contentType },
        key,
        last_modified: ago(modified),
        size,
        storage_class: storageClass,
      })),
    );
    return { creation_date: ago(age), jurisdiction: "default", location, name, storage_class: storageClass };
  };
  r2Buckets.set(ACME, [
    bucket("assets", "WEUR", "700d", [
      ["fonts/inter-var.woff2", 325_120, "font/woff2", "200d"],
      ["images/hero.avif", 184_332, "image/avif", "12d"],
      ["images/hero.webp", 241_900, "image/webp", "12d"],
      ["images/logo.svg", 4_210, "image/svg+xml", "400d"],
      ["images/rover-x.png", 1_823_004, "image/png", "30d"],
      ["js/app.4f1c2a.js", 412_998, "application/javascript", "2d"],
      ["js/app.4f1c2a.js.map", 1_602_331, "application/json", "2d"],
      ["video/launch.mp4", 48_220_110, "video/mp4", "60d"],
    ]),
    bucket(
      "backups",
      "ENAM",
      "650d",
      [
        ["d1/orders-prod/2026-09-26.sqlite.gz", 88_220_101, "application/gzip", "3d"],
        ["d1/orders-prod/2026-09-27.sqlite.gz", 88_901_223, "application/gzip", "2d"],
        ["d1/orders-prod/2026-09-28.sqlite.gz", 89_455_870, "application/gzip", "1d"],
        ["d1/users-db/2026-09-28.sqlite.gz", 12_301_220, "application/gzip", "1d"],
      ],
      "InfrequentAccess",
    ),
    bucket("uploads", "WEUR", "300d", [
      ["u/1042/avatar.jpg", 88_201, "image/jpeg", "5h"],
      ["u/1077/avatar.png", 120_442, "image/png", "2d"],
      ["u/1101/invoice-0931.pdf", 301_882, "application/pdf", "40m"],
    ]),
    bucket("logpush", "ENAM", "500d", [
      [
        "http_requests/20260928/20260928T100000Z_20260928T110000Z.log.gz",
        5_220_441,
        "application/gzip",
        "1d",
      ],
      [
        "http_requests/20260928/20260928T110000Z_20260928T120000Z.log.gz",
        5_871_002,
        "application/gzip",
        "1d",
      ],
      ["workers_trace_events/20260928/part-00001.log.gz", 1_022_117, "application/gzip", "1d"],
    ]),
  ]);
  r2Buckets.set(PERSONAL, [
    bucket("blog-media", "WEUR", "900d", [
      ["2026/09/c9s-screenshot.png", 402_110, "image/png", "1h"],
      ["2026/03/tooee-demo.gif", 3_022_871, "image/gif", "200d"],
    ]),
  ]);

  // --- D1 -------------------------------------------------------------------
  const database = (name: string, tables: number, size: number, region: string, age: string): Obj => ({
    created_at: ago(age),
    file_size: size,
    name,
    num_tables: tables,
    read_replication: { mode: "disabled" },
    running_in_region: region,
    uuid: uuid(`d1:${name}`),
    version: "production",
  });
  const d1 = new Map<string, Obj[]>([
    [
      ACME,
      [
        database("orders-prod", 14, 412_332_032, "WEUR", "600d"),
        database("users-db", 6, 58_720_256, "WEUR", "700d"),
        database("analytics", 22, 1_204_551_680, "ENAM", "300d"),
        database("feature-store", 3, 2_293_760, "WEUR", "20d"),
      ],
    ],
    [PERSONAL, [database("tooee-telemetry", 2, 1_310_720, "WEUR", "100d")]],
  ]);

  // --- Queues ---------------------------------------------------------------
  const queues = new Map<string, Obj[]>();
  const queueConsumers = new Map<string, Obj[]>();
  const queue = (
    name: string,
    producers: string[],
    consumers: { script: string; type?: string }[],
    age: string,
  ): Obj => {
    const id = hexId(`queue:${name}`);
    queueConsumers.set(
      id,
      consumers.map((consumer, index) => ({
        consumer_id: hexId(`consumer:${name}:${index}`),
        created_on: ago(age),
        dead_letter_queue: index === 0 ? `${name}-dlq` : "",
        queue_name: name,
        script_name: consumer.script,
        settings: { batch_size: 10 * (index + 1), max_retries: 3, max_wait_time_ms: 5000 },
        type: consumer.type ?? "worker",
      })),
    );
    return {
      consumers: consumers.map((consumer) => ({ script: consumer.script, type: consumer.type ?? "worker" })),
      consumers_total_count: consumers.length,
      created_on: ago(age),
      modified_on: ago("6d"),
      producers: producers.map((script) => ({ script, type: "worker" })),
      producers_total_count: producers.length,
      queue_id: id,
      queue_name: name,
      settings: { delivery_delay: 0, delivery_paused: false, message_retention_period: 345_600 },
    };
  };
  queues.set(ACME, [
    queue("image-jobs", ["image-resizer", "api-gateway"], [{ script: "image-resizer" }], "280d"),
    queue(
      "webhook-deliveries",
      ["webhooks-ingest"],
      [{ script: "webhooks-ingest" }, { script: "cron-reporter" }],
      "60d",
    ),
    queue("email-outbox", ["auth-edge", "cron-reporter"], [{ script: "", type: "http_pull" }], "240d"),
    queue("analytics-events", ["api-gateway", "realtime-chat", "og-image-renderer"], [], "10d"),
  ]);
  queues.set(PERSONAL, []);

  // --- Tunnels --------------------------------------------------------------
  const tunnel = (name: string, status: string, connections: number, age: string): Obj => ({
    account_tag: ACME,
    config_src: status === "inactive" ? "local" : "cloudflare",
    connections: Array.from({ length: connections }, (_, index) => ({
      client_version: "2026.9.1",
      colo_name: ["lhr01", "lhr11", "ams01", "fra02"][index % 4] ?? "lhr01",
      id: uuid(`conn:${name}:${index}`),
      is_pending_reconnect: false,
      opened_at: ago("5d"),
      origin_ip: "203.0.113.9",
    })),
    conns_active_at: connections > 0 ? ago("5d") : null,
    conns_inactive_at: connections > 0 ? null : ago("9d"),
    created_at: ago(age),
    deleted_at: null,
    id: uuid(`tunnel:${name}`),
    metadata: {},
    name,
    remote_config: status !== "inactive",
    status,
    tun_type: "cfd_tunnel",
  });
  const tunnels = new Map<string, Obj[]>([
    [
      ACME,
      [
        tunnel("office-lab", "healthy", 4, "500d"),
        tunnel("k8s-prod-eu", "healthy", 4, "320d"),
        tunnel("home-k8s", "degraded", 1, "200d"),
        tunnel("staging-db", "down", 0, "90d"),
        tunnel("ci-runners", "inactive", 0, "700d"),
      ],
    ],
    [PERSONAL, [tunnel("homelab", "healthy", 2, "800d")]],
  ]);

  // --- Pages ----------------------------------------------------------------
  const pages = new Map<string, Obj[]>();
  const pagesDeployments = new Map<string, Obj[]>();
  const project = (
    account: string,
    name: string,
    branch: string,
    commits: [string, string, string][],
    age: string,
  ): Obj => {
    const deployments: Obj[] = commits.map(([message, stage, when], index) => ({
      aliases: index === 0 ? [`https://${name}.pages.dev`] : null,
      created_on: ago(when),
      deployment_trigger: {
        metadata: {
          branch: index % 3 === 1 ? "feature/new-nav" : branch,
          commit_hash: hexId(`commit:${name}:${index}`, 40),
          commit_message: message,
        },
        type: "github:push",
      },
      environment: index % 3 === 1 ? "preview" : "production",
      id: uuid(`pages:${name}:${index}`),
      latest_stage: { ended_on: ago(when), name: "deploy", started_on: ago(when), status: stage },
      project_name: name,
      short_id: hexId(`pages:${name}:${index}`, 8),
      url: `https://${hexId(`pages:${name}:${index}`, 8)}.${name}.pages.dev`,
    }));
    pagesDeployments.set(name, deployments);
    return {
      created_on: ago(age),
      domains: [`${name}.pages.dev`, ...(name === "acme-docs" ? ["docs.acme-robotics.com"] : [])],
      id: uuid(`project:${name}`),
      latest_deployment: deployments[0] ?? null,
      name,
      production_branch: branch,
      source: { config: { owner: "acme-robotics", repo_name: name }, type: "github" },
      subdomain: `${name}.pages.dev`,
      account_id: account,
    };
  };
  pages.set(ACME, [
    project(
      ACME,
      "acme-docs",
      "main",
      [
        ["docs: queue consumer guide", "success", "3h"],
        ["wip: new sidebar", "success", "1d"],
        ["fix: broken anchor links", "success", "4d"],
        ["docs: rate limit headers", "failure", "5d"],
      ],
      "600d",
    ),
    project(
      ACME,
      "marketing-site",
      "production",
      [
        ["feat: rover-x launch page", "active", "2m"],
        ["copy: pricing tweaks", "success", "2d"],
      ],
      "800d",
    ),
  ]);
  pages.set(PERSONAL, [
    project(PERSONAL, "tooee-site", "main", [["feat: c9s showcase page", "success", "5h"]], "200d"),
    project(PERSONAL, "gandrew-com", "main", [["post: building c9s", "success", "1d"]], "1300d"),
  ]);

  // --- Durable Objects ------------------------------------------------------
  const doNamespaces = new Map<string, Obj[]>();
  const doObjects = new Map<string, Obj[]>();
  const doNamespace = (
    name: string,
    className: string,
    script: string,
    sqlite: boolean,
    objects: number,
  ): Obj => {
    const id = hexId(`do:${name}`);
    doObjects.set(
      id,
      Array.from({ length: objects }, (_, index) => ({
        hasStoredData: index % 4 !== 3,
        id: hexId(`do-object:${name}:${index}`, 64),
      })),
    );
    return { class: className, id, name, script, use_sqlite: sqlite };
  };
  doNamespaces.set(ACME, [
    doNamespace("api-gateway_RateLimiter", "RateLimiter", "api-gateway", true, 12),
    doNamespace("auth-edge_SessionStore", "SessionStore", "auth-edge", true, 8),
    doNamespace("realtime-chat_ChatRoom", "ChatRoom", "realtime-chat", true, 5),
    doNamespace("cron-reporter_Scheduler", "Scheduler", "cron-reporter", false, 1),
  ]);
  doNamespaces.set(PERSONAL, []);

  // --- A few generic catalogue commands ------------------------------------
  const generic = new Map<string, Map<string, Json>>([
    [
      ACME,
      new Map<string, Json>([
        [
          "ai-gateway gateways list",
          [
            {
              cache_ttl: 300,
              collect_logs: true,
              created_at: ago("120d"),
              id: "support-bot",
              modified_at: ago("3d"),
              rate_limiting_interval: 60,
              rate_limiting_limit: 500,
            },
            {
              cache_ttl: 0,
              collect_logs: true,
              created_at: ago("40d"),
              id: "search-embeddings",
              modified_at: ago("40d"),
              rate_limiting_interval: 0,
              rate_limiting_limit: 0,
            },
          ],
        ],
        [
          "hyperdrive list",
          [
            {
              caching: { disabled: false },
              created_on: ago("200d"),
              id: hexId("hd:orders"),
              name: "orders-postgres",
              origin: {
                database: "orders",
                host: "db.internal.acme-robotics.com",
                port: 5432,
                scheme: "postgres",
                user: "hyperdrive",
              },
            },
            {
              caching: { disabled: true },
              created_on: ago("30d"),
              id: hexId("hd:crm"),
              name: "crm-mysql",
              origin: {
                database: "crm",
                host: "crm.internal.acme-robotics.com",
                port: 3306,
                scheme: "mysql",
                user: "readonly",
              },
            },
          ],
        ],
        [
          "workflows list",
          [
            {
              class_name: "OrderFulfilment",
              created_on: ago("90d"),
              id: uuid("wf:orders"),
              instances: { complete: 12_882, errored: 14, running: 31 },
              modified_on: ago("2d"),
              name: "order-fulfilment",
              script_name: "api-gateway",
            },
            {
              class_name: "NightlyExport",
              created_on: ago("300d"),
              id: uuid("wf:export"),
              instances: { complete: 290, errored: 1, running: 0 },
              modified_on: ago("20d"),
              name: "nightly-export",
              script_name: "cron-reporter",
            },
          ],
        ],
        [
          "secrets-store stores list",
          [
            {
              created: ago("100d"),
              id: hexId("store:default"),
              modified: ago("7d"),
              name: "default_secrets_store",
            },
          ],
        ],
      ]),
    ],
  ]);
  const zoneGeneric = new Map<string, Map<string, Json>>([
    [
      hexId("zone:acme-robotics.com"),
      new Map<string, Json>([
        [
          "snippets list",
          [
            { created_on: ago("50d"), modified_on: ago("2d"), snippet_name: "add_security_headers" },
            { created_on: ago("10d"), modified_on: ago("10d"), snippet_name: "geo_redirect_eu" },
          ],
        ],
      ]),
    ],
  ]);

  return {
    accounts,
    d1,
    dnsRecords,
    doNamespaces,
    doObjects,
    generic,
    kvKeys,
    kvNamespaces,
    kvValues,
    pages,
    pagesDeployments,
    queueConsumers,
    queues,
    r2Buckets,
    r2Objects,
    tunnels,
    workerDeployments,
    workerVersions,
    workers,
    zoneGeneric,
    zones,
  };
};
