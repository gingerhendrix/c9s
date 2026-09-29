# c9s

A k9s-style terminal UI for Cloudflare. It is built with [Tooee](https://github.com/gingerhendrix/tooee) and gets all its data from Cloudflare's new [`cf` CLI](https://github.com/cloudflare/cf).

![c9s showing the DNS records of a zone](https://raw.githubusercontent.com/gingerhendrix/c9s/main/docs/screenshots/dns.png)

c9s lists your zones, DNS records, Workers, KV, R2, D1, Queues, Pages, Durable Objects and Tunnels. You move through them the k9s way. Press `:` to jump to a resource, `/` to filter, Enter to drill down, `d` to describe and Esc to go back.

The `cf` package ships a catalogue of every command it generates from Cloudflare's OpenAPI spec. c9s reads that catalogue. So besides the eleven hand-tuned views, you can open about 220 more `list` commands, such as AI Gateway, Hyperdrive or Workflows. Their columns come from the data.

c9s is read-only. It never sends a create, update or delete call.

## Quick start

You need [Bun](https://bun.sh) 1.3 or later. Try c9s with its built-in demo data. You do not need a Cloudflare account for this:

```bash
bunx @tooee/c9s --demo
```

To see your own account, install `cf` (it needs Node 22 or later) and log in. Then run c9s with no flags:

```bash
npm install -g cf
cf auth login                         # or: export CLOUDFLARE_API_TOKEN=...
bunx @tooee/c9s
```

To keep the `c9s` command on your PATH, install it globally:

```bash
bun add -g @tooee/c9s
c9s --demo
```

To browse the KV, D1 and R2 state that `cf` keeps for local development:

```bash
c9s --local
```

To run c9s from a clone of this repository:

```bash
git clone https://github.com/gingerhendrix/c9s.git && cd c9s
bun install
bun run demo
```

## Keys

| Key | Action |
| --- | --- |
| `:` | Jump to a resource. Type to fuzzy-match `zones`, `dns`, `workers`, `kv` or any `cf` list command. |
| `/` | Filter rows. Space-separated terms must all match. `!term` excludes. |
| `enter` | Drill down (zone to DNS records, Worker to versions, KV namespace to keys). On a leaf row, describe it. |
| `d` | Describe the row as YAML or JSON (`f` switches, `w` wraps). |
| `shift-d` | Worker deployments, with their version splits. |
| `esc` | Clear the filter, or go back. |
| `s` / `shift-s` | Sort by the next column, or reverse the sort. |
| `c` | Copy the row ID. |
| `o` | Open the row in the Cloudflare dashboard. |
| `ctrl-r` | Refresh. Views also refresh every 30 seconds (`--refresh`). |
| `?` | Help. |
| `t` | Theme picker (34 Tooee themes). |
| `ctrl-p` | Tooee command palette. |
| `q` | Quit. |

Vim-style movement works everywhere: `j`, `k`, `g g`, `shift-g`, `ctrl-d`, `ctrl-u`. You can also click a row, then click it again to open it.

## Resources

| `:` name | View | Enter opens |
| --- | --- | --- |
| `zones` | Zones in the account | DNS records |
| `dns` | DNS records of the current zone | Describe |
| `workers` | Workers | Versions (`shift-d`: deployments) |
| `kv` | KV namespaces | Keys, then the value |
| `r2` | R2 buckets | Objects |
| `d1` | D1 databases | Describe |
| `queues` | Queues | Consumers |
| `pages` | Pages projects | Deployments |
| `do` | Durable Object namespaces | Objects |
| `tunnels` | Cloudflare Tunnels | Describe |
| `accounts` | Accounts the token can see | Switch account |

Run `c9s --resources` to list every resource, including the generic ones.

![The resource picker, filtered to AI Gateway](https://raw.githubusercontent.com/gingerhendrix/c9s/main/docs/screenshots/picker.png)

| Describe | Worker deployments |
| --- | --- |
| ![A DNS record described as YAML](https://raw.githubusercontent.com/gingerhendrix/c9s/main/docs/screenshots/describe.png) | ![Worker deployments with a 10% canary split](https://raw.githubusercontent.com/gingerhendrix/c9s/main/docs/screenshots/deployments.png) |

## Options

```text
c9s [resource] [options]

--demo              Browse built-in demo data; no Cloudflare account needed
--local             Send calls to cf's local Miniflare state (KV, D1, R2)
--persist-to <dir>  Local state directory for --local
--account <id>      Account ID (default: CLOUDFLARE_ACCOUNT_ID, or ask)
--zone <name|id>    Start with this zone selected
--theme <name>      Tooee theme, e.g. tokyonight, catppuccin, dracula
--refresh <sec>     Auto-refresh interval in seconds (default 30, 0 = off)
--cf <path>         cf executable (default: cf on PATH)
--resources         List every resource c9s can open, then exit
```

## How it works

```text
 cf catalogue (dist/_meta/commands.json)
        │  browsable list commands
        ▼
 Registry ── curated kinds (zones, dns, workers, ...) + generic kinds
        │  ResourceKind.list(params, session) -> argv
        ▼
 QueryCache ── dedupes calls, keeps stale rows while it refreshes
        │  CfClient.run({ argv, context })
        ▼
 cf child process ── CLOUDFLARE_ACCOUNT_ID, --zone, --local; JSON on stdout
        │
        ▼
 Screens (Tooee router) ── boot splash, resource table, describe view
```

- **`cf` runs as a child process.** `cf` needs Node 22 and does not load under Bun, so c9s never imports it. `src/cf/process-client.ts` owns the process: account and zone context, JSON decoding, error boxes on stderr, time-outs and cancellation.
- **`cf --local` does not exit** in `1.0.0-beta.5` after it prints a result, because Miniflare stays alive. In local mode the client treats 400 ms of stdout silence as the end of the output and stops the process.
- **Generic views.** A catalogue command is browsable when it is a visible, read-only `GET list` with no required input except the account or zone. `src/resources/infer.ts` picks up to seven columns: the name first, then status-like fields, other short values, the ID, and AGE last.
- **Demo mode** swaps the process client for `src/demo/demo-client.ts`. It answers the same argv from fixtures for two fictional accounts, with a short random delay so loading states show.

### Tooee pieces

| c9s feature | Tooee package |
| --- | --- |
| Screen stack, breadcrumbs, cursor restore on back | `@tooee/router` (`useScreenState`) |
| Resource table and describe view | `@tooee/shell` `useDocumentController` and `Document` over the `@tooee/renderers` row document |
| Hotkeys, modes, `:` rebinding | `@tooee/commands`, `@tooee/config` keymap |
| Frame, status bar, filter input | `@tooee/layout` `AppLayout`, `@tooee/search` `SearchBar` |
| `:` picker, zone chooser | `@tooee/choose` `useChooseDialog` |
| Help overlay | `@tooee/overlays` |
| Toasts | `@tooee/toasts` |
| Themes | `@tooee/themes` |
| Copy ID | `@tooee/clipboard` |

## Development

```bash
bun install
bun run check          # TypeScript
bun test               # unit and interaction tests
bun run lint           # oxlint
bun run format         # oxfmt
```

```text
src/
  cli.tsx            entry point and argument handling
  args.ts            command-line parser
  cf/                cf process client, stderr parser, catalogue reader
  resources/         resource model, curated kinds, inference, table layout
  data/              query cache and session (account, zone)
  demo/              demo client and fixtures
  app/               services, router, navigation codecs
  routes/            boot, resource and describe screens
  ui/                header, table, pickers, help, highlighting
test/                bun:test suites; test/app drives the whole UI headlessly
```

## Limits

- c9s shows the first page of each list. `cf` does not follow pagination for you.
- `cf workers tail` does not exist yet ([cf#68](https://github.com/cloudflare/cf/issues/68)), so there is no log view.
- `--local` shows only resources that already exist in `cf`'s local state.
- `cf` is a beta. Response shapes for generic commands can change between releases.

## Releasing

Releases go to npm as [`@tooee/c9s`](https://www.npmjs.com/package/@tooee/c9s). The steps are in [RELEASING.md](RELEASING.md), and the changes are in [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT
