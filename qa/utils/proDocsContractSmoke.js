import fs from 'node:fs';
import assert from 'node:assert/strict';
const pro = fs.readFileSync('src/utils/proDocs.js','utf8');
const reg = fs.readFileSync('src/utils/registration.js','utf8');
const api = fs.readFileSync('backend/api/profile.py','utf8');
assert.ok(/regAPI\.uploadProDoc/.test(pro), 'PRO docs must use authenticated backend');
assert.ok(/users\/me\/pro-documents/.test(reg), 'registration client must upload PRO docs to backend');
// Private-storage contract: profile.py must save PRO docs through the private
// storage service (save_file since the magic-bytes upload hardening; the old
// save_image name is accepted for history) and return only signed owner URLs.
assert.ok(/storage_service\.save_(image|file)/.test(api), 'backend must use private storage service');
assert.ok(/file_signing\.sign/.test(api), 'backend must return only signed owner URL');
assert.ok(!/getPublicUrl\(/.test(pro), 'PRO docs must not create public bucket URLs');
console.log('pro-docs contract OK: authenticated backend + private storage + signed URL');
