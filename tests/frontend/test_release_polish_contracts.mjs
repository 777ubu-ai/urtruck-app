import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const chatApi = read('src/utils/chatAPI.js');
const nativeAttachmentStaging = read('src/utils/nativeAttachmentStaging.js');
assert.match(chatApi, /Platform\.OS === 'web'/, 'attachment upload must split web/native paths');
assert.match(chatApi, /import \{[^}]*File as ExpoFile[^}]*\} from 'expo-file-system'/, 'native upload must use Expo File/Blob on Expo 57');
assert.match(chatApi, /withNativeUploadFile\(form, uri, name, send, \{/, 'native document upload must use the filename-preserving staging path');
assert.match(nativeAttachmentStaging, /const staged = new File\(uploadDirectory, safeNativeUploadName\(name\)\)/, 'native upload must stage bytes under the original safe filename');
assert.match(nativeAttachmentStaging, /form\.append\('file', staged, staged\.name\)/, 'native multipart must append the staged Expo file with its preserved filename');
assert.match(nativeAttachmentStaging, /finally \{\s*try \{ uploadDirectory\.delete\(\); \} catch \{\}\s*\}/, 'native staging must be deleted after success or failure');
assert.doesNotMatch(chatApi, /form\.append\('file', \{\s*uri,\s*name,\s*type:/, 'legacy RN descriptors are rejected by Expo 57');

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
