const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MAESTRO = path.resolve(process.env.MAESTRO_ROOT || path.join(ROOT, 'qa', 'maestro'));
const ENTRY = path.join(MAESTRO, 'smoke-suite.yaml');
const forbidden = [
  'bottom-nav-chats',
  'bottom-nav-chats-badge',
  'bottom-nav-profile',
  'bottom-nav-publish',
  'my-work-tab-searching',
  'my-work-tab-enroute',
  'my-work-tab-delivered',
  'my-work-tab-offers',
  'my-work-tab-offers-client',
  'my-order-card',
  'bid-chat',
  'deal-order-chat',
  'chats-menu-btn',
  'deal-action-mark-at-border',
  'deals-seg-chats',
  'chats-header',
  'deal-room-list-card',
  'deal-room-filter-active',
  'deal-room-list-unread',
  'chat-input',
  'chat-send-btn',
  'chat-voice-btn',
  'chat-attach-btn',
  'chat-attach-panel',
  'chat-attach-price',
  'chat-deal-banner',
  'chat-partner-name',
  'deal-track-truck',
  'deal-map-card-open',
  'deal-call-btn',
  'track-message-driver',
];

const failures = [];
function listFlows(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFlows(absolute);
    return /\.ya?ml$/i.test(entry.name) ? [absolute] : [];
  });
}

function validateFlow(file) {
  const relative = path.relative(MAESTRO, file);
  const segments = relative.split(path.sep);
  if (segments.includes('_obsolete')) {
    failures.push(`obsolete Maestro flow remains tracked: ${relative}`);
  }

  const source = fs.readFileSync(file, 'utf8');
  for (const selector of forbidden) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const staleUse = new RegExp(`id:\\s*["']${escaped}["']`);
    if (staleUse.test(source)) failures.push(`${relative}: stale active selector ${selector}`);
  }

  const refs = [...source.matchAll(/runFlow:\s*([^\s#]+\.ya?ml)/g)].map((match) => match[1]);
  for (const ref of refs) {
    const resolved = path.resolve(path.dirname(file), ref);
    if (!fs.existsSync(resolved)) {
      failures.push(`${relative}: missing referenced flow ${ref}`);
    }
  }
}
if (!fs.existsSync(MAESTRO)) {
  failures.push(`missing Maestro root: ${MAESTRO}`);
} else {
  const flows = listFlows(MAESTRO);
  if (!fs.existsSync(ENTRY)) failures.push('missing release entry: smoke-suite.yaml');
  if (!flows.length) failures.push('no Maestro flows found');
  flows.forEach(validateFlow);
  if (!failures.length) {
    console.log(`[maestro-contract] OK: ${flows.length} flows, no obsolete paths or stale selectors`);
  }
}

if (failures.length) {
  console.error('[maestro-contract] FAIL');
  failures.forEach((item) => console.error(`  - ${item}`));
  process.exit(1);
}
