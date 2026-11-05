# Podium + poll colour: implementation plan

Target: `design-explorations/podium-app/index.html` (light Podium; the host picks a colour per poll).
Each step below ships on its own and leaves the app working.

## 1. Tokens and type (no layout changes)

- `index.html`: swap Space Grotesk/Mono for `Archivo:wdth,wght@62..125,400..900`. Set `theme-color` to `#ffdd1f`.
- `src/styles/index.css`: replace the newsprint palette with the Podium tokens:
  `--ground --ink --hi --hi-ink --step --step-ink --low --low-ink --chip --chip-ink`,
  plus `--sig --sig-ink --sig-fg` (defaults to yellow).
  Map them in `@theme` so Tailwind classes like `bg-sig` and `text-ink` work.
  Add `--font-display` with `font-stretch: 62%` as a `.display` utility.
- Keep the old token names as aliases (`--accent: var(--ink)` and so on) for now, so the existing screens still render while they're rebuilt.

## 2. Poll colour in the data

- `src/lib/types.ts`: add `PollColour = "yellow" | "lime" | "mint" | "sky" | "cobalt" | "pink" | "tomato" | "orange"`
  and a `POLL_COLOURS` table with `{ sig, ink, fg }` for each colour (the values from the mockup: cobalt uses ink `#fff` and fg `#8b9bff`; tomato uses fg `#ff6a50`).
  Add an optional `colour?: PollColour` to `Settings`. **Don't** add it to `DEFAULT_SETTINGS()`; missing means yellow.
- `src/lib/schemas.ts`: add `colour: { type: "string", enum: [...] }` to `properties` only. Leave it out of `required`, so existing rooms stay valid. Bump `SCHEMA_VERSION` to 9.
- `src/pages/Home.tsx` (~line 143): the auto-prune check treats a poll that still has default settings as "empty". Add `&& (settingsValue.colour ?? "yellow") === "yellow"` so a poll whose only change is its colour isn't deleted.
  Also read the colour into `RecentPollView`, so the recent list can show the swatch.
- New `src/lib/pollColour.ts`: a `usePollColour()` hook that writes the three `--sig*` vars onto a wrapper element in `Layout`. Home always stays yellow.

## 3. Shared pieces

- `ColourPicker` (new): 8 swatches as a radiogroup, with the circular view-transition flood (instant when reduced motion is on or the API is missing). It writes `settings.colour`.
- `Staircase` row styles: rows sized by rank (108/84/70/58px, then the base size). Use `nth-child` CSS, not JS.
- Rebuild `ArrangeOptions.tsx` in the Podium style but **keep dnd-kit** (it already handles touch, keyboard and auto-scroll). Add the numeral punch on drop.
- Score bands for `LiveOptions.tsx`: `--share` width, `--low` track, and the leader in `--hi`.
- Rebuild `UserPill.tsx` as status tags: voted, ranking (blinking), changing, offline.

## 4. Screens, one PR each

1. **Voter ballot** (`Layout.tsx` voter branch): arrive/name, staircase, "Lock it in".
2. **Voted + closed**: the "You're in." banner, results so far, the final winner block, and your ranking.
3. **Admin** (`Layout.tsx` admin branch, desktop): options panel, voters panel, share panel, colour, scoring, and the five switches from `Settings.tsx`. The settings move out of the modal into the page.
4. **Admin on phone**: the same branch at small widths: set up, share with a big code, watch and close.
5. **Home**: hero, create poll, join by code (new; goes to `/:code` after checking the room exists), recent polls with swatches.

`Layout.tsx` is 1190 lines and holds both branches. Split it into `VoterView` / `AdminView` during step 1 or 3 rather than restyling it in place.
The inline-style helpers (`pill`, `iconButton`, `textButton`, `MonoLabel`) go away once both views are rebuilt.

## 5. Cleanup

- Drop the token aliases from step 1 and remove Space Grotesk.
- Update the README's "current look" section and screenshots.
- Check contrast for all 8 colours on each screen. The mockup already fixed cobalt's bands and segmented control; re-check in the real app.

## Not in scope (ask first)

- Dark mode / Floodlight (the tokens make it a later add-on).
- Custom hex colours.
- Real QR: keep the `qrcode` library already used by `ShareLink.tsx`; the mockup's QR is fake.
