ROUND 1
Seen in one second: a bold yellow poll app with create and join controls.
Idea (one sentence): carry the approved Podium poster into a useful create/join screen.
Live thing: chosen poll colour is saved before creation; code joins the voter route; recents reopen the host route.
Layout words by section: hero=poster / create=white field / join=code and action / recents=colour-marked list.
Top three problems:
1. home-phone.png: large square swatches push Join below the fold; use 44px-high swatches.
2. home-narrow.png: large code badges and arrows squeeze titles; use small colour marks and let titles wrap.
3. home-tablet.png: one column leaves a large unused area; start the split layout at 768px.

ROUND 2 (final)
Seen in one second: Rankzap, start a poll, or join with a code.
Idea (one sentence): the chosen Podium identity with compact phone controls and clear host/voter destinations.
Live thing: creation, joining, colour selection, reopening, deletion confirmation.
Layout words by section: hero=poster / create=white field / join=code and action / recents=flat list.
Scores: design 7.5 · usability 8 · creativity 7.5 · content 8 → overall 7.7
Caps applied: marketing imagery and scroll-motion requirements do not apply to this functional app screen.
Remaining tradeoffs:
1. Recent polls sit below the first phone screen; create and join take priority.
2. The broad yellow ground and large heading intentionally preserve the user's approved brand.
3. Live room transport is unverified; the harness exercises room responses and failures locally.

Validation
- Production TypeScript/Vite build.
- Automated interactions: chosen-colour persistence, home stays yellow, uppercase code normalisation, voter/host routing, unavailable and invalid codes, delete/cancel, failed settings write cleanup, unconfigured state.
- Screenshots at 1440, 768, 390 and 320px, including empty and long-content states; no horizontal overflow or browser errors.
- Skill inspector: 0 FAIL, 0 WARN at 1440, 768, 390px. Explicit allowances: icon-chips are the real colour picker; colour-sprawl and app-title-size preserve the approved Podium design.
- Source lint: 0 FAIL; pulse warning is the temporary loading skeleton.
- No photographs or illustrations were added. Harness data is fake; production renders stored polls.
