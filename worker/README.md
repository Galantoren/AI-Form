# Signal Relay — write proxy

`signal-relay.html` is a static page. Its Mission Control dashboard reads
submissions straight from the public GitHub Issues API (no auth needed —
the repo is public). But *creating* an issue needs a token, and a token
can't safely live inside a public HTML file — anyone who views the page
source would get it. This Worker is the only thing that holds that token;
the page POSTs to it instead of to GitHub directly.

## 1. Create a scoped token

GitHub → Settings → Developer settings → **Fine-grained personal access
tokens** → Generate new token.

- Repository access: **only** `Galantoren/AI-Form`
- Permissions: **Issues: Read and write**, nothing else
- No other repository or account permissions

This limits the blast radius if the token ever leaks: at worst someone can
open/spam issues in this one repo, nothing more.

## 2. Deploy the Worker

Requires a free Cloudflare account.

```bash
cd worker
npx wrangler login
npx wrangler secret put GITHUB_TOKEN     # paste the token from step 1
npx wrangler deploy
```

`wrangler deploy` prints the Worker's URL, something like:
`https://signal-relay-submit.<your-subdomain>.workers.dev`

## 3. Wire it into the form

In `signal-relay.html`, set:

```js
const SUBMIT_ENDPOINT = 'https://signal-relay-submit.<your-subdomain>.workers.dev/submit';
```

(Note the `/submit` — the Worker itself doesn't route paths, but keeping a
path in the URL you configure makes intent clear; the Worker responds on
any path.)

Optionally also set `ALLOWED_ORIGIN` in `wrangler.toml` to your GitHub
Pages origin (e.g. `https://galantoren.github.io`) and redeploy, so the
browser's CORS header is scoped to your page instead of `*`.

## Know the tradeoff

This endpoint has no auth of its own — anyone who has (or guesses) the
Worker URL can POST to it directly, the same way anyone can spam a public
web form or a Google Form. `ALLOWED_ORIGIN` only affects which *browser
pages* are allowed to call it via `fetch`; it does not stop a direct
`curl`. That's an acceptable tradeoff for an internal team feedback form,
but don't reuse this pattern for anything more sensitive without adding
real request auth (e.g. a per-viewer secret, or Cloudflare Access in front
of the Worker).
