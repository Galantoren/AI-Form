/**
 * Signal Relay write proxy.
 *
 * index.html is a public, static page (served e.g. via GitHub Pages).
 * Reads of Mission Control hit the public GitHub REST API directly — no
 * secret needed for that, since the repo is public.
 *
 * Writes are different: creating an Issue requires a token, and a token
 * embedded in public client-side HTML would be visible to anyone who views
 * the page source. This Worker is the only thing that holds that token. The
 * page POSTs a submission here; this Worker validates it, computes the next
 * crew id, and creates the GitHub Issue server-side.
 *
 * Required secret (set with `wrangler secret put GITHUB_TOKEN`):
 *   GITHUB_TOKEN - a fine-grained PAT scoped to ONLY this repo, with
 *                  "Issues: Read and write" permission and nothing else.
 *
 * Required vars (wrangler.toml [vars]):
 *   GITHUB_REPO    - "owner/repo", e.g. "Galantoren/AI-Form"
 *   ALLOWED_ORIGIN - the origin the form is served from, e.g.
 *                    "https://galantoren.github.io" (used for the CORS
 *                    header shown to browsers; it does NOT block a direct
 *                    curl/script call to this endpoint from elsewhere — see
 *                    the note in worker/README.md about this being an
 *                    inherently public write endpoint, like any web form).
 */

const SIGNAL_LABEL = 'signal';
const SITES = ['UK', 'US', 'TLV'];
const TEAMS = ['Enterprise', 'SMB'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Mission-Critical'];

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, corsHeaders);
    }

    let data;
    try {
      data = await request.json();
    } catch (e) {
      return json({ error: 'invalid_json' }, 400, corsHeaders);
    }

    const errors = validate(data);
    if (errors.length) {
      return json({ error: 'validation_failed', fields: errors }, 400, corsHeaders);
    }

    const repo = env.GITHUB_REPO;
    const ghHeaders = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'signal-relay-worker',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    let seq;
    try {
      seq = await nextSequence(repo, ghHeaders);
    } catch (e) {
      return json({ error: 'github_unreachable' }, 502, corsHeaders);
    }
    const crewId = 'CSA-' + String(seq).padStart(3, '0');

    const submission = {
      id: typeof data.id === 'string' ? data.id.slice(0, 64) : undefined,
      ts: Date.now(),
      crewId,
      crewSeq: seq,
      name: String(data.name).trim().slice(0, 120),
      site: data.site,
      team: data.team,
      headline: String(data.headline).trim().slice(0, 90),
      details: String(data.details).trim().slice(0, 1600),
      priority: data.priority,
      wantsDemo: !!data.wantsDemo,
      wantsSkillShare: !!data.wantsSkillShare,
      skill: data.wantsSkillShare ? String(data.skill || '').trim().slice(0, 80) : '',
    };

    const title = `[${crewId}] ${submission.headline}`;
    const body = [
      `**Name:** ${submission.name}`,
      `**Site:** ${submission.site}`,
      `**Team:** ${submission.team}`,
      `**Priority:** ${submission.priority}`,
      `**Wants to demo:** ${submission.wantsDemo ? 'Yes' : 'No'}`,
      `**Skill to share:** ${submission.wantsSkillShare ? submission.skill || 'Yes' : 'No'}`,
      '',
      submission.details,
      '',
      '```json',
      JSON.stringify(submission),
      '```',
    ].join('\n');

    let createResp;
    try {
      createResp = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, labels: [SIGNAL_LABEL] }),
      });
    } catch (e) {
      return json({ error: 'github_unreachable' }, 502, corsHeaders);
    }

    if (!createResp.ok) {
      return json({ error: 'github_error', status: createResp.status }, 502, corsHeaders);
    }

    const issue = await createResp.json();
    return json({ ok: true, crewId, crewSeq: seq, issueNumber: issue.number }, 200, corsHeaders);
  },
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function validate(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['body'];
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) errors.push('name');
  if (!SITES.includes(data.site)) errors.push('site');
  if (!TEAMS.includes(data.team)) errors.push('team');
  if (!data.headline || typeof data.headline !== 'string' || !data.headline.trim()) errors.push('headline');
  if (!data.details || typeof data.details !== 'string' || data.details.trim().length < 6) errors.push('details');
  if (!PRIORITIES.includes(data.priority)) errors.push('priority');
  if (data.wantsSkillShare && data.skill && typeof data.skill !== 'string') errors.push('skill');
  return errors;
}

// GitHub doesn't expose a plain "count of issues with this label" field, but
// asking for 1 result per page and reading the `page=N` of the `rel="last"`
// Link header gives the total page count, which equals the total count.
async function nextSequence(repo, ghHeaders) {
  const resp = await fetch(
    `https://api.github.com/repos/${repo}/issues?labels=${encodeURIComponent(SIGNAL_LABEL)}&state=all&per_page=1`,
    { headers: ghHeaders }
  );
  if (!resp.ok) throw new Error('count_failed');
  const link = resp.headers.get('Link');
  if (link) {
    const match = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
    if (match) return parseInt(match[1], 10) + 1;
  }
  const items = await resp.json();
  return items.length + 1;
}
