import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeComposerHeight } from '../../src/utils/chatMessageListState.js';

const source = readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
const MIN = 44;
const MAX = 104;
const PADDING = 8;

function blockAfter(marker, from = 0) {
  const markerIndex = source.indexOf(marker, from);
  assert.ok(markerIndex >= 0, `source block not found: ${marker}`);
  const open = source.indexOf('{', markerIndex + marker.length - 1);
  assert.ok(open >= markerIndex, `opening brace not found: ${marker}`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, i);
  }
  assert.fail(`unterminated source block: ${marker}`);
}

function createHeightSetter(initial = MIN) {
  const inputHeightRef = { current: initial };
  const state = { height: initial, updates: 0 };
  const body = blockAfter('const setComposerHeight = React.useCallback((value) => {');
  const setInputHeight = (height) => { state.height = height; state.updates += 1; };
  const setter = new Function(
    'value', 'inputHeightRef', 'setInputHeight',
    'COMPOSER_INPUT_MIN_HEIGHT', 'COMPOSER_INPUT_MAX_HEIGHT', body,
  );
  return {
    state,
    set: (value) => setter(value, inputHeightRef, setInputHeight, MIN, MAX),
  };
}

function createContentSizeHandler(inputValueRef, setComposerHeight) {
  const marker = 'onContentSizeChange={(event) => {';
  const body = blockAfter(marker, source.indexOf('ref={inputRef}'));
  return new Function(
    'inputValueRef', 'setComposerHeight', 'normalizeComposerHeight',
    'COMPOSER_INPUT_MIN_HEIGHT', 'COMPOSER_INPUT_MAX_HEIGHT', 'COMPOSER_INPUT_VERTICAL_PADDING',
    `return (event) => { ${body} };`,
  )(inputValueRef, setComposerHeight, normalizeComposerHeight, MIN, MAX, PADDING);
}

test('real TextInput content callback grows through four lines, caps long text and resets on delete', () => {
  const inputValueRef = { current: 'hello' };
  const h = createHeightSetter();
  const invoke = createContentSizeHandler(inputValueRef, h.set);
  const measure = (text, nativeHeight) => {
    inputValueRef.current = text;
    invoke({ nativeEvent: { contentSize: { height: nativeHeight } } });
  };

  measure('one line', 20);
  assert.equal(h.state.height, 44);
  measure('two\nlines', 40);
  assert.equal(h.state.height, 48);
  measure('one\ntwo\nthree\nfour', 80);
  assert.equal(h.state.height, 88);
  measure('long pasted text '.repeat(100), 260);
  assert.equal(h.state.height, MAX);
  assert.match(source, /scrollEnabled=\{inputHeight >= COMPOSER_INPUT_MAX_HEIGHT\}/);
  assert.equal(h.state.height >= MAX, true, 'long text enables the native input’s internal scroll');

  measure('', 260);
  assert.equal(h.state.height, MIN, 'deleting to empty returns to compact height');
});

test('invalid measurements and duplicate measurements preserve the last valid height', () => {
  const inputValueRef = { current: 'draft' };
  const h = createHeightSetter();
  const invoke = createContentSizeHandler(inputValueRef, h.set);
  inputValueRef.current = 'four lines';
  invoke({ nativeEvent: { contentSize: { height: 80 } } });
  assert.equal(h.state.height, 88);
  const updates = h.state.updates;

  for (const event of [null, undefined, {}, { nativeEvent: null }, { nativeEvent: {} },
    { nativeEvent: { contentSize: null } },
    { nativeEvent: { contentSize: { height: NaN } } },
    { nativeEvent: { contentSize: { height: -1 } } }]) {
    assert.doesNotThrow(() => invoke(event));
    assert.equal(h.state.height, 88);
  }
  invoke({ nativeEvent: { contentSize: { height: 80 } } });
  assert.equal(h.state.height, 88);
  assert.equal(h.state.updates, updates, 'same effective height does not rerender the composer');
});

test('keyboard show/hide callbacks update dock state and remove listeners on unmount', () => {
  const effectStart = source.lastIndexOf('React.useEffect(() => {', source.indexOf('const showEvent = Platform.OS'));
  assert.ok(effectStart >= 0);
  const body = blockAfter('React.useEffect(() => {', effectStart);
  for (const [os, showName, hideName] of [
    ['ios', 'keyboardWillShow', 'keyboardWillHide'],
    ['android', 'keyboardDidShow', 'keyboardDidHide'],
  ]) {
    const events = new Map();
    let visible = false;
    const Keyboard = { addListener(name, callback) {
      events.set(name, callback);
      return { remove() { events.delete(name); } };
    } };
    const cleanup = new Function('Platform', 'Keyboard', 'setKeyboardVisible', body)(
      { OS: os }, Keyboard, (value) => { visible = value; },
    );
    events.get(showName)();
    assert.equal(visible, true, `${os} show event opens keyboard dock state`);
    events.get(hideName)();
    assert.equal(visible, false, `${os} hide event closes keyboard dock state`);
    cleanup();
    assert.equal(events.size, 0, `${os} listeners are removed with the screen`);
  }
});

test('FlatList content measurement consumes one pending latest-message scroll only at the bottom', () => {
  const listStart = source.indexOf('<FlatList');
  const body = blockAfter('onContentSizeChange={() => {', listStart);
  let scrolls = 0;
  const pendingAutoScrollRef = { current: true };
  const userScrolledAwayRef = { current: false };
  const nearBottomRef = { current: true };
  const scheduleAutoScrollRef = { current: () => { scrolls += 1; } };
  const invoke = new Function(
    'pendingAutoScrollRef', 'userScrolledAwayRef', 'nearBottomRef', 'scheduleAutoScrollRef', body,
  );

  invoke(pendingAutoScrollRef, userScrolledAwayRef, nearBottomRef, scheduleAutoScrollRef);
  assert.equal(scrolls, 1);
  assert.equal(pendingAutoScrollRef.current, false);
  invoke(pendingAutoScrollRef, userScrolledAwayRef, nearBottomRef, scheduleAutoScrollRef);
  assert.equal(scrolls, 1, 'same layout pass cannot scroll repeatedly');

  pendingAutoScrollRef.current = true;
  userScrolledAwayRef.current = true;
  nearBottomRef.current = false;
  invoke(pendingAutoScrollRef, userScrolledAwayRef, nearBottomRef, scheduleAutoScrollRef);
  assert.equal(scrolls, 1, 'polling while reading history does not pull the list to latest');
  assert.equal(pendingAutoScrollRef.current, true, 'the pending scroll waits until bottom is restored');
});

test('polling leaves the draft and measured composer state untouched; focus keeps send control wired', () => {
  const loadStart = source.indexOf('const loadMessages = React.useCallback(async () => {');
  const loadBody = blockAfter('const loadMessages = React.useCallback(async () => {', loadStart);
  assert.doesNotMatch(loadBody, /setInput\(|inputValueRef\.current\s*=/,
    'polling must not rewrite the active draft');
  assert.match(source, /<TextInput[\s\S]*?value=\{input\}[\s\S]*?onFocus=\{onComposerFocus\}/);
  const sendButton = source.slice(source.indexOf('testID="deal-chat-send"') - 250, source.indexOf('testID="deal-chat-send"') + 500);
  assert.match(sendButton, /onPress=\{sendText\}/);
  assert.doesNotMatch(source, /<TextInput[\s\S]{0,600}key=/,
    'polling must not remount the focused native input');

  const focusBody = blockAfter('const onComposerFocus = React.useCallback(() => {');
  const overlayState = { attach: true, call: true, emoji: true };
  new Function('setAttachOpen', 'setCallMenuOpen', 'setEmojiOpen', focusBody)(
    (value) => { overlayState.attach = value; },
    (value) => { overlayState.call = value; },
    (value) => { overlayState.emoji = value; },
  );
  assert.deepEqual(overlayState, { attach: false, call: false, emoji: false });
  assert.match(source, /blurOnSubmit=\{false\}/, 'focus remains on the multiline input while adding rows');
});

test('real text change and 3s/foreground polling preserve the active draft and height', async () => {
  const inputValueRef = { current: '' };
  const draft = { value: '', height: 88, inputInstance: 'focused-input' };
  const chatAPI = { typing: () => {} };
  const changeBody = blockAfter('onChangeText={(value) => {', source.indexOf('ref={inputRef}'));
  const onChangeText = new Function('value', 'inputValueRef', 'setInput', 'roomId', 'chatAPI', changeBody);
  onChangeText('draft with four lines', inputValueRef, (value) => { draft.value = value; }, 'room', chatAPI);
  assert.equal(draft.value, 'draft with four lines');
  assert.equal(inputValueRef.current, draft.value);

  const effectTarget = source.indexOf('const timer = setInterval(loadMessages, 3000)');
  const effectStart = source.lastIndexOf('React.useEffect(() => {', effectTarget);
  assert.ok(effectStart >= 0, 'message polling effect exists');
  const effectBody = blockAfter('React.useEffect(() => {', effectStart);
  let polls = 0;
  let intervalCallback;
  let intervalMs;
  let intervalCleared = false;
  let appStateCallback;
  let listenerRemoved = false;
  const AppState = { addEventListener(name, callback) {
    assert.equal(name, 'change');
    appStateCallback = callback;
    return { remove() { listenerRemoved = true; } };
  } };
  const cleanup = new Function(
    'roomId', 'loadMessages', 'setInterval', 'clearInterval', 'AppState', effectBody,
  )('room-1', () => { polls += 1; }, (callback, ms) => {
    intervalCallback = callback;
    intervalMs = ms;
    return 'timer-1';
  }, (timer) => { intervalCleared = timer === 'timer-1'; }, AppState);

  assert.equal(polls, 1, 'opening the room loads messages immediately');
  assert.equal(intervalMs, 3000);
  intervalCallback();
  appStateCallback('background');
  assert.equal(polls, 2, 'background does not start another poll');
  appStateCallback('active');
  assert.equal(polls, 3, 'foreground return refreshes messages');
  assert.deepEqual(draft, { value: 'draft with four lines', height: 88, inputInstance: 'focused-input' });
  assert.equal(inputValueRef.current, 'draft with four lines');
  cleanup();
  assert.equal(intervalCleared, true);
  assert.equal(listenerRemoved, true);
});
