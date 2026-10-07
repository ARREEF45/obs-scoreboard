# Control connected to the web manager

Run with the existing OBS Scoreboard Portable V6 server, not GitHub Pages or file://.

Open Control > setup > select a match from the web. Sign in with the same Supabase user as the web manager. Choose a fixture and download teams/players. Use the match-lineup button to choose starters, substitutes and home/away kits. Unselected players are excluded by the existing OBS displays.

Team names, logos, coaches and the persistent player roster are managed at https://arreef45.github.io/obs-scoreboard/manager/. Those editing panels are removed from the Control interface. Scores, clock, graphics, substitutions, cards, replay and backups keep their existing local controls.

Downloads require internet and a valid Supabase account. Logos are downloaded into the local scoreboard state so the broadcast can continue when internet is unavailable. Internet outage is different from losing the connection to the local scoreboard server: all controllers and OBS must still reach that server.

Pulling a match never writes the clock, scores, events or graphic visibility. Pause the clock before importing. Changing to a different match is blocked when existing time, scores or events remain; first export/backup and prepare a fresh match using the original controls. Refreshing the same match preserves locally selected player roles and kit choices. Imported data is shared through the local server with other controllers/displays; credentials are kept in the browser and are not included in match state or exports.

## Automatic result upload

First run web-manager/supabase/migrations/003_broadcast_results.sql once in the project's SQL Editor. Refresh Control, sign in and pull the match again to initialize result tracking. Keep at least one authenticated Control open. Every three seconds it checks the local server; when scores or match status change, it sends the latest result. FULL TIME marks the match finished and updates web standings. The initial pull does not push an unchanged zero score over an existing web result.

Pending results are saved per account and match in browser localStorage and retried after internet returns or the browser reopens. Do not clear browser data while results are pending. Keep the local scoreboard server reachable. Requests are idempotent and version guarded. A conflicting web edit stops automatic upload; the operator can explicitly confirm using the current Control result instead. Other authenticated controllers share the last acknowledged version through the local server.

This uploads scores and status only. It does not create individual goals, assists or card records. Player statistics still come from the web event records; the web labels scores supplied by OBS. Cloud imports never overwrite the local clock or scores. Changes to lineup selection here apply to the local broadcast only. Coordinate lineup editing between operators: stale data is checked before saving, but the existing local server does not provide atomic compare-and-swap.

Installation over V6: back up control.html, then copy control.html, cloud-control.js and cloud-lineup.html into its folder. Refresh Control. Existing display URLs and the server executable do not change.

Rebuild the bundled client from web-manager: `npx vite build --config vite.cloud.config.js`. Source: src/portable-cloud.js and src/portable-data.js. Browser validation: `node tests/cloud-control.e2e.mjs` (requires a full V6 copy under ../portable-cloud). Tests use synthetic records and mocked Supabase, never real account credentials.
