// In-memory report state shared across the QA spec files. The Auditor spec
// reads it last and writes both Markdown and JSON to qa/reports/. Each agent
// pushes structured entries; severity is one of "P0" | "P1" | "P2" | "info".

const fs = require('fs');
const path = require('path');
const { REPORTS_DIR, QA_RUN_ID, QA_TAG, BASE_URL, API_BASE, timestampSlug } = require('./qaConfig');

const STATE_FILE = path.join(REPORTS_DIR, `_state-${QA_RUN_ID}.json`);

// Persist between spec processes (each `playwright test` spec runs in the
// same node process when using --workers=1, but `--config` re-execs the
// runner per project, so use a file as the single source of truth).
function load() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {}
  return { runId: QA_RUN_ID, qaTag: QA_TAG, baseUrl: BASE_URL, apiBase: API_BASE,
    startedAt: new Date().toISOString(), entries: [], artefacts: {} };
}

function save(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function record(entry) {
  const state = load();
  state.entries.push({ at: new Date().toISOString(), ...entry });
  save(state);
}

function attach(actor, key, value) {
  const state = load();
  state.artefacts[actor] = state.artefacts[actor] || {};
  state.artefacts[actor][key] = value;
  save(state);
}

const log = {
  pass: (actor, step, detail) => record({ severity: 'pass',  actor, step, detail }),
  info: (actor, step, detail) => record({ severity: 'info',  actor, step, detail }),
  p2:   (actor, step, detail) => record({ severity: 'P2',    actor, step, detail }),
  p1:   (actor, step, detail) => record({ severity: 'P1',    actor, step, detail }),
  p0:   (actor, step, detail) => record({ severity: 'P0',    actor, step, detail }),
};

function summarise(state) {
  const counts = { pass: 0, info: 0, P2: 0, P1: 0, P0: 0 };
  for (const e of state.entries) counts[e.severity] = (counts[e.severity] || 0) + 1;
  return counts;
}

function suggestNextFix(state) {
  const p0 = state.entries.filter((e) => e.severity === 'P0');
  if (p0.length) return `Fix P0 first: ${p0.slice(0, 3).map((e) => `[${e.actor}] ${e.step}`).join('; ')}`;
  const p1 = state.entries.filter((e) => e.severity === 'P1');
  if (p1.length) return `Resolve P1 batch: ${p1.slice(0, 3).map((e) => `[${e.actor}] ${e.step}`).join('; ')}`;
  return 'No P0/P1 — pilot ready for next QA cycle.';
}

function writeReport() {
  const state = load();
  state.finishedAt = new Date().toISOString();
  state.counts = summarise(state);
  state.nextFix = suggestNextFix(state);
  save(state);

  const slug = timestampSlug();
  const md = renderMarkdown(state);
  const mdPath = path.join(REPORTS_DIR, `qa-report-${slug}.md`);
  const jsonPath = path.join(REPORTS_DIR, `qa-report-${slug}.json`);
  fs.writeFileSync(mdPath, md);
  fs.writeFileSync(jsonPath, JSON.stringify(state, null, 2));
  return { mdPath, jsonPath, state };
}

function renderMarkdown(state) {
  const c = state.counts || summarise(state);
  const bySeverity = (sev) => state.entries
    .filter((e) => e.severity === sev)
    .map((e) => `- **[${e.actor}]** ${e.step}${e.detail ? ` — ${e.detail}` : ''}`)
    .join('\n') || '_none_';
  const passed = state.entries
    .filter((e) => e.severity === 'pass')
    .map((e) => `- [${e.actor}] ${e.step}${e.detail ? ` — ${e.detail}` : ''}`)
    .join('\n') || '_none_';
  const screenshots = Object.entries(state.artefacts || {})
    .map(([actor, a]) => `### ${actor}\n${(a.screenshots || []).map((p) => `- ${p}`).join('\n') || '_none_'}`)
    .join('\n\n') || '_none collected_';
  const apiEvidence = Object.entries(state.artefacts || {})
    .filter(([, a]) => a.api)
    .map(([actor, a]) => `### ${actor}\n\`\`\`json\n${JSON.stringify(a.api, null, 2)}\n\`\`\``)
    .join('\n\n') || '_none collected_';

  return `# UrTruck QA report

**Run ID:** \`${state.runId}\`
**QA tag:** \`${state.qaTag}\`
**Started:** ${state.startedAt}
**Finished:** ${state.finishedAt}
**Environment:** ${state.baseUrl}
**API:** ${state.apiBase}
**Build/version:** ${(state.artefacts && state.artefacts.auditor && state.artefacts.auditor.version) || 'unknown'}

## Summary
- pass: **${c.pass}**
- info: ${c.info}
- P2: ${c.P2}
- P1: ${c.P1}
- **P0: ${c.P0}**

## Suggested next fix
${state.nextFix}

## P0 issues
${bySeverity('P0')}

## P1 issues
${bySeverity('P1')}

## P2 issues
${bySeverity('P2')}

## Passed checks
${passed}

## Screenshots
${screenshots}

## API evidence
${apiEvidence}
`;
}

module.exports = { log, attach, load, save, writeReport, STATE_FILE };
