// Playwright globalSetup: pin QA_RUN_ID for the entire QA run.
//
// Each playwright project (serik / boris / auditor) starts a fresh worker
// process. Without a shared run id every project would generate its own,
// and Auditor would read a different state file than the one Serik/Boris
// wrote. We persist a tiny pointer file so qaConfig can pick it up on import.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const POINTER_FILE = path.resolve(__dirname, '..', 'reports', '_active-run-id.txt');

module.exports = async function globalSetup() {
  fs.mkdirSync(path.dirname(POINTER_FILE), { recursive: true });
  const id = process.env.QA_RUN_ID
    || `r${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
  fs.writeFileSync(POINTER_FILE, id);
  process.env.QA_RUN_ID = id;
  console.log(`[qa] active run id: ${id}`);
};
