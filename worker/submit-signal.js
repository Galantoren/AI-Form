/**
 * AI Pulse survey write proxy.
 *
 * index.html is a public, static page (served via GitHub Pages). Saving a
 * response means creating a GitHub Issue, which requires a token, and a
 * token embedded in public client-side HTML would be visible to anyone who
 * views the page source. This Worker is the only thing that holds that
 * token. The page POSTs a response here; this Worker validates it and
 * creates the GitHub Issue (labeled `survey`) server-side.
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

const SURVEY_LABEL = 'survey';
const MAX_BODY_BYTES = 50000;

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

    // The page posts with Content-Type text/plain (avoids a CORS preflight),
    // so read the raw text and parse it ourselves.
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return json({ error: 'too_large' }, 413, corsHeaders);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return json({ error: 'invalid_json' }, 400, corsHeaders);
    }

    const errors = validate(data);
    if (errors.length) {
      return json({ error: 'validation_failed', fields: errors }, 400, corsHeaders);
    }

    const response = normalize(data);
    const title = `[AI Pulse] ${response.name}${response.region ? ` (${response.region})` : ''}`;
    const body = [
      renderMarkdown(response),
      '',
      '~~~~json',
      JSON.stringify(response, null, 2),
      '~~~~',
    ].join('\n');

    let createResp;
    try {
      createResp = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ai-pulse-worker',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, body, labels: [SURVEY_LABEL] }),
      });
    } catch (e) {
      return json({ error: 'github_unreachable' }, 502, corsHeaders);
    }

    if (!createResp.ok) {
      return json({ error: 'github_error', status: createResp.status }, 502, corsHeaders);
    }

    const issue = await createResp.json();
    return json({ ok: true, issueNumber: issue.number }, 200, corsHeaders);
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
  if (!data.answers || typeof data.answers !== 'object') errors.push('answers');
  return errors;
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v, max) => (Array.isArray(v) ? v.map((x) => str(x, 200)).filter(Boolean).slice(0, max) : []);

// Rebuild the response from known fields only, so arbitrary extra keys a
// direct caller might send never end up in the issue.
function normalize(d) {
  const a = d.answers || {};
  const sinks = Array.isArray(a.timeSinks) ? a.timeSinks : [];
  return {
    survey: str(d.survey, 80) || 'CSM AI Survey',
    submittedAt: new Date().toISOString(),
    name: str(d.name, 120),
    region: str(d.region, 40) || null,
    luckyNumber: Number.isFinite(d.luckyNumber) ? d.luckyNumber : null,
    drawnVia: str(d.drawnVia, 40),
    minutes: Number.isFinite(d.minutes) ? d.minutes : null,
    answers: {
      dayToDayResult: str(a.dayToDayResult, 12000),
      portfolio: str(a.portfolio, 500),
      timeSinks: sinks
        .slice(0, 10)
        .map((t) => ({ task: str(t && t.task, 300), hrsPerWeek: str(String((t && t.hrsPerWeek) ?? ''), 10) }))
        .filter((t) => t.task),
      timeSinkCategories: strList(a.timeSinkCategories, 20),
      proactiveWork: {
        ideas: strList(a.proactiveWork && a.proactiveWork.ideas, 20),
        text: str(a.proactiveWork && a.proactiveWork.text, 3000),
      },
      automation: {
        ideas: strList(a.automation && a.automation.ideas, 20),
        text: str(a.automation && a.automation.text, 3000),
      },
      barriers: {
        usesClaudeActively: !!(a.barriers && a.barriers.usesClaudeActively),
        options: strList(a.barriers && a.barriers.options, 20),
        other: str(a.barriers && a.barriers.other, 1000),
      },
      knowledgeGaps: {
        topics: strList(a.knowledgeGaps && a.knowledgeGaps.topics, 20),
        other: str(a.knowledgeGaps && a.knowledgeGaps.other, 1000),
      },
      anythingElse: str(a.anythingElse, 3000),
    },
  };
}

function renderMarkdown(r) {
  const a = r.answers;
  const or = (s) => s || '_(no answer)_';
  const joinParts = (...parts) => parts.filter(Boolean).join('\n\n');
  const L = [
    `**Name:** ${r.name}`,
    `**Region:** ${r.region || '—'}`,
    `**Portfolio:** ${a.portfolio || '—'}`,
    `**Minutes:** ${r.minutes ?? '—'}`,
    '',
    '### 1. Day-to-day (Claude result)',
    or(a.dayToDayResult),
    '',
    '### 2. Biggest time sinks',
    a.timeSinks.length
      ? a.timeSinks.map((t, i) => `${i + 1}. ${t.task}${t.hrsPerWeek ? ` (~${t.hrsPerWeek} h/wk)` : ''}`).join('\n')
      : '_(no answer)_',
    a.timeSinkCategories.length ? `\nCategories: ${a.timeSinkCategories.join(', ')}` : '',
    '',
    '### 3. Proactive work',
    or(joinParts(a.proactiveWork.ideas.join(', '), a.proactiveWork.text)),
    '',
    '### 4. Automation opportunities',
    or(joinParts(a.automation.ideas.join(', '), a.automation.text)),
    '',
    '### 5. Barriers to using Claude',
    a.barriers.usesClaudeActively
      ? 'Uses Claude actively (skipped)'
      : or(joinParts(a.barriers.options.filter((o) => o !== 'Other').join(', '), a.barriers.other && `Other: ${a.barriers.other}`)),
    '',
    '### 6. Knowledge gaps',
    or(joinParts(a.knowledgeGaps.topics.join(', '), a.knowledgeGaps.other)),
    '',
    '### 7. Anything else',
    or(a.anythingElse),
  ];
  return L.join('\n');
}
