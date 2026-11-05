import { HOST_KEY_HEADER, isPollId, POLL_ID_ALPHABET, POLL_ID_LENGTH, type CreatePollRequest, type CreatePollResponse } from "../src/lib/protocol";
import { POLL_COLOUR_IDS, type PollColour } from "../src/lib/types";

export { PollRoom } from "./pollRoom";

/**
 * Routes the poll API to each poll's Durable Object. Everything else is the
 * built app, served by Workers static assets (see wrangler.jsonc).
 *
 *   POST   /api/polls             create a poll → { id, hostKey }
 *   GET    /api/polls/:id         summary for the Home page
 *   DELETE /api/polls/:id         delete (needs the host key header)
 *   GET    /api/polls/:id/ws      WebSocket: ?user=<voterId> or ?host=<hostKey>
 */
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "api" || parts[1] !== "polls") {
      // Only poll sockets are WebSockets. Turn others away here (e.g. a tab still
      // running the old PartyKit client) rather than handing them to the assets,
      // which crashes the local dev server.
      if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
        return new Response("Not a poll socket. Reload the page.", { status: 410 });
      }
      return env.ASSETS.fetch(request);
    }

    if (parts.length === 2 && request.method === "POST") return createPoll(request, env);

    const id = (parts[2] ?? "").toUpperCase();
    if (!isPollId(id)) return json({ error: "Not a poll code." }, 404);
    const poll = env.POLLS.get(env.POLLS.idFromName(id));

    if (parts.length === 4 && parts[3] === "ws") return poll.fetch(request);
    if (parts.length === 3 && request.method === "GET") {
      const summary = await poll.summary();
      return summary ? json(summary) : json({ error: "No such poll." }, 404);
    }
    if (parts.length === 3 && request.method === "DELETE") {
      const ok = await poll.destroy(request.headers.get(HOST_KEY_HEADER) ?? "");
      return ok ? json({ ok: true }) : json({ error: "Only the host can delete this poll." }, 403);
    }
    return json({ error: "Not found." }, 404);
  },
} satisfies ExportedHandler<Env>;

async function createPoll(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as CreatePollRequest;
  const colour = POLL_COLOUR_IDS.includes(body.colour as PollColour) ? body.colour : undefined;
  const hostKey = randomToken(24);
  // Codes are short, so retry on the rare collision with a live poll.
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = randomCode();
    const poll = env.POLLS.get(env.POLLS.idFromName(id));
    if (await poll.create(id, hostKey, colour)) {
      return json({ id, hostKey } satisfies CreatePollResponse, 201);
    }
  }
  return json({ error: "Couldn't find a free poll code. Try again." }, 503);
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(POLL_ID_LENGTH));
  return [...bytes].map((b) => POLL_ID_ALPHABET[b % POLL_ID_ALPHABET.length]).join("");
}

function randomToken(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
