<p align="left">
  <img src="./public/rankzap-logo.svg" alt="Rankzap" width="280" />
</p>

[Live app](https://rankzap.site)

![Rankzap app screenshot](./public/rankzap-screenshot.png)

Real-time, mobile-first ranked-voting app. Drag to rank, submit, see live tallies. Pen-and-paper aesthetic — warm parchment palette, ruled-line background, Patrick Hand typeface.

- Two pages per poll: an **admin** view (`/:roomId/admin`) and a **voter** view (`/:roomId`).
- Three tally modes: **Borda Count**, **Dowdall**, **Copeland**.
- Real-time sync, presence (online / voting / editing / voted indicators), and persistence via [`santistebanc/room-server`](https://github.com/santistebanc/room-server).
- Poll IDs are 4-character uppercase alphanumeric (e.g. `A3ZK`). URLs are normalised to uppercase on load.
- Static SPA — deploys to GitHub Pages with BrowserRouter + SPA 404 fallback.

## Stack

- Vite 8 + React 19 + TypeScript 6
- `react-router-dom` 7 (`BrowserRouter`)
- `@dnd-kit/core` + `@dnd-kit/sortable` for drag-to-rank
- `tailwindcss` v4 with CSS-variable palette (auto light/dark, manual toggle)
- `nanoid` (`customAlphabet`) for room IDs
- `qrcode` for the admin's share QR
- [`room-server`](https://github.com/santistebanc/room-server) **v3.2.0** (typed `RoomClient`, schema version at `ready()`, delete events include `priorValue`)

## Local development

```bash
npm install
cp .env.example .env       # already filled with the public room-server defaults
npm run dev
```

Use **Node `^20.19` or `≥22.12`** (same as Vite 8 / Rolldown); older Node will skip the Rolldown native bindings and `npm run dev` may fail.

`.env`:

```
VITE_HOST=room-server.santistebanc.partykit.dev
VITE_API_KEY=voting-app
```

Both vars must also be set as GitHub repository **secrets** (or **variables**) so the deploy workflow can inject them at build time.

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
| `/` | **Home** — start a new poll or reopen a recent one from this device. |
| `/:roomId/admin` | Admin — title, options, settings, poll state, share link with QR. |
| `/:roomId` | Voter — name, drag-to-rank, submit, results. |

Anything else redirects to `/`. Lowercase room IDs in the URL are silently redirected to their uppercase canonical form.

### Room data model (PartyKit KV)

```
meta                  { title, state: "open" | "closed", createdAt }
settings              { tallyMode, ballotTitle, showLiveResults, allowRevote, allowAdd, showUsers, showVoterVotes }
options/{optionId}    { id, text, addedBy, addedAt }
users/{userId}        { id, name, mode: "idle" | "voting" | "editing", ignored? }
votes/{userId}        { userId, ranking: string[], submittedAt, ignored? }
presence/{connId}     managed by server — { userId } — tracks live sockets
```

`mode` semantics:
- `"voting"` — voter is on the compose tab and has never submitted a vote
- `"editing"` — voter is on the compose tab, has submitted before, and their current ranking differs from the submitted one (submit button re-enabled)
- `"idle"` — everything else

Every write uses a 30-day TTL. An explicit `touchKey` on connect refreshes `meta`. Abandoned polls auto-clean after 30 days of no activity.

### localStorage layout (admin/voter strictly isolated)

```
rankzap:admin:lastRoomId             # last poll this browser created — only Home reads/writes
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

```
src/
  main.tsx
  App.tsx                       # Router setup
  styles/index.css              # Tailwind + CSS-variable palette + paper-card styles
  lib/
    room.tsx                    # RoomProvider + useRoom / useRoomValue / useRoomList
    adaptiveSize.ts             # font-size curve: big text for short strings, shrinks as length grows
    storage.ts                  # localStorage helpers (try/catch wrapped)
    identity.ts                 # voter userId/name
    types.ts                    # Settings, Meta, Option, Vote, UserRecord + length caps
    tally.ts                    # borda / dowdall / copeland
    schemas.ts                  # JSON schemas + SCHEMA_VERSION for room-server
    url.ts                      # buildVoterUrl / buildAdminUrl
  pages/
    Home.tsx                    # Start poll or reopen recent
    Layout.tsx                  # Shared admin + voter shell (RoomProvider, all live state)
    AdminPage.tsx
    RankzapPage.tsx
  components/
    ConnectionStatus.tsx        # Top-of-screen pill: connecting / reconnecting / fatal
    ThemeToggle.tsx             # Light/dark toggle (top-right corner on all pages)
    ShareLink.tsx               # Voter URL + Copy + QR code
    RankzapLogo.tsx
    Scribble.tsx                # SVG squiggle underline accent
    RankCircle.tsx              # Rank number badge
    UsersList.tsx               # Participants with presence + vote status
    UserPill.tsx                # React.memo'd state pill (voting / editing / voted / offline …)
    LiveOptions.tsx             # Score bars + inline-edit + remove (admin)
    ArrangeOptions.tsx          # @dnd-kit sortable drag-to-rank
    AddOption.tsx               # Single-add + multi-line paste (throttled); adaptive font size
    AccordionSection.tsx        # Collapsible section wrapper
    Settings.tsx
    VoterRankingPanel.tsx       # Admin: inspect individual voter's ranking
    Username.tsx
    SubmitVote.tsx
    TallyModeSelector.tsx
```

## License

MIT
