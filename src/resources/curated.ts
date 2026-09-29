import { col } from "./columns.ts";
import type { Row, Tone } from "./format.ts";
import { first, formatUntil, pick, text } from "./format.ts";
import { extractRows } from "./infer.ts";
import type { ResourceKind, ResourceParams, SessionContext } from "./types.ts";

const DASH = "https://dash.cloudflare.com";

const s = (row: Row, ...paths: string[]): string => text(first(row, ...paths));

const dash = (session: SessionContext, ...parts: string[]): string | undefined =>
  session.accountId === undefined
    ? undefined
    : [DASH, session.accountId, ...parts.map((part) => encodeURIComponent(part))].join("/");

const need = (params: ResourceParams, name: string): string => {
  const value = params[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing parameter: ${name}`);
  }
  return value;
};

const DNS_TYPE_TONES: Record<string, Tone> = {
  A: "info",
  AAAA: "info",
  CAA: "muted",
  CNAME: "accent",
  MX: "warning",
  NS: "primary",
  SRV: "primary",
  TXT: "muted",
};

const accounts: ResourceKind = {
  aliases: ["account", "acc", "ctx", "context"],
  columns: [
    col.text("name", "NAME"),
    col.text("type", "TYPE", { tone: "accent" }),
    col.id("id"),
    col.age("created_on"),
  ],
  command: "cf accounts list",
  current: (row, session) => row.id === session.accountId,
  dashboard: (row) => `${DASH}/${s(row, "id")}`,
  describe: (row) => ({ argv: ["accounts", "get"], context: { accountId: s(row, "id") } }),
  description: "Accounts this token can see. Enter switches the account context.",
  enter: "use-account",
  icon: "◆",
  id: "accounts",
  key: (row) => s(row, "id"),
  label: (row) => s(row, "name", "id"),
  list: () => ({ argv: ["accounts", "list", "--per-page", "50"] }),
  scope: "global",
  title: "Accounts",
};

const zones: ResourceKind = {
  aliases: ["zone", "z", "domains", "sites"],
  children: [
    {
      kind: "dns-records",
      params: (row) => ({ zoneId: s(row, "id"), zoneName: s(row, "name") }),
      title: "DNS records",
    },
  ],
  columns: [
    col.text("name", "NAME"),
    col.status("status"),
    col.text("plan.name", "PLAN", { tone: "accent" }),
    col.text("type", "TYPE", { tone: "muted" }),
    col.bool("paused", "PAUSED", ["paused", "no"], "warning"),
    col.text((row) => (pick(row, "name_servers") as unknown[] | undefined)?.slice(0, 2), "NAME SERVERS", {
      tone: "muted",
    }),
    col.id("id"),
    col.age("created_on"),
  ],
  command: "cf zones list",
  current: (row, session) => row.id === session.zoneId,
  dashboard: (row, session) => dash(session, s(row, "name")),
  describe: (row) => ({ argv: ["zones", "get"], context: { zone: s(row, "id") } }),
  description: "Domains in the current account. Enter opens DNS records.",
  enter: "drill",
  icon: "◎",
  id: "zones",
  key: (row) => s(row, "id"),
  label: (row) => s(row, "name", "id"),
  list: (_params, session) => ({
    argv: [
      "zones",
      "list",
      "--per-page",
      "50",
      ...(session.accountId === undefined ? [] : ["--account-id", session.accountId]),
    ],
  }),
  scope: "account",
  title: "Zones",
};

const dnsRecords: ResourceKind = {
  aliases: ["dns", "records", "dnsrecords", "rr"],
  columns: [
    col.text("type", "TYPE", { tone: (row) => DNS_TYPE_TONES[s(row, "type")] ?? "text" }),
    col.text("name", "NAME"),
    col.text("content", "CONTENT", { grow: true, tone: "muted" }),
    {
      cell: (row) =>
        row.proxied === true ? { text: "☁ proxied", tone: "brand" } : { text: "dns only", tone: "muted" },
      header: "PROXY",
      id: "proxy",
    },
    col.text((row) => (row.ttl === 1 ? "auto" : row.ttl), "TTL", { tone: "muted" }),
    col.text("comment", "COMMENT", { tone: "muted" }),
    col.age("modified_on|created_on"),
  ],
  command: "cf dns records list",
  dashboard: (_row, session, params) =>
    dash(session, params.zoneName ?? session.zoneName ?? "", "dns", "records"),
  describe: (row, params) => ({
    argv: ["dns", "records", "get", s(row, "id")],
    context: { zone: params.zoneId },
  }),
  description: "DNS records for the current zone.",
  enter: "describe",
  icon: "≡",
  id: "dns-records",
  key: (row) => s(row, "id"),
  label: (row) => `${s(row, "type")} ${s(row, "name")}`,
  list: (params, session) => ({
    argv: ["dns", "records", "list"],
    context: { zone: params.zoneId ?? session.zoneId },
  }),
  scope: "zone",
  subtitle: (params, session) => params.zoneName ?? session.zoneName,
  title: "DNS Records",
};

const workers: ResourceKind = {
  aliases: ["worker", "w", "wk", "scripts"],
  children: [
    {
      kind: "worker-versions",
      params: (row) => ({ workerId: s(row, "id"), workerName: s(row, "name") }),
      title: "Versions",
    },
    {
      hotkey: "shift+d",
      kind: "worker-deployments",
      params: (row) => ({ workerId: s(row, "id"), workerName: s(row, "name") }),
      title: "Deployments",
    },
  ],
  columns: [
    col.text("name", "NAME"),
    col.bool("subdomain.enabled", "WORKERS.DEV", ["on", "off"]),
    col.bool("observability.enabled", "OBSERVABILITY", ["on", "off"]),
    col.bool("logpush", "LOGPUSH", ["on", "off"]),
    col.text("tags", "TAGS", { tone: "accent" }),
    col.age("updated_on", "UPDATED"),
    col.age("created_on"),
  ],
  command: "cf workers list",
  dashboard: (row, session) => dash(session, "workers", "services", "view", s(row, "name"), "production"),
  describe: (row) => ({ argv: ["workers", "get", s(row, "id")] }),
  description: "Workers in the current account. Enter opens versions, D opens deployments.",
  enter: "drill",
  icon: "λ",
  id: "workers",
  key: (row) => s(row, "id", "name"),
  label: (row) => s(row, "name", "id"),
  list: () => ({ argv: ["workers", "list"] }),
  scope: "account",
  title: "Workers",
};

const workerVersions: ResourceKind = {
  aliases: ["versions"],
  columns: [
    col.number("number", "#"),
    col.id("id", "VERSION", 8),
    col.text("annotations.workers/message", "MESSAGE", { grow: true }),
    col.text("annotations.workers/tag", "TAG", { tone: "accent" }),
    col.text("source|metadata.source", "SOURCE", { tone: "muted" }),
    col.text("author_email|metadata.author_email", "AUTHOR", { tone: "muted" }),
    col.age("created_on|metadata.created_on"),
  ],
  command: "cf workers versions list",
  describe: (row, params) => ({
    argv: ["workers", "versions", "get", s(row, "id"), "--worker-id", need(params, "workerId")],
  }),
  description: "Versions of a Worker, newest first.",
  enter: "describe",
  icon: "λ",
  id: "worker-versions",
  key: (row) => s(row, "id"),
  label: (row) => `v${s(row, "number")}`,
  list: (params) => ({ argv: ["workers", "versions", "list", "--worker-id", need(params, "workerId")] }),
  requires: ["workerId"],
  scope: "account",
  subtitle: (params) => params.workerName,
  title: "Versions",
};

const workerDeployments: ResourceKind = {
  aliases: ["deployments"],
  columns: [
    col.id("id", "DEPLOYMENT", 8),
    col.text("strategy", "STRATEGY", { tone: "accent" }),
    col.text(
      (row) =>
        (Array.isArray(row.versions) ? row.versions : [])
          .map((version: unknown) =>
            typeof version === "object" && version !== null
              ? `${text(pick(version as Row, "version_id")).slice(0, 8)} ${text(pick(version as Row, "percentage"))}%`
              : "",
          )
          .join(", "),
      "VERSIONS",
      { tone: "info" },
    ),
    col.text("annotations.workers/message", "MESSAGE", { grow: true }),
    col.text("annotations.workers/triggered_by", "TRIGGER", { tone: "muted" }),
    col.text("author_email", "AUTHOR", { tone: "muted" }),
    col.age("created_on"),
  ],
  command: "cf workers deployments list",
  description: "Deployments of a Worker and their version splits.",
  enter: "describe",
  icon: "λ",
  id: "worker-deployments",
  key: (row) => s(row, "id"),
  label: (row) => s(row, "id").slice(0, 8),
  list: (params) => ({ argv: ["workers", "deployments", "list", "--worker", need(params, "workerName")] }),
  requires: ["workerName"],
  scope: "account",
  subtitle: (params) => params.workerName,
  title: "Deployments",
};

const kvNamespaces: ResourceKind = {
  aliases: ["kv", "namespaces", "kvn"],
  children: [
    {
      kind: "kv-keys",
      params: (row) => ({ namespaceId: s(row, "id"), namespaceTitle: s(row, "title") }),
      title: "Keys",
    },
  ],
  columns: [col.text("title", "TITLE"), col.id("id"), col.bool("supports_url_encoding", "URL ENCODING")],
  command: "cf kv namespaces list",
  dashboard: (row, session) => dash(session, "workers", "kv", "namespaces", s(row, "id")),
  describe: (row) => ({ argv: ["kv", "namespaces", "get", s(row, "id")] }),
  description: "Workers KV namespaces. Enter lists keys.",
  enter: "drill",
  icon: "⚿",
  id: "kv-namespaces",
  key: (row) => s(row, "id"),
  label: (row) => s(row, "title", "id"),
  list: () => ({ argv: ["kv", "namespaces", "list"] }),
  scope: "account",
  title: "KV Namespaces",
};

const kvKeys: ResourceKind = {
  aliases: ["keys"],
  columns: [
    col.text("name", "KEY"),
    col.text((row) => formatUntil(row.expiration), "EXPIRES", { tone: "warning" }),
    col.text((row) => (row.metadata === undefined ? "" : JSON.stringify(row.metadata)), "METADATA", {
      grow: true,
      tone: "muted",
    }),
  ],
  command: "cf kv keys list",
  describe: (row, params) => ({
    argv: ["kv", "keys", "get", s(row, "name"), "--namespace-id", need(params, "namespaceId")],
  }),
  description: "Keys in a KV namespace. Enter shows the value.",
  enter: "describe",
  icon: "⚿",
  id: "kv-keys",
  key: (row) => s(row, "name"),
  label: (row) => s(row, "name"),
  list: (params) => ({ argv: ["kv", "keys", "list", "--namespace-id", need(params, "namespaceId")] }),
  requires: ["namespaceId"],
  scope: "account",
  subtitle: (params) => params.namespaceTitle,
  title: "KV Keys",
};

const r2Buckets: ResourceKind = {
  aliases: ["r2", "buckets", "bucket"],
  children: [
    {
      kind: "r2-objects",
      params: (row) => ({ bucket: s(row, "name") }),
      title: "Objects",
    },
  ],
  columns: [
    col.text("name", "NAME"),
    col.text("location", "LOCATION", { tone: "accent" }),
    col.text("storage_class", "STORAGE CLASS", { tone: "muted" }),
    col.text("jurisdiction", "JURISDICTION", { tone: "muted" }),
    col.age("creation_date"),
  ],
  command: "cf r2 buckets list",
  dashboard: (row, session) => dash(session, "r2", "default", "buckets", s(row, "name")),
  describe: (row) => ({ argv: ["r2", "buckets", "get", s(row, "name")] }),
  description: "R2 buckets. Enter lists objects.",
  enter: "drill",
  icon: "▣",
  id: "r2-buckets",
  key: (row) => s(row, "name"),
  label: (row) => s(row, "name"),
  list: () => ({ argv: ["r2", "buckets", "list"] }),
  rows: (data) => extractRows(data),
  scope: "account",
  title: "R2 Buckets",
};

const r2Objects: ResourceKind = {
  aliases: ["objects"],
  columns: [
    col.text("key", "KEY", { grow: true }),
    col.bytes("size"),
    col.text("http_metadata.contentType", "CONTENT TYPE", { tone: "accent" }),
    col.text("storage_class", "CLASS", { tone: "muted" }),
    col.id((row) => text(row.etag).replaceAll('"', ""), "ETAG", 10),
    col.age("last_modified|uploaded", "MODIFIED"),
  ],
  command: "cf r2 objects list",
  description: "Objects in an R2 bucket.",
  enter: "describe",
  icon: "▣",
  id: "r2-objects",
  key: (row) => s(row, "key"),
  label: (row) => s(row, "key"),
  list: (params) => ({ argv: ["r2", "objects", "list", "--bucket-name", need(params, "bucket")] }),
  requires: ["bucket"],
  scope: "account",
  subtitle: (params) => params.bucket,
  title: "R2 Objects",
};

const d1: ResourceKind = {
  aliases: ["d1", "databases", "db", "sql"],
  columns: [
    col.text("name", "NAME"),
    col.number("num_tables", "TABLES"),
    col.bytes("file_size"),
    col.text("version", "VERSION", { tone: "muted" }),
    col.text("running_in_region|primary_location_hint|jurisdiction", "REGION", { tone: "accent" }),
    col.id("uuid"),
    col.age("created_at"),
  ],
  command: "cf d1 list",
  dashboard: (row, session) => dash(session, "workers", "d1", "databases", s(row, "uuid")),
  describe: (row) => ({ argv: ["d1", "get", s(row, "uuid")] }),
  description: "D1 databases in the current account.",
  enter: "describe",
  icon: "⛁",
  id: "d1-databases",
  key: (row) => s(row, "uuid", "name"),
  label: (row) => s(row, "name"),
  list: () => ({ argv: ["d1", "list"] }),
  scope: "account",
  title: "D1 Databases",
};

const queues: ResourceKind = {
  aliases: ["queues", "queue", "q"],
  children: [
    {
      kind: "queue-consumers",
      params: (row) => ({ queueId: s(row, "queue_id", "id"), queueName: s(row, "queue_name", "name") }),
      title: "Consumers",
    },
  ],
  columns: [
    col.text("queue_name", "NAME"),
    col.number("producers_total_count", "PRODUCERS"),
    col.number("consumers_total_count", "CONSUMERS"),
    col.id("queue_id"),
    col.age("modified_on", "UPDATED"),
    col.age("created_on"),
  ],
  command: "cf queues list",
  dashboard: (row, session) => dash(session, "workers", "queues", "view", s(row, "queue_id")),
  describe: (row) => ({ argv: ["queues", "get", s(row, "queue_id", "id")] }),
  description: "Queues. Enter lists consumers.",
  enter: "drill",
  icon: "⇶",
  id: "queues",
  key: (row) => s(row, "queue_id", "id"),
  label: (row) => s(row, "queue_name", "name"),
  list: () => ({ argv: ["queues", "list"] }),
  scope: "account",
  title: "Queues",
};

const queueConsumers: ResourceKind = {
  aliases: ["consumers"],
  columns: [
    col.text("script_name|script|service", "SCRIPT"),
    col.text("type", "TYPE", { tone: "accent" }),
    col.number("settings.batch_size", "BATCH"),
    col.number("settings.max_retries", "RETRIES"),
    col.text("settings.max_wait_time_ms", "MAX WAIT MS", { tone: "muted" }),
    col.text("dead_letter_queue", "DLQ", { tone: "warning" }),
    col.age("created_on"),
  ],
  command: "cf queues consumers list",
  description: "Consumers attached to a queue.",
  enter: "describe",
  icon: "⇶",
  id: "queue-consumers",
  key: (row) => s(row, "consumer_id", "script_name", "script", "service"),
  label: (row) => s(row, "script_name", "script", "service", "consumer_id"),
  list: (params) => ({ argv: ["queues", "consumers", "list", "--queue-id", need(params, "queueId")] }),
  requires: ["queueId"],
  scope: "account",
  subtitle: (params) => params.queueName,
  title: "Consumers",
};

const tunnels: ResourceKind = {
  aliases: ["tunnels", "tunnel", "tun", "cfd"],
  columns: [
    col.text("name", "NAME"),
    col.status("status"),
    col.text("tun_type", "TYPE", { tone: "muted" }),
    col.number((row) => (Array.isArray(row.connections) ? row.connections.length : 0), "CONNS"),
    col.text("config_src", "CONFIG", { tone: "muted" }),
    col.id("id"),
    col.age("created_at"),
  ],
  command: "cf tunnels list",
  dashboard: (_row, session) =>
    session.accountId === undefined
      ? undefined
      : `https://one.dash.cloudflare.com/${session.accountId}/networks/tunnels`,
  describe: (row) => ({ argv: ["tunnels", "get", s(row, "id")] }),
  description: "Cloudflare Tunnels and their connection health.",
  enter: "describe",
  icon: "⌁",
  id: "tunnels",
  key: (row) => s(row, "id"),
  label: (row) => s(row, "name", "id"),
  list: () => ({ argv: ["tunnels", "list", "--is-deleted", "false"] }),
  scope: "account",
  title: "Tunnels",
};

const pagesProjects: ResourceKind = {
  aliases: ["pages", "projects"],
  children: [
    {
      kind: "pages-deployments",
      params: (row) => ({ projectName: s(row, "name") }),
      title: "Deployments",
    },
  ],
  columns: [
    col.text("name", "NAME"),
    col.text("subdomain", "SUBDOMAIN", { tone: "info" }),
    col.text("production_branch", "BRANCH", { tone: "accent" }),
    col.status("latest_deployment.latest_stage.status", "LATEST"),
    col.text((row) => (Array.isArray(row.domains) ? row.domains.length : ""), "DOMAINS", { tone: "muted" }),
    col.age("created_on"),
  ],
  command: "cf pages projects list",
  dashboard: (row, session) => dash(session, "pages", "view", s(row, "name")),
  describe: (row) => ({ argv: ["pages", "projects", "get", s(row, "name")] }),
  description: "Pages projects. Enter lists deployments.",
  enter: "drill",
  icon: "▤",
  id: "pages-projects",
  key: (row) => s(row, "id", "name"),
  label: (row) => s(row, "name"),
  list: () => ({ argv: ["pages", "projects", "list"] }),
  scope: "account",
  title: "Pages Projects",
};

const pagesDeployments: ResourceKind = {
  aliases: ["pages-deployments"],
  columns: [
    col.id("short_id|id", "ID", 8),
    col.text("environment", "ENV", {
      tone: (row) => (row.environment === "production" ? "success" : "info"),
    }),
    col.text("deployment_trigger.metadata.branch", "BRANCH", { tone: "accent" }),
    col.text("deployment_trigger.metadata.commit_message", "COMMIT", { grow: true }),
    col.status("latest_stage.status", "STATUS"),
    col.age("created_on"),
  ],
  command: "cf pages projects deployments list",
  description: "Deployments of a Pages project.",
  enter: "describe",
  icon: "▤",
  id: "pages-deployments",
  key: (row) => s(row, "id"),
  label: (row) => s(row, "short_id", "id"),
  list: (params) => ({
    argv: ["pages", "projects", "deployments", "list", "--project-name", need(params, "projectName")],
  }),
  requires: ["projectName"],
  scope: "account",
  subtitle: (params) => params.projectName,
  title: "Deployments",
};

const durableObjects: ResourceKind = {
  aliases: ["do", "durable-objects", "dos"],
  children: [
    {
      kind: "do-objects",
      params: (row) => ({ doNamespaceId: s(row, "id"), doNamespaceName: s(row, "name", "class") }),
      title: "Objects",
    },
  ],
  columns: [
    col.text("name", "NAME"),
    col.text("class", "CLASS", { tone: "accent" }),
    col.text("script", "SCRIPT", { tone: "info" }),
    col.bool("use_sqlite", "STORAGE", ["sqlite", "kv"], "info"),
    col.id("id"),
  ],
  command: "cf durable-objects namespaces list",
  description: "Durable Object namespaces. Enter lists objects.",
  enter: "drill",
  icon: "◇",
  id: "do-namespaces",
  key: (row) => s(row, "id"),
  label: (row) => s(row, "name", "class"),
  list: () => ({ argv: ["durable-objects", "namespaces", "list"] }),
  scope: "account",
  title: "Durable Objects",
};

const doObjects: ResourceKind = {
  aliases: ["objects"],
  columns: [col.text("id", "OBJECT ID", { grow: true }), col.bool("hasStoredData", "STORED DATA")],
  command: "cf durable-objects namespaces objects list",
  description: "Objects in a Durable Object namespace.",
  enter: "describe",
  icon: "◇",
  id: "do-objects",
  key: (row) => s(row, "id"),
  label: (row) => s(row, "id").slice(0, 12),
  list: (params) => ({
    argv: ["durable-objects", "namespaces", "objects", "list", "--id", need(params, "doNamespaceId")],
  }),
  requires: ["doNamespaceId"],
  scope: "account",
  subtitle: (params) => params.doNamespaceName,
  title: "DO Objects",
};

/** Hand-tuned resource kinds, in picker order. */
export const CURATED_KINDS: readonly ResourceKind[] = [
  zones,
  dnsRecords,
  workers,
  workerVersions,
  workerDeployments,
  kvNamespaces,
  kvKeys,
  r2Buckets,
  r2Objects,
  d1,
  queues,
  queueConsumers,
  pagesProjects,
  pagesDeployments,
  durableObjects,
  doObjects,
  tunnels,
  accounts,
];
