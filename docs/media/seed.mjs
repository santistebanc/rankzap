// Makes a demo poll on a local Rankzap server (npm run preview) for the showcase capture.
// Uses only the public API: POST /api/polls, then WebSocket actions as the host and as voters.

function connect(base, pollId, query) {
  const url = base.replace(/^http/, 'ws') + `/api/polls/${pollId}/ws?${query}`;
  const ws = new WebSocket(url);
  let next = 1;
  let snapshot = null;
  const waiting = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.onerror = () => reject(new Error(`WebSocket failed: ${url}`));
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'snapshot') { snapshot = msg.poll; resolve(); }
      if (msg.type === 'result') {
        const done = waiting.get(msg.id);
        waiting.delete(msg.id);
        if (done) msg.ok ? done.resolve() : done.reject(new Error(msg.error));
      }
    };
  });
  return {
    ready,
    get poll() { return snapshot; },
    send(action) {
      const id = next++;
      return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, action })); });
    },
    close() { ws.close(1000); },
  };
}

/**
 * Creates a poll with a question and options. Each voter is { name, ranking: [option texts, best first] }.
 * Returns { id, hostKey, options } (options: { id, text }).
 */
export async function seedPoll(base, { question, options, voters = [], colour, settings = {} }) {
  const res = await fetch(`${base}/api/polls`, { method: 'POST', body: JSON.stringify({ colour }) });
  if (!res.ok) throw new Error(`create poll: HTTP ${res.status}`);
  const { id, hostKey } = await res.json();
  const host = connect(base, id, `host=${encodeURIComponent(hostKey)}`);
  await host.ready;
  await host.send({ type: 'updateSettings', patch: { ballotTitle: question, ...settings } });
  await host.send({ type: 'addOptions', texts: options });
  await new Promise((r) => setTimeout(r, 150));
  const byText = Object.fromEntries(host.poll.options.map((o) => [o.text, o.id]));
  host.close();
  let n = 0;
  for (const voter of voters) {
    const userId = `showcase-voter-${Date.now()}-${n++}`;
    const conn = connect(base, id, `user=${encodeURIComponent(userId)}`);
    await conn.ready;
    await conn.send({ type: 'join', name: voter.name, mode: 'idle' });
    await conn.send({ type: 'vote', ranking: voter.ranking.map((t) => byText[t]), newOptions: [], name: voter.name });
    conn.close();
  }
  return { id, hostKey, options: Object.entries(byText).map(([text, oid]) => ({ text, id: oid })) };
}
