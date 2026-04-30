# voter

Real-time, mobile-first ranked-voting app. Drag to rank, submit, see live tallies.

- Two pages per poll: an **admin** view (`/#/admin/:roomId`) and a **voter** view (`/#/vote/:roomId`).
- Three tally modes: **Borda Count**, **Dowdall**, **Copeland**. Voters can locally override the global default for their own view.
- Real-time sync, presence (online + voting / changing-vote / voted indicators), and persistence via [`santistebanc/room-server`](https://github.com/santistebanc/room-server).
- Static SPA — deploys cleanly to GitHub Pages (HashRouter, no SPA-fallback config needed).

## Stack

- Vite 8 + React 19 + TypeScript 6
- `react-router-dom` 7 (`HashRouter`)
- `@dnd-kit/core` + `@dnd-kit/sortable` for drag-to-rank
- `tailwindcss` v4 with CSS-variable palette (auto light/dark)
- `nanoid` for short room ids
- `qrcode` for the admin's share QR
- [`room-server`](https://github.com/santistebanc/room-server) **v3.2.0** (typed `RoomClient`, schema version at `ready()`, delete events include `priorValue`)

## Local development

```bash
npm install
cp .env.example .env       # already filled with the public room-server defaults
npm run dev
```

Use **Node `^20.19` or `≥22.12`** (same as Vite 8 / Rolldown); older Node will skip the Rolldown native bindings and `npm run dev` may fail.

Vite 8 uses Rolldown with platform-specific native addons. Nested optional bindings can fail to install; this repo declares **`optionalDependencies`** for **`@rolldown/binding-linux-{x64,arm64}-gnu`** (version-matched to Rolldown) so **Linux amd64** (GitHub Actions) and **Linux arm64** (many WSL images) both get the right native module without forcing the wrong CPU in `npm ci`. If you still see a missing-binding error, delete `node_modules` and run `npm install` again.

`.env`:

```
VITE_HOST=room-server.santistebanc.partykit.dev
VITE_API_KEY=voting-app
```

Both vars must also be set as GitHub repository **secrets** (or **variables**) so the deploy workflow can inject them at build time.

Build:

```bash
npm run build      # → dist/
npm run preview    # serve the built bundle locally
```

## Deployment to GitHub Pages

1. Push the repo to GitHub.
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions** → add `VITE_HOST` and `VITE_API_KEY`.
4. Push to `main`. The workflow at `.github/workflows/deploy.yml` builds and publishes automatically.

`vite.config.ts` uses `base: "./"` so the produced bundle works whether deployed at the domain root or under `https://<user>.github.io/<repo>/`. Combined with `HashRouter`, deep links and shared voter URLs survive page refreshes on any static host.

## How it works

### Routing

| Path | Page |
|---|---|
| `/#/` | **Home** — auto-resume your last admin poll if it still exists, else generate a fresh `nanoid(6)` and atomically reserve it via `room.setIf("meta", default, null)`. Falls back to `nanoid(8)` after 20 collisions. 8s overall timeout with retry. |
| `/#/admin/:roomId` | Admin controls — title, options, settings, poll state, share link with QR. |
| `/#/vote/:roomId` | Voter — name, drag-to-rank, submit, results. |

Anything else 404s back to `/`.

### Room data model (PartyKit KV)

```
meta                  { title, state: "open" | "closed", createdAt }
settings              { tallyMode, showLiveResults, allowRevote, allowAdd, showUsers }
options/{optionId}    { id, text, addedBy, addedAt }
users/{userId}        { id, name, lastSeen, mode: "idle" | "voting" }   # 10s heartbeat
votes/{userId}        { userId, ranking: string[], submittedAt }
```

Every write uses a 30-day TTL. Heartbeats refresh `users/*`; admin/voter actions refresh whatever they touch; an explicit `touchKey` on connect refreshes `meta`. Abandoned polls auto-clean after 30 days of no activity.

### localStorage layout (admin/voter strictly isolated)

```
voter:admin:lastRoomId               # last poll this browser CREATED — only Home reads/writes
voter:vote:userId                    # global voter identity
voter:vote:name                      # last entered display name
voter:room:{roomId}:vote:rank        # voter's local drag order (saved on every drag-end)
voter:room:{roomId}:vote:tally       # voter's local tally-mode override
```

A user voting in someone else's poll never leaves any "admin" footprint — visiting `/` afterwards generates a brand-new poll, not a redirect into the one they just voted in.

### Tally

All three modes filter votes against the current option set on read (so deleted options don't pollute results). Results are sorted by score desc, with ties broken deterministically by `addedAt` ascending so re-renders never jitter.

| Mode | Score |
|---|---|
| Borda | 1st = `N-1`, 2nd = `N-2`, …; unranked = 0 |
| Dowdall | 1st = 1, 2nd = ½, 3rd = ⅓, …; unranked = 0 |
| Copeland | Per pair (A,B): +1 to the option more voters preferred, +0.5 each on tie. Unranked options sit below all ranked. |

### Privacy / trust model

This is a **trust-based** app. There is **no auth gate** between admin and voter views — anyone with the admin URL can edit settings, anyone with the voter URL can vote. Anyone with the public API key (which ships in the client bundle) and a roomId can read all room data, including the link from `users/{userId}.name` to that user's submitted ranking. Don't use this for sensitive or anonymous ballots.

## Project layout

```
src/
  main.tsx
  App.tsx                       # Router setup
  env.d.ts
  styles/index.css              # Tailwind import + CSS-variable palette + reduced-motion
  lib/
    room.tsx                    # RoomProvider + useRoom / useRoomValue / useRoomList
    storage.ts                  # admin/voter-namespaced localStorage helpers (try/catch wrapped)
    identity.ts                 # voter userId/name (admin has no identity)
    types.ts                    # Settings, Meta, Option, Vote + parsers + length caps
    tally.ts                    # borda / dowdall / copeland
    url.ts                      # buildVoterUrl / buildAdminUrl (HashRouter aware)
  pages/
    Home.tsx                    # Resume-or-create flow
    AdminPage.tsx
    VoterPage.tsx               # Tabs + heartbeat + ranking persistence + fallback panels
  components/
    ConnectionStatus.tsx        # Top-of-screen pill: connecting / reconnecting / fatal
    ShareLink.tsx               # voter URL + Copy + Open-in-new-tab + collapsible QR
    PollTitle.tsx               # editable prop; focus-guarded sync; mirrors document.title
    UsersList.tsx               # Participants (online + offline-but-voted) with progress summary
    UserPill.tsx                # React.memo'd state pill
    LiveOptions.tsx             # Score bars + inline-edit + remove (admin)
    ArrangeOptions.tsx          # @dnd-kit sortable; PointerSensor + KeyboardSensor; deferred-switch hook
    AddOption.tsx               # Single-add + multi-line paste batch (throttled)
    Settings.tsx
    PollState.tsx               # Open/Close toggle + Reset votes (both confirm before destructive ops)
    Username.tsx
    Tabs.tsx
    SubmitVote.tsx              # 10s timeout + retry on failure
    TallyModeSelector.tsx       # voter-side local override
```

## License

MIT
