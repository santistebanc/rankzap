/**
 * Build absolute URL for a route, suitable for sharing.
 */
function appBase(): string {
  if (typeof window === "undefined") return "";
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export function buildVoterUrl(roomId: string): string {
  if (typeof window !== "undefined") {
    const current = new URL(window.location.href);
    // When called from admin view, prefer deriving directly from current path.
    // This guarantees the share link tracks any future route shape changes.
    if (/\/admin\/?$/.test(current.pathname)) {
      current.pathname = current.pathname.replace(/\/admin\/?$/, "");
      current.search = "";
      current.hash = "";
      return current.toString();
    }
  }
  return `${appBase()}${roomId}`;
}

export function buildAdminUrl(roomId: string): string {
  return `${appBase()}${roomId}/admin`;
}
