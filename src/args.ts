/** Parsed command line for `c9s`. */
export interface CliArgs {
  readonly demo: boolean;
  readonly local: boolean;
  readonly persistTo?: string;
  readonly account?: string;
  readonly zone?: string;
  readonly theme?: string;
  /** Seconds; 0 turns auto-refresh off. */
  readonly refresh: number;
  readonly cfBin: string;
  readonly resource?: string;
  readonly help: boolean;
  readonly version: boolean;
  readonly listResources: boolean;
}

export const USAGE = `c9s: a k9s-style terminal UI for Cloudflare, built with Tooee on the cf CLI

Usage
  c9s [resource] [options]

Resources
  zones (default), dns, workers, kv, r2, d1, queues, pages, do, tunnels, accounts,
  or any cf list command, e.g. "ai-gateway gateways". Run c9s --resources for all.

Options
  --demo              Browse built-in demo data; no Cloudflare account needed
  --local             Send calls to cf's local Miniflare state (KV, D1, R2)
  --persist-to <dir>  Local state directory for --local
  --account <id>      Account ID (default: CLOUDFLARE_ACCOUNT_ID, or ask)
  --zone <name|id>    Start with this zone selected
  --theme <name>      Tooee theme, e.g. tokyonight, catppuccin, dracula
  --refresh <sec>     Auto-refresh interval in seconds (default 30, 0 = off)
  --cf <path>         cf executable (default: cf on PATH)
  --resources         List every resource c9s can open, then exit
  -h, --help          Show this help
  -v, --version       Show the version

Keys
  :  resources   /  filter   enter  open   d  describe   ?  help   q  quit
`;

export class ArgsError extends Error {}

export const parseArgs = function parseArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = {},
): CliArgs {
  let demo = false;
  let local = false;
  let persistTo: string | undefined;
  let account = env.CLOUDFLARE_ACCOUNT_ID === "" ? undefined : env.CLOUDFLARE_ACCOUNT_ID;
  let zone: string | undefined;
  let theme: string | undefined;
  let refresh = 30;
  let cfBin = "cf";
  let help = false;
  let version = false;
  let listResources = false;
  const words: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    const [flag, inline] =
      arg.startsWith("--") && arg.includes("=")
        ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]
        : [arg, undefined];
    const value = (): string => {
      if (inline !== undefined) {
        return inline;
      }
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-")) {
        throw new ArgsError(`${flag} needs a value`);
      }
      index += 1;
      return next;
    };
    switch (flag) {
      case "--demo":
        demo = true;
        break;
      case "--local":
        local = true;
        break;
      case "--persist-to":
        persistTo = value();
        break;
      case "--account":
        account = value();
        break;
      case "--zone":
      case "-z":
        zone = value();
        break;
      case "--theme":
        theme = value();
        break;
      case "--refresh": {
        const seconds = Number(value());
        if (!Number.isFinite(seconds) || seconds < 0) {
          throw new ArgsError("--refresh needs a number of seconds (0 turns it off)");
        }
        refresh = seconds;
        break;
      }
      case "--cf":
        cfBin = value();
        break;
      case "--resources":
        listResources = true;
        break;
      case "-h":
      case "--help":
        help = true;
        break;
      case "-v":
      case "--version":
        version = true;
        break;
      default:
        if (flag.startsWith("-")) {
          throw new ArgsError(`Unknown option: ${flag}`);
        }
        words.push(arg);
    }
  }

  if (demo && local) {
    throw new ArgsError("Choose one of --demo and --local");
  }
  if (persistTo !== undefined && !local) {
    throw new ArgsError("--persist-to only works with --local");
  }

  return {
    account,
    cfBin,
    demo,
    help,
    listResources,
    local,
    persistTo,
    refresh,
    resource: words.length === 0 ? undefined : words.join(" "),
    theme,
    version,
    zone,
  };
};
