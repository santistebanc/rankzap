/**
 * Build absolute URL for a route, suitable for sharing.
 */
function appOrigin(): string {
  if (typeof window === "undefined") return "";
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export function buildVoterUrl(roomId: string): string {
  return `${appOrigin()}${roomId}`;
}

export function buildAdminUrl(roomId: string): string {
  return `${appOrigin()}${roomId}/admin`;
}
