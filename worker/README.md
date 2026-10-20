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

## 4. (Optional) Email each response to a list

Cloudflare can't email arbitrary addresses by itself, so emails go out
through a tiny Google Apps Script (`email-relay.gs`) that sends from your
Google account.

1. Go to https://script.google.com → **New project**. Replace the code with
   the contents of `worker/email-relay.gs`.
2. In the Apps Script editor (not in this repo — it's public), set
   `RECIPIENTS` to your email list and `SHARED_KEY` to a long random
   string.
3. **Deploy → New deployment** → type **Web app** → Execute as **Me**,
   Who has access **Anyone** → Deploy. Approve the permission prompt
   (Google will warn the app is unverified; it's your own script, so
   choose Advanced → continue). Copy the web app URL.
4. Store the URL plus your key as a Worker secret, then redeploy:

   ```bash
   cd worker
   npx wrangler secret put EMAIL_WEBHOOK_URL
   # paste: https://script.google.com/macros/s/<id>/exec?key=<your SHARED_KEY>
   npx wrangler deploy
   ```

Each new response then emails the full answers plus a link to its issue.
If the email fails, the response is still saved. To change who gets it,
edit `RECIPIENTS` in Apps Script and deploy a new version (Deploy → Manage
deployments → edit → New version) — the URL stays the same. To stop the
emails, run `npx wrangler secret delete EMAIL_WEBHOOK_URL`.

Gmail allows about 100 recipients per day on a personal account (1,500
on Google Workspace); each response counts once per recipient.

## Know the tradeoff

This endpoint has no auth of its own — anyone who has (or guesses) the
Worker URL can POST to it directly, the same way anyone can spam a public
web form or a Google Form. `ALLOWED_ORIGIN` only affects which *browser
pages* are allowed to call it via `fetch`; it does not stop a direct
`curl`. That's an acceptable tradeoff for an internal team feedback form,
but don't reuse this pattern for anything more sensitive without adding
real request auth (e.g. a per-viewer secret, or Cloudflare Access in front
of the Worker).
