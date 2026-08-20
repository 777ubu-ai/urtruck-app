import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const chat = fs.readFileSync('backend/api/chat.py', 'utf8');

test('chat photo uploads persist with real image MIME and reject non-images', () => {
  assert.match(chat, /data\[:3\] == b"\\xff\\xd8\\xff"/);
  assert.match(chat, /data\[:8\] == b"\\x89PNG\\r\\n\\x1a\\n"/);
  assert.match(chat, /storage\.save_file\(data, "chat_photos", ext=ext, content_type=content_type\)/);
  assert.match(chat, /status_code=415, detail="Неподдерживаемый тип фото"/);
});

test('chat voice uploads are stored as audio files, not images', () => {
  assert.match(chat, /"webm": "audio\/webm"/);
  assert.match(chat, /"m4a": "audio\/mp4"/);
  assert.match(chat, /storage\.save_file\(data, "chat_voice", ext=ext, content_type=audio_mime\)/);
});
