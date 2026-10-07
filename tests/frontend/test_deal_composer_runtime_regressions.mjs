import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeComposerHeight, reconcileChatMessages } from '../../src/utils/chatMessageListState.js';

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

test('real loadMessages polling reconciles an incoming message without touching the focused draft or over-scrolling', async () => {
  const firstMessages = [{
    id: 1, sender_id: 'other-user', text: 'existing', created_at: '2026-10-07T10:00:00Z', is_read: true,
  }];
  const withIncoming = [...firstMessages, {
    id: 2, sender_id: 'other-user', text: 'incoming during draft', created_at: '2026-10-07T10:01:00Z', is_read: false,
  }];
  const withAnotherIncoming = [...withIncoming, {
    id: 3, sender_id: 'other-user', text: 'incoming while reading history', created_at: '2026-10-07T10:02:00Z', is_read: false,
  }];
  const responses = [firstMessages, firstMessages, withIncoming, withIncoming, withAnotherIncoming];
  let apiCalls = 0;
  let currentMessages = [];
  let autoscrolls = 0;
  let intervalCallback;
  let intervalDelay;
  let appStateCallback;
  let intervalCleared = false;
  let appStateListenerRemoved = false;
  let lastHistoryState = null;
  const state = { draft: '', height: 88, inputInstance: { id: 'focused-input' } };
  const inputValueRef = { current: '' };
  const chatAPI = {
    typing() {},
    async messages(roomId) {
      assert.equal(roomId, 'room-actual');
      apiCalls += 1;
      return { messages: responses.shift() };
    },
    async listAttachments() { return { attachments: [] }; },
  };

  const inputChange = blockAfter('onChangeText={(value) => {', source.indexOf('ref={inputRef}'));
  new Function('value', 'inputValueRef', 'setInput', 'roomId', 'chatAPI', inputChange)(
    'draft typed during polling', inputValueRef, (value) => { state.draft = value; }, 'room-actual', chatAPI,
  );
  assert.equal(inputValueRef.current, state.draft);

  const loadMarker = 'const loadMessages = React.useCallback(async () => {';
  const loadBody = blockAfter(loadMarker);
  const context = {
    roomId: 'room-actual',
    historyRequestRef: { current: null },
    voiceText: { hydrate() {} },
    chatAPI,
    mounted: { current: true },
    voiceStateRef: { current: null },
    session: { user: { id: 'me' } },
    resolveAttachment: (value) => value,
    attachmentUrlCache: { current: new Map() },
    lang: 'ru',
    localizeSystemMessage: (value) => value,
    fmtMessageTime: (value) => value,
    voiceScope: 'deal:room-actual',
    reconcileChatMessages,
    documentKindFromFile() { throw new Error('no documents expected in this fixture'); },
    setMessages(updater) { currentMessages = updater(currentMessages); },
    userScrolledAwayRef: { current: false },
    nearBottomRef: { current: true },
    pendingAutoScrollRef: { current: false },
    initialMessagesLoadedRef: { current: false },
    setShowJumpLatest() {},
    scheduleAutoScrollRef: { current() { autoscrolls += 1; } },
    setUnreadCount() {},
    notifyChatRead() {},
    refreshAppIconBadge() {},
    setHistoryState(value) { lastHistoryState = value; },
  };
  context.voiceStateRef.current = context.voiceText;
  const loadMessages = new Function('ctx', `
    const {
      roomId, historyRequestRef, voiceText, chatAPI, mounted, voiceStateRef, session,
      resolveAttachment, attachmentUrlCache, lang, localizeSystemMessage, fmtMessageTime,
      voiceScope, reconcileChatMessages, documentKindFromFile, setMessages, userScrolledAwayRef, nearBottomRef,
      pendingAutoScrollRef,
      initialMessagesLoadedRef, setShowJumpLatest, scheduleAutoScrollRef, setUnreadCount,
      notifyChatRead, refreshAppIconBadge, setHistoryState,
    } = ctx;
    return async function loadMessages() { ${loadBody} };
  `)(context);

  const effectTarget = source.indexOf('const timer = setInterval(loadMessages, 3000)');
  const effectStart = source.lastIndexOf('React.useEffect(() => {', effectTarget);
  const effectBody = blockAfter('React.useEffect(() => {', effectStart);
  const AppState = { addEventListener(name, callback) {
    assert.equal(name, 'change');
    appStateCallback = callback;
    return { remove() { appStateListenerRemoved = true; } };
  } };
  const cleanup = new Function(
    'roomId', 'loadMessages', 'setInterval', 'clearInterval', 'AppState', effectBody,
  )('room-actual', loadMessages, (callback, delay) => {
    intervalCallback = callback;
    intervalDelay = delay;
    return 'poll-timer';
  }, (timer) => { intervalCleared = timer === 'poll-timer'; }, AppState);
  const flushLoad = () => new Promise((resolve) => setImmediate(resolve));

  await flushLoad();
  assert.equal(apiCalls, 1, 'the actual effect performs the initial real loadMessages call');
  assert.equal(lastHistoryState?.status, 'ready', 'the real loadMessages call completes successfully');
  assert.equal(currentMessages.length, 1);
  assert.equal(autoscrolls, 1, 'initial load performs exactly one anchoring scroll');
  assert.equal(intervalDelay, 3000);

  intervalCallback();
  await flushLoad();
  assert.equal(apiCalls, 2, 'first 3s timer invokes the real loadMessages function again');
  assert.equal(autoscrolls, 1, 'unchanged polling does not schedule another scroll');

  appStateCallback('background');
  await flushLoad();
  assert.equal(apiCalls, 2, 'background transition does not start another history request');
  appStateCallback('active');
  await flushLoad();
  assert.equal(apiCalls, 3, 'foreground refresh calls real loadMessages while the draft is active');
  assert.equal(currentMessages.length, 2, 'new server message is reconciled into the real message state');
  assert.equal(context.pendingAutoScrollRef.current, true,
    'new incoming message marks one pending scroll for the next list layout');
  assert.equal(context.userScrolledAwayRef.current, false);
  assert.equal(context.nearBottomRef.current, true);

  const listStart = source.indexOf('<FlatList');
  const listBody = blockAfter('onContentSizeChange={() => {', listStart);
  new Function(
    'pendingAutoScrollRef', 'userScrolledAwayRef', 'nearBottomRef', 'scheduleAutoScrollRef', listBody,
  )(context.pendingAutoScrollRef, context.userScrolledAwayRef, context.nearBottomRef, context.scheduleAutoScrollRef);
  assert.equal(context.pendingAutoScrollRef.current, false);
  assert.equal(autoscrolls, 2, 'one incoming message is followed by one list-layout scroll');

  context.userScrolledAwayRef.current = true;
  context.nearBottomRef.current = false;
  intervalCallback();
  await flushLoad();
  assert.equal(apiCalls, 4);
  assert.equal(currentMessages.length, 2);
  assert.equal(autoscrolls, 2, 'repeat poll while reading history does not yank the list');
  intervalCallback();
  await flushLoad();
  assert.equal(apiCalls, 5);
  assert.equal(currentMessages.length, 3, 'the later incoming message is still loaded');
  assert.equal(context.pendingAutoScrollRef.current, false);
  assert.equal(autoscrolls, 2, 'incoming message while scrolled away does not trigger extra autoscroll');

  assert.equal(state.draft, 'draft typed during polling');
  assert.equal(inputValueRef.current, state.draft);
  assert.equal(state.height, 88);
  assert.equal(state.inputInstance.id, 'focused-input', 'polling keeps the focused input instance stable');
  cleanup();
  assert.equal(intervalCleared, true);
  assert.equal(appStateListenerRemoved, true);
});
