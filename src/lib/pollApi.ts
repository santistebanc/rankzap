import { HOST_KEY_HEADER, type CreatePollResponse, type PollSummary } from "./protocol";
import { getHostKey, removeHostKey, setHostKey } from "./storage";
import { HOME_TIMEOUT_MS, type PollColour } from "./types";

/** HTTP calls to the poll server for things that don't need a live connection. */

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api/polls${path}`, { ...init, signal: AbortSignal.timeout(HOME_TIMEOUT_MS) });
}

/** Creates a poll and remembers its host key in this browser. */
export async function createPoll(colour: PollColour): Promise<string> {
  const res = await request("", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ colour }),
  });
  if (!res.ok) throw new Error("Couldn't create a poll. Try again.");
  const { id, hostKey } = (await res.json()) as CreatePollResponse;
  setHostKey(id, hostKey);
  return id;
}

/** The poll's summary, or null if it doesn't exist. Throws if the server can't be reached. */
export async function fetchPollSummary(id: string): Promise<PollSummary | null> {
  const res = await request(`/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Couldn't reach the server.");
  return (await res.json()) as PollSummary;
}

/** Deletes a poll this browser created. */
export async function deletePoll(id: string): Promise<void> {
  const key = getHostKey(id);
  if (!key) throw new Error("Only the browser that created this poll can delete it.");
  const res = await request(`/${encodeURIComponent(id)}`, { method: "DELETE", headers: { [HOST_KEY_HEADER]: key } });
  if (!res.ok && res.status !== 404) throw new Error("Couldn't delete this poll.");
  removeHostKey(id);
}
