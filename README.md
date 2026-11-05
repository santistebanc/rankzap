<p align="left">
  <img src="./public/rankzap-logo.svg" alt="Rankzap" width="280" />
</p>

[Live app](https://rankzap.site)

![Rankzap ballot, results and host controls](./public/rankzap-screenshot.png)

Screenshots use demo data rendered by the real app components. [Desktop host view](./public/rankzap-admin.png).

Real-time, mobile-first ranked-voting app. Drag to rank, submit, see live tallies. The Podium design uses condensed Archivo type, a staircase ballot, and bold colour. Home stays brand yellow; hosts can choose from eight poll colours when creating a poll or change the colour later. The current design uses a light theme.

- Create a poll, join with a four-character code, or reopen your recent polls from Home.
- Two pages per poll: an **admin** view (`/:roomId/admin`) and a **voter** view (`/:roomId`).
- Three tally modes: **Borda Count**, **Dowdall**, **Copeland**.
- Real-time sync, presence (online / voting / editing / voted indicators), and persistence via [`santistebanc/room-server`](https://github.com/santistebanc/room-server).
- Poll IDs are 4-character uppercase alphanumeric (e.g. `A3ZK`). URLs are normalised to uppercase on load.
- Static SPA — deploys to GitHub Pages with BrowserRouter + SPA 404 fallback.

## Stack

- Vite 8 + React 19 + TypeScript 6
- `react-router-dom` 7 (`BrowserRouter`)
- `@dnd-kit/core` + `@dnd-kit/sortable` for drag-to-rank
- `tailwindcss` v4 with semantic colour tokens, eight per-poll palettes, and reduced-motion support
- `nanoid` (`customAlphabet`) for room IDs
- `qrcode` for the admin's share QR
- [`room-server`](https://github.com/santistebanc/room-server) **v3.2.0** (typed `RoomClient`, schema version at `ready()`, delete events include `priorValue`)

## Local development

```bash
npm install
cp .env.example .env
npm run dev:server        # terminal 1: local room server on port 1999
npm run dev               # terminal 2: Vite frontend
```

Use **Node `^20.19` or `≥22.12`** (same as Vite 8 / Rolldown); older Node will skip the Rolldown native bindings and `npm run dev` may fail.

`.env`:

```
VITE_HOST=same-origin
VITE_API_KEY=voting-app
```

Local polls are stored in `.partykit/` and survive server restarts. They are separate from hosted polls. `.env.local`, if present, overrides `.env`.

`same-origin` sends room connections through Vite's HTTP/WebSocket proxy to the local backend on port 1999. Desktop and phone clients use the same frontend address instead of trying to connect to their own loopback address.

For private phone access with Tailscale, add the computer's Tailscale hostname to `VITE_DEV_ALLOWED_HOSTS` in `.env.local`, restart Vite, and run `tailscale serve --bg --https=8443 http://127.0.0.1:5173` (use the actual Vite port). Open the printed HTTPS link on a phone connected to the same tailnet. This shares the app privately through Tailscale Serve.

For a hosted build, set `VITE_HOST` to a reachable deployed room-server hostname and `VITE_API_KEY` to its app key. Both must be set as GitHub repository **secrets** (or **variables**) so the deploy workflow can inject them at build time. The former default `room-server.santistebanc.partykit.dev` no longer resolves; local development uses the included server instead.

```bash
npm run build      # → dist/
npm run preview    # serve the built bundle locally
```

## Deployment to GitHub Pages

1. Push the repo to GitHub.
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions** → add `VITE_HOST` and `VITE_API_KEY`.
4. Push to `main`. The workflow at `.github/workflows/deploy.yml` builds and publishes automatically.

`vite.config.ts` uses `base: "/"` and the repo includes `public/404.html` + an `index.html` restore script so deep links and refreshes work on GitHub Pages with clean URLs.

## How it works

### Routing

| Path | Page |
|---|---|
| `/` | **Home** — create a poll with a colour, join by code, or reopen a recent poll from this device. |
| `/:roomId/admin` | Admin — edit title/options, inspect voters, change colour/scoring/settings, close/reset, share link and full-screen QR. |
| `/:roomId` | Voter — enter a name, drag to rank, lock in a vote, watch results, see the final winner. |

Anything else redirects to `/`. Lowercase room IDs in the URL are silently redirected to their uppercase canonical form.

### Room data model (PartyKit KV)

```
meta                  { title, state: "open" | "closed", createdAt }
settings              { tallyMode, ballotTitle, showLiveResults, allowRevote, allowAdd, showUsers, showVoterVotes, colour? }
options/{optionId}    { id, text, addedBy, addedAt }
users/{userId}        { id, name, mode: "idle" | "voting" | "editing", ignored? }
votes/{userId}        { userId, ranking: string[], submittedAt, ignored? }
presence/{connId}     managed by server — { userId } — tracks live sockets
```

Schema version 9 adds optional `settings.colour`: `yellow`, `lime`, `mint`, `sky`, `cobalt`, `pink`, `tomato`, or `orange`. Older polls without a colour use yellow. Changing a poll colour updates every connected view; colour changes animate where supported and respect reduced motion.

`mode` semantics:
- `"voting"` — voter is on the compose tab and has never submitted a vote
- `"editing"` — voter is on the compose tab, has submitted before, and their current ranking differs from the submitted one (submit button re-enabled)
- `"idle"` — everything else

Every write uses a 30-day TTL. An explicit `touchKey` on connect refreshes `meta`. Abandoned polls auto-clean after 30 days of no activity.

### localStorage layout (admin/voter strictly isolated)

```
rankzap:admin:lastRoomId           # last poll this browser created
rankzap:admin:recentPolls          # recent host polls on this device ({ roomId, savedAt }[])
rankzap:vote:userId                  # global voter identity
rankzap:vote:name                    # last entered display name
rankzap:room:{roomId}:vote:rank      # voter's local drag order (saved on every drag-end)
```

### Tally

All three modes filter votes against the current option set on read. Results are sorted by score desc, ties broken by `addedAt` ascending.

| Mode | Score |
|---|---|
| Borda | 1st = `N-1`, 2nd = `N-2`, …; unranked = 0 |
| Dowdall | 1st = 1, 2nd = ½, 3rd = ⅓, …; unranked = 0 |
| Copeland | Per pair (A,B): +1 to the option more voters preferred, +0.5 each on tie. |

### Privacy / trust model

**No auth gate.** Anyone with the admin URL can edit settings; anyone with the voter URL can vote. The API key ships in the client bundle. Don't use this for sensitive or anonymous ballots.

## Project layout

```text
src/
  main.tsx                       # React root and router
  App.tsx                        # Lazy-loaded routes
  styles/index.css               # Podium colour/type/motion tokens
  lib/
    roomClient.ts                # Typed room-server client and configuration
    room.tsx                     # RoomProvider, subscriptions and live state hooks
    pollColour.ts                # Applies a poll's palette; restores yellow on Home
    types.ts                     # Data types, palette table and length limits
    schemas.ts                   # JSON schemas and schema version
    tally.ts                     # Borda, Dowdall and Copeland
    storage.ts                   # Admin/voter localStorage helpers
    identity.ts                  # Voter identity and display name
    adaptiveSize.ts              # Fits type to the length of an option or question
    url.ts                       # Voter/admin URL builders
  pages/
    Home.tsx                     # Create, join by code and recent host polls
    Layout.tsx                   # Loads room data and applies the poll colour
    AdminPage.tsx
    RankzapPage.tsx
    poll/
      AdminView.tsx              # Responsive host panels and poll actions
      VoterView.tsx              # Name and ballot flows
      VoterResults.tsx           # Submitted/closed results, ties and sharing
      shared.tsx                 # Shared poll data type, modal, header and footer
  components/
    ColourPicker.tsx            # Eight accessible colour swatches
    ArrangeOptions.tsx          # dnd-kit staircase ballot
    LiveOptions.tsx             # Live score bands, inline edit and option removal
    AddOption.tsx               # Single-add and multiline paste
    SubmitVote.tsx              # Vote submission, progress and errors
    UsersList.tsx               # Participants and selectable voter tags
    UserPill.tsx                # Presence/vote status tags
    VoterRankingPanel.tsx       # Individual ranking list
    Settings.tsx               # Host panels, scoring and switches
    ShareLink.tsx              # Share panel and full-screen QR
    Arrow.tsx
    Punch.tsx                   # Feedback when a score or rank changes
```

`design-explorations/` contains the original directions, the approved Podium mockup, and local preview harnesses. Harness data is fake and is not included in the production app.

## License

MIT
