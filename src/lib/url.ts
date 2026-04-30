/**
 * Build absolute URL for a route, suitable for sharing.
 * Uses HashRouter convention: /#/path
 */
export function buildVoterUrl(roomId: string): string {
  const origin =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname.replace(/index\.html$/, "")}`
      : "";
  return `${origin}#/vote/${roomId}`;
}

export function buildAdminUrl(roomId: string): string {
  const origin =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname.replace(/index\.html$/, "")}`
      : "";
  return `${origin}#/admin/${roomId}`;
}
