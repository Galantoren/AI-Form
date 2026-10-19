# AI Pulse · CSM Survey

A single-file survey for Optimove CSMs (`index.html`). Each response is
saved as a **GitHub Issue** labeled `survey` in this repo — a readable
summary plus the full answers as JSON at the bottom of the issue.

## How it's wired together

- **The page** (`index.html`) is static HTML/CSS/JS, deployed to GitHub
  Pages by `.github/workflows/pages.yml`.
- **Writes** (a submitted response) go through a small Cloudflare Worker
  (see `worker/`) instead of hitting GitHub directly. Creating an issue
  needs a token, and a token can't safely be embedded in a public HTML
  page — the Worker is the one place that holds it.
- The Worker URL is set in `CONFIG.endpoint` near the top of the
  `<script>` block in `index.html`. Leave it empty and the final button
  falls back to copying the answers as text.

## Notes

- This repo is public, so every response (including names) is readable
  by anyone who opens the repo's Issues.
- In-progress answers are kept in the respondent's browser
  (`localStorage`), so a failed send can simply be retried.
- To read all responses: Issues → filter by label `survey`. Each issue's
  JSON block is machine-readable if you want to export them.
- See `worker/README.md` for deploying the Worker and the security
  tradeoffs of the write endpoint.
