import type { ResolvedTheme } from "@tooee/themes";

import type { Tone } from "../resources/format.ts";

/** Cloudflare orange. The logo and proxied DNS records use it in every theme. */
export const BRAND = "#F6821F";
export const BRAND_DIM = "#FBAD41";

export const toneColor = function toneColor(theme: ResolvedTheme, tone: Tone | undefined): string {
  switch (tone) {
    case "muted":
      return theme.textMuted;
    case "primary":
      return theme.primary;
    case "accent":
      return theme.accent;
    case "info":
      return theme.info;
    case "success":
      return theme.success;
    case "warning":
      return theme.warning;
    case "error":
      return theme.error;
    case "brand":
      return BRAND;
    default:
      return theme.text;
  }
};

/** Braille spinner frames, as used by k9s and most modern CLIs. */
export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
