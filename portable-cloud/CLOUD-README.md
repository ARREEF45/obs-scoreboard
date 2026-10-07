# Control connected to the web manager

Run with the existing OBS Scoreboard Portable V6 server, not GitHub Pages or file://.

Open Control > setup > select a match from the web. Sign in with the same Supabase user as the web manager. Choose a fixture and download teams/players. Use the match-lineup button to choose starters, substitutes and home/away kits. Unselected players are excluded by the existing OBS displays.

Team names, logos, coaches and the persistent player roster are managed at https://arreef45.github.io/obs-scoreboard/manager/. Those editing panels are removed from the Control interface. Scores, clock, graphics, substitutions, cards, replay and backups keep their existing local controls.

Downloads require internet and a valid Supabase account. Logos are downloaded into the local scoreboard state so the broadcast can continue when internet is unavailable. Internet outage is different from losing the connection to the local scoreboard server: all controllers and OBS must still reach that server.

Pulling a match never writes the clock, scores, events or graphic visibility. Pause the clock before importing. Changing to a different match is blocked when existing time, scores or events remain; first export/backup and prepare a fresh match using the original controls. Refreshing the same match preserves locally selected player roles and kit choices. Imported data is shared through the local server with other controllers/displays; credentials are kept in the browser and are not included in match state or exports.

There is no automatic background cloud overwrite and no result upload in this version. Changes to lineup selection here apply to the local broadcast only. Match selection on the website remains independent until a new import. Coordinate lineup editing between operators: stale data is checked before saving, but the existing local server does not provide atomic compare-and-swap.

Installation over V6: back up control.html, then copy control.html, cloud-control.js and cloud-lineup.html into its folder. Refresh Control. Existing display URLs and the server executable do not change.

Rebuild the bundled client from web-manager: `npx vite build --config vite.cloud.config.js`. Source: src/portable-cloud.js and src/portable-data.js. Browser validation: `node tests/cloud-control.e2e.mjs` (requires a full V6 copy under ../portable-cloud). Tests use synthetic records and mocked Supabase, never real account credentials.
