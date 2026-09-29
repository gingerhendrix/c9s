# c9s

A k9s-style terminal UI for Cloudflare, built with Tooee (OpenTUI + React) on the `cf` CLI.

## Commands

```bash
bun install
bun run check        # tsc (TypeScript 7), no emit
bun test             # bun:test; test/setup.ts isolates Tooee config and mocks the clipboard
bun run lint         # oxlint
bun run format       # oxfmt
bun run demo         # run against built-in fixtures
```

Releases: see `RELEASING.md`. Bump `version` in `package.json` and add a `CHANGELOG.md` entry in the same commit.

## Rules

- **Read-only.** Resource kinds must only send `list` and `get` calls. `test/resources/registry.test.ts` checks for write verbs.
- **Never import `cf`.** It needs Node 22 and does not load under Bun. All calls go through `CfClient` (`src/cf/types.ts`).
- **Decode at boundaries.** `cf` JSON, `commands.json` and router params are `unknown` until a decoder in `src/cf/` or `src/app/navigation.ts` checks them.
- **Curated kinds** live in `src/resources/curated.ts`. A new kind needs demo fixtures in `src/demo/` so the demo-client test can reach it.
- **Raw `useKeyboard` is not used.** Register keys with `useCommand` or `useActions`, so Tooee's modal surfaces can suspend them.
- **`:` belongs to the resource picker.** The Tooee command palette is rebound to `ctrl+p` in `providerOptions()`.
- Route params are `type` aliases, not interfaces, so they satisfy the router's `RouteParams` index signature.

## Testing TUI changes

`test/app/app.test.tsx` renders the whole app in demo mode on OpenTUI's headless renderer and drives it with key presses. For screenshots or recordings, use [`termctrl`](https://crates.io/crates/terminal-control) with `--host opentui`. `termctrl`'s `enter` key does not reach OpenTUI as Return; send `\r` on stdin instead.
