# Changelog

All notable changes to `@tooee/c9s` are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-29

The first public release.

### Added

- A k9s-style terminal UI for Cloudflare, built with Tooee on OpenTUI. All data comes from Cloudflare's `cf` CLI, which c9s runs as a child process.
- Eleven curated views: zones, DNS records, Workers (with versions and deployments), KV, R2, D1, Queues, Pages, Durable Objects, Tunnels and accounts.
- Generic views for about 220 more read-only `list` commands from the `cf` command catalogue.
- `:` resource picker, `/` live filter, `d` describe as YAML or JSON, sort, copy ID, open in the dashboard, auto-refresh, help and theme picker.
- `--demo` mode with fixtures for two fictional accounts. It needs no Cloudflare account and no `cf` install.
- `--local` mode for the KV, D1 and R2 state that `cf` keeps for local development.

[0.1.0]: https://github.com/gingerhendrix/c9s/releases/tag/v0.1.0
