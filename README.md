# Chemical Bingo

**Play live:** <https://chemical-bingo.paolo-aliprandi.workers.dev/>

## Languages

Choose **English** or **Italiano** on the home or game page. The interface, gameplay feedback, accessible labels, and all 118 element names are translated. Italian is selected automatically for Italian browser settings unless a language has already been chosen. The preference is remembered in your browser and included in navigation and invitation links.

Switching language does not reset your board, score, mistakes, or room. Players can use different languages in the same room: clues still refer to the same element symbol, and the server keeps claims and scoring shared.

Use **Dark mode** on either page to switch themes without interrupting play. The theme follows your system setting until you choose one, then remembers your preference across pages. Completed-row colors and red error indicators remain distinct in both themes.

Match chemical element names to their symbols, earn points, and celebrate each Bingo. In multiplayer, aim for the highest score; you do not need a complete cartella to win. The home page lets you choose **Single player** or **Multiplayer**.

## Playing

Each board has four rows of five unique symbols. Clues are drawn from **all 118 elements in one pool**, not just those on your board, with no orbital rounds or fixed s/p/d/f sequence. The rows are grouped by orbital only to organize the board; symbols in every incomplete row remain playable. If a clue is missing, skip it. In solo mode, each element is drawn once per cycle; exhausted pools renew without already matched symbols so skipped matches remain reachable.

Correct answers turn green. Claims score **s = 1**, **p = 2**, **d = 3**, **f = 4** points each; a full board is worth 50 points. Wrong answers briefly turn red and let you retry. Completed rows lock, display a completion label, and turn **blue for s**, **red for p**, **yellow for d**, or **purple for f**, with a wave animation and Bingo banner. Reduced-motion preferences are respected. Use a mouse, touch, or Tab and Enter/Space.

Wrong answers add one mistake to your counter but never deduct points. In multiplayer, the first mistake on a clue triggers a one-second retry cooldown; the second automatically skips that player for the rest of the clue. Other players can still claim it. The per-clue count resets on the next draw, while the total mistake counter is preserved. These rules are tracked by the server and survive reconnects. Manual and automatic skips prevent further attempts on that clue. Skips, stale requests, unavailable symbols, and lost claim races do not count as mistakes. The previous clue's correct name and symbol are revealed only after that clue ends.

In single-player mode, **Next element** skips a clue and **New game** creates a fresh board.

## Multiplayer rooms

1. Select **Multiplayer** on the home page, enter a player name, and **Create room**.
2. Share the six-character room code or **Copy invite** link. Friends enter their own names and use **Join with code**.
3. The host selects **Start game** once everyone has joined.

Rooms support up to 20 players. Each player gets a private, independently generated board; everyone sees the same clue. **The first valid claim received by the server wins the element and its orbital's points.** That element becomes permanently unavailable to every other player. Simultaneous claims are resolved by the server, not by client-side timing.

On opponents' screens, the symbol and shared clue turn red and fall away; the claimant's name appears on the lost tile and clue card. The winner keeps a green symbol. Reduced-motion mode shows the final red/name state without falling animations.

A shared, server-controlled **10-minute timer** starts with the game and survives reloads and reconnects. Each clue has a **maximum five-second window** and advances automatically, even if someone never selects Skip. A successful claim or everyone becoming ready through **Skip / Ready** or a two-mistake automatic skip advances after a short feedback pause, or at the clue deadline if sooner. Late claims cannot score after a clue or game deadline.

All 118 elements are eligible for the initial draw pool. After that pool is exhausted, **only skipped, unclaimed elements still needed on at least one current player's cartella can return**. Off-board elements and claimed symbols never recycle. Completing a row does not start a new round or restrict subsequent draws.

The game stops **immediately when someone completes all 20 symbols**, awarding them the win, or **when the 10-minute timer expires**, awarding the win to the highest weighted score. Equal scores share the win; a game with no claims has no winner. Players do not need a complete cartella to win on points. The timer does not guarantee that all 118 elements will be drawn. If the pools contain no claimable elements, drawing pauses until time expires.

Both endings show a final podium and full ranking with points, matched symbols, and mistakes. The host can select **Play again** to return everyone to the same room's lobby and start a fresh 10-minute game. Everyone can select **Home** to leave the room.

Only the host can start or reset. **Reset room** returns everyone to the lobby so more friends can join. Players cannot join mid-game. **Leave room** returns to the home page; if the host leaves, another player becomes host.

Reloading reconnects to your existing player and board. Disconnected players have 60 seconds to reconnect before being removed. Rooms expire after two hours without gameplay activity. No player accounts are required; membership is kept in an HTTP-only cookie. To try two players on one computer, use a normal browser window and a separate private/incognito window.

Rooms created under previous rules return to the lobby when upgraded, with fresh boards and scores. The host can start a new timed game.

## Local development

With Node.js 22 or newer:

```sh
npm ci
npm run dev
```

Open <http://localhost:8080/>. Wrangler runs the frontend and a local version of the multiplayer backend. No Cloudflare login is needed for local development. Keep the server running while playing; press Ctrl+C to stop it.

To serve **single-player only** with Python 3:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory public
```

Multiplayer requires Wrangler or the deployed Cloudflare Worker; a static server alone cannot host rooms. Opening HTML directly with `file://` is unsupported because browsers restrict loading element data.

## Free personal hosting

The game uses Cloudflare Workers with static assets and SQLite-backed Durable Objects. Each room is a Durable Object with server-validated moves and a persistent room state. WebSockets use hibernation and automatic ping responses to avoid keeping idle rooms running.

Use a **personal Cloudflare account on the Workers Free plan**, not an organizational Azure subscription:

```sh
npx wrangler login
npx wrangler whoami
npm run deploy
```

Confirm the personal account before deploying. The deployment command publishes both the site and multiplayer backend and prints the live `workers.dev` URL. No custom domain or paid plan is required.

### Automatic deployments from GitHub

In the personal Cloudflare dashboard, open **Workers & Pages > chemical-bingo > Settings > Builds** and connect **paolo-aliprandi/ChemicalBingo**. Authorize the Cloudflare GitHub app for this repository only. Use production branch **main**, repository root **/**, no build command, and **npm run deploy** as the deploy command. Disable non-production branch builds; the preview command can keep its default value.

Once connected, pushes to `main` automatically deploy the existing Worker and its static assets. Check the build result in Cloudflare's **Builds** tab; GitHub Pages checks do not verify the Cloudflare deployment. No runtime variables or GitHub Actions secrets are required for this native integration.

Workers Builds is available on the Free plan with 3,000 build minutes per month. Keep Workers Free enabled. See [Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/) and [build limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/).

Cloudflare's Free plan currently includes 100,000 Worker requests per day and free static asset requests. SQLite-backed Durable Objects also have daily compute and storage limits. Exceeding a free-plan limit makes the affected operations fail until the limit resets; do not enable Workers Paid if you require a zero-cost deployment. See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) for current limits.

Frontend files are in `public/`. `worker.js` implements rooms, and `wrangler.jsonc` configures the free-tier-compatible SQLite namespace. Only `public/` is served as static assets; local configuration and backend source are not public URLs.
