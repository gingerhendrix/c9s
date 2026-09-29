/** Open a URL in the default browser without blocking the TUI. */
export const openUrl = function openUrl(url: string): boolean {
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  if (Bun.which(opener) === null) {
    return false;
  }
  try {
    const child = Bun.spawn([opener, url], { stderr: "ignore", stdin: "ignore", stdout: "ignore" });
    child.unref();
    return true;
  } catch {
    return false;
  }
};
