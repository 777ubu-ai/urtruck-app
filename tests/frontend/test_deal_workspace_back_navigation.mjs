/**
 * P1 2026-09-02 — Regression test: deal workspace Back navigation.
 *
 * Physically reproduced on Xiaomi: Deals → deal room → Map → Back → Status →
 * Back — opened a DIFFERENT room with old dark-green chat UI, then Back went
 * to Android Developer Settings.
 *
 * Root cause: DealWorkspaceScreenV2 had no BackHandler interception for the
 * Android hardware back button. When viewMode === VIEW_MAP (a conditional
 * render, NOT a Modal), pressing back fired navigation.goBack() which popped
 * the entire Chat screen.
 *
 * This test verifies source-level invariants:
 *   1. BackHandler is imported
 *   2. hardwareBackPress listener exists and checks viewMode before goBack
 *   3. Map/Status are internal state (setViewMode / setStatusModalOpen), not
 *      navigation.push/navigate
 *   4. dealId and roomId are pinned at component mount from route params, not
 *      re-resolved on every overlay toggle
 *   5. closeMap uses setViewMode(VIEW_CHAT), not navigation.goBack()
 *   6. No navigate('Chat') with a different dealId inside the workspace
 *
 * Run: node --experimental-loader ./tests/frontend/loader.mjs tests/frontend/test_deal_workspace_back_navigation.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SRC_FILE = path.join(ROOT, 'src/screens/DealWorkspaceScreenV2.js');
const src = fs.readFileSync(SRC_FILE, 'utf-8');

let passed = 0;
let failed = 0;
function expect(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ FAIL: ${msg}`); failed++; }
}

console.log('\n=== 1. BackHandler imported from react-native ===');
expect(
  /import\s[\s\S]*?BackHandler[\s\S]*?from\s+['"]react-native['"]/.test(src),
  'BackHandler is imported from react-native',
);

console.log('\n=== 2. hardwareBackPress listener checks viewMode ===');
expect(
  src.includes("'hardwareBackPress'") || src.includes('"hardwareBackPress"'),
  "hardwareBackPress event listener is registered",
);
expect(
  /viewMode\s*===\s*VIEW_MAP/.test(src) && /setViewMode\s*\(\s*VIEW_CHAT\s*\)/.test(src),
  'BackHandler checks viewMode === VIEW_MAP and calls setViewMode(VIEW_CHAT)',
);

console.log('\n=== 3. Map is internal state, not navigation ===');
{
  // openMap must use setViewMode, not navigation.push/navigate
  const openMapMatch = src.match(/const openMap\s*=\s*\([^)]*\)\s*=>\s*\{([^}]+)\}/);
  const openMapBody = openMapMatch ? openMapMatch[1] : '';
  expect(
    openMapBody.includes('setViewMode') && !openMapBody.includes('navigation.'),
    'openMap() uses setViewMode, not navigation',
  );

  // closeMap must use setViewMode, not navigation.goBack
  const closeMapMatch = src.match(/const closeMap\s*=\s*\([^)]*\)\s*=>\s*([^;]+)/);
  const closeMapBody = closeMapMatch ? closeMapMatch[1] : '';
  expect(
    closeMapBody.includes('VIEW_CHAT') && !closeMapBody.includes('goBack'),
    'closeMap() sets VIEW_CHAT, does not call goBack()',
  );
}

console.log('\n=== 4. Status is a Modal, not navigation push ===');
expect(
  /Modal\s[^>]*visible\s*=\s*\{[^}]*statusModalOpen/.test(src),
  'Status panel is rendered as a <Modal> controlled by statusModalOpen state',
);
expect(
  src.includes('setStatusModalOpen(true)') && src.includes('setStatusModalOpen(false)'),
  'Status open/close use local state setStatusModalOpen',
);

console.log('\n=== 5. dealId/roomId are pinned from route params ===');
{
  // The useState initializers must read from params, not from a separate resolve
  expect(
    /useState\s*\(\s*params\.dealId\b/.test(src),
    'dealId is initialized from params.dealId (pinned at mount)',
  );
  expect(
    /useState\s*\(\s*params\.roomId\b/.test(src),
    'roomId is initialized from params.roomId (pinned at mount)',
  );
}

console.log('\n=== 6. No navigate("Chat") inside the workspace ===');
{
  // DealWorkspaceScreenV2 must never call navigation.navigate('Chat')
  // because that would replace the current room with a different one
  const chatNavigateCalls = [...src.matchAll(/navigation\.(navigate|push)\s*\(\s*['"]Chat['"]/g)];
  expect(
    chatNavigateCalls.length === 0,
    `No navigation.navigate('Chat') inside workspace (found ${chatNavigateCalls.length})`,
  );
}

console.log('\n=== 7. BackHandler closes attach and emoji overlays ===');
{
  // Find the entire useEffect block containing BackHandler — the handler
  // function is defined ABOVE the addEventListener call, so we search
  // backwards from it for the useEffect opening.
  const bh = src.indexOf("BackHandler.addEventListener('hardwareBackPress'");
  const effStart = bh >= 0 ? src.lastIndexOf('React.useEffect(', bh) : -1;
  const effEnd = bh >= 0 ? src.indexOf(']);', bh) : -1;
  const block = effStart >= 0 && effEnd >= 0 ? src.slice(effStart, effEnd) : '';
  expect(
    block.includes('attachOpen') && block.includes('setAttachOpen(false)'),
    'BackHandler closes attachOpen before falling through',
  );
  expect(
    block.includes('emojiOpen') && block.includes('setEmojiOpen(false)'),
    'BackHandler closes emojiOpen before falling through',
  );
}

console.log('\n=== 8. Only one goBack() call — the header back button ===');
{
  // navigation.goBack() should appear only in the header back button,
  // not in map/status/overlay close logic
  const goBackCalls = [...src.matchAll(/navigation\.goBack\s*\(\s*\)/g)];
  expect(
    goBackCalls.length === 1,
    `Exactly 1 navigation.goBack() in the file (header back button), found ${goBackCalls.length}`,
  );
}

console.log('\n=== 9. Back during recording → voice.stopRecording(), not voice.stop() ===');
{
  // The BackHandler must call voice.stopRecording (recording session cleanup),
  // NOT voice.stop (playback cleanup) when recording is active.
  const bh = src.indexOf("BackHandler.addEventListener('hardwareBackPress'");
  const effStart = bh >= 0 ? src.lastIndexOf('React.useEffect(', bh) : -1;
  const effEnd = bh >= 0 ? src.indexOf(']);', bh) : -1;
  const block = effStart >= 0 && effEnd >= 0 ? src.slice(effStart, effEnd) : '';
  expect(
    block.includes('recording') && block.includes('voice.stopRecording'),
    'BackHandler calls voice.stopRecording() when recording is active',
  );
  // Must NOT call voice.stop() (playback) in the recording branch
  const recordingBranch = block.match(/if\s*\(\s*recording\s*\)\s*\{([^}]+)\}/);
  const branchBody = recordingBranch ? recordingBranch[1] : '';
  expect(
    branchBody.includes('stopRecording') && !branchBody.includes('voice.stop()'),
    'Recording branch uses stopRecording, not playback stop()',
  );
}

console.log('\n=== 10. Unmount during recording → voice.stopRecording() ===');
{
  // The mount/unmount useEffect must call both:
  //   voice.stopRecording() — for an active recording session
  //   voice.stop() — for active playback
  const mountEffect = src.match(/React\.useEffect\(\(\)\s*=>\s*\{\s*mounted\.current\s*=\s*true;[\s\S]*?\},\s*\[\s*\]\)/);
  const mountBlock = mountEffect ? mountEffect[0] : '';
  expect(
    mountBlock.includes('voice.stopRecording'),
    'Unmount cleanup calls voice.stopRecording() for active recording',
  );
  expect(
    mountBlock.includes('voice.stop'),
    'Unmount cleanup calls voice.stop() for active playback',
  );
  // Both must be present — recording and playback are independent cleanup
  const hasStopRecording = (mountBlock.match(/voice\.stopRecording/g) || []).length;
  const hasStop = (mountBlock.match(/voice\.stop[^R]/g) || []).length;
  expect(
    hasStopRecording >= 1 && hasStop >= 1,
    `Unmount has both stopRecording (${hasStopRecording}) and stop (${hasStop}) calls`,
  );
}

console.log('\n=== 11. Playback cleanup not broken — voice.stop() still in module ===');
{
  const voiceSrc = fs.readFileSync(path.join(ROOT, 'src/utils/voiceRecorder.js'), 'utf-8');
  // voice.stop() must be an async method that stops playback
  expect(
    /async\s+stop\s*\(\s*\)/.test(voiceSrc),
    'voiceRecorder exports async stop() for playback cleanup',
  );
  // voice.stopRecording() must be an async method that stops recording
  expect(
    /async\s+stopRecording\s*\(\s*\)/.test(voiceSrc),
    'voiceRecorder exports async stopRecording() for recording cleanup',
  );
  // stop() must NOT touch _recording — it's playback only
  const stopBody = voiceSrc.match(/async\s+stop\s*\(\s*\)\s*\{([\s\S]*?)\n\s{2}\}/);
  const stopCode = stopBody ? stopBody[1] : '';
  expect(
    !stopCode.includes('_recording'),
    'voice.stop() does not touch _recording (playback only)',
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
