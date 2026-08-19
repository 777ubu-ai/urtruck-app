import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const chatApi = read('src/utils/chatAPI.js');
assert.match(chatApi, /Platform\.OS === 'web'/, 'attachment upload must split web/native paths');
assert.match(chatApi, /form\.append\('file', \{\s*uri,\s*name,\s*type: requestedType \|\| 'application\/octet-stream',?\s*\}\)/, 'native upload must use RN multipart descriptor with a real MIME fallback');

const picker = read('src/components/LocationPickerModal.js');
assert.match(picker, /stopPropagation/, 'favourite heart must not select its parent location row');
assert.doesNotMatch(picker, /isFav \? '#F87171'/, 'selected favourite must not use the old red colour');

const detail = read('src/screens/DriverDetail.js');
assert.doesNotMatch(detail, /isFav \? '#EF4444'/, 'driver favourite must use the green role accent');

const app = read('App.js');
assert.match(app, /state === 'active'\) refreshPushBinding/, 'push token must be rebound on foreground');

const dealRoom = read('backend/api/deal_room.py');
assert.match(dealRoom, /"type": "chat_attachment"/, 'attachment must notify the other chat participant');

console.log('Release polish contracts: OK');
