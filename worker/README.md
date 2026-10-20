# AI Pulse — write proxy

`index.html` is a static page. Saving a survey response means creating a
GitHub Issue, which needs a token, and a token can't safely live inside a
public HTML file — anyone who views the page source would get it. This
Worker is the only thing that holds that token; the page POSTs each
response to it instead of to GitHub directly, and it creates an issue
labeled `survey`.

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

In `index.html`, set:

```js
const CONFIG = { endpoint: 'https://signal-relay-submit.<your-subdomain>.workers.dev/submit', total: 8 };
```

(Note the `/submit` — the Worker itself doesn't route paths, but keeping a
path in the URL you configure makes intent clear; the Worker responds on
any path.)

Optionally also set `ALLOWED_ORIGIN` in `wrangler.toml` to your GitHub
Pages origin (e.g. `https://galantoren.github.io`) and redeploy, so the
browser's CORS header is scoped to your page instead of `*`.

## 4. (Optional) Post each response to Slack

1. Go to https://api.slack.com/apps → **Create New App** → From scratch,
   pick your workspace.
2. **Incoming Webhooks** → turn it on → **Add New Webhook to Workspace** →
   pick the channel → Allow. Copy the webhook URL.
3. Store it as a secret (it lets anyone post to that channel, so never put
   it in `index.html` or `wrangler.toml`):

   ```bash
   cd worker
   npx wrangler secret put SLACK_WEBHOOK_URL   # paste the webhook URL
   ```

Each new response then posts the person's name, region, top time sinks,
automation ideas and knowledge gaps, with a link to the full answers. If
Slack is down the response is still saved. To stop the posts, run
`npx wrangler secret delete SLACK_WEBHOOK_URL`.

## Know the tradeoff

This endpoint has no auth of its own — anyone who has (or guesses) the
Worker URL can POST to it directly, the same way anyone can spam a public
web form or a Google Form. `ALLOWED_ORIGIN` only affects which *browser
pages* are allowed to call it via `fetch`; it does not stop a direct
`curl`. That's an acceptable tradeoff for an internal team feedback form,
but don't reuse this pattern for anything more sensitive without adding
real request auth (e.g. a per-viewer secret, or Cloudflare Access in front
of the Worker).
