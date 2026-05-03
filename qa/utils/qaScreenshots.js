// Screenshot helper. We name files {actor}-{NN}-{slug}.png inside a per-run
// subdir so the Auditor can list them in chronological order without parsing
// timestamps. Saving is best-effort: if the page is closed or the disk is
// full we don't want to abort the QA flow.

const fs = require('fs');
const path = require('path');
const { SCREENSHOTS_DIR, QA_RUN_ID } = require('./qaConfig');

function runDir() {
  const dir = path.join(SCREENSHOTS_DIR, QA_RUN_ID);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const counters = new Map();

function nextStep(actor) {
  const n = (counters.get(actor) || 0) + 1;
  counters.set(actor, n);
  return String(n).padStart(2, '0');
}

async function snap(page, actor, label) {
  if (!page) return null;
  const slug = String(label || 'step').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
  const file = path.join(runDir(), `${actor}-${nextStep(actor)}-${slug}.png`);
  try {
    await page.screenshot({ path: file, fullPage: true });
    return file;
  } catch (e) {
    return null;
  }
}

function listForRun() {
  const dir = runDir();
  return fs.readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => path.join(dir, f)).sort();
}

module.exports = { snap, runDir, listForRun };
