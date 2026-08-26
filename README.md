# Signal Relay

A single-file feedback form for the Optimove CS AI Workshop
(`signal-relay.html`). People submit a "signal" (idea, blocker, ask); every
submission is documented as a **GitHub Issue** labeled `signal` in this
repo, and the page's built-in **Mission Control** dashboard reads those
issues back to show the team a live, shared board (totals, priority/site/
team breakdowns, a transmission log, CSV export).

## How it's wired together

- **The page** (`signal-relay.html`) is static HTML/CSS/JS — host it
  anywhere that serves static files, e.g. GitHub Pages.
- **Reads** (Mission Control's dashboard) call the public GitHub REST API
  directly from the browser — no auth needed, since this repo is public.
- **Writes** (a new submission) go through a small Cloudflare Worker (see
  `worker/`) instead of hitting GitHub directly. Creating an issue needs a
  token, and a token can't safely be embedded in a public HTML page — the
  Worker is the one place that holds it.

## Setup

1. **Deploy the write proxy** — follow `worker/README.md`. You'll end up
   with a Worker URL.
2. **Point the form at it** — in `signal-relay.html`, set `SUBMIT_ENDPOINT`
   near the top of the `<script>` block to that Worker URL.
3. **Host the page** — enable GitHub Pages on this repo (Settings → Pages →
   Source: "Deploy from a branch" → pick this branch → `/ (root)` → Save).
   GitHub gives you a URL like `https://galantoren.github.io/AI-Form/`.
4. **Share the Pages URL** with the team. Submissions show up as Issues
   labeled `signal`, and anyone who opens the page's `#control` route (the
   "Mission Control" link in the top bar) sees the shared dashboard.

## Notes

- No submissions exist until people fill out the form — Mission Control
  starts empty.
- If the Worker is unreachable when someone submits, their signal is kept
  in that browser's `localStorage` and flagged "this device only" until it
  can be resent — it won't silently vanish, but it also won't show up for
  anyone else until resubmitted successfully.
- See `worker/README.md` for the security tradeoffs of the write endpoint.
