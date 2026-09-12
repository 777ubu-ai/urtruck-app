const fs = require('fs');
const path = require('path');

const reportsDir = path.resolve(__dirname, '..', 'qa', 'reports');
const candidates = fs.readdirSync(reportsDir)
  .filter((name) => /^qa-report-.*\.json$/.test(name))
  .map((name) => ({ name, mtime: fs.statSync(path.join(reportsDir, name)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

if (!candidates.length) {
  console.error('[qa-gate] no machine-readable qa-report JSON found');
  process.exit(2);
}

const reportPath = path.join(reportsDir, candidates[0].name);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const counts = report.counts || {};
const p0 = Number(counts.P0 || 0);
const p1 = Number(counts.P1 || 0);

console.log(`[qa-gate] report=${reportPath} P0=${p0} P1=${p1}`);
if (p0 > 0 || p1 > 0) {
  console.error('[qa-gate] blocking release: report contains P0/P1 findings');
  process.exit(1);
}
