import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeLiveFeed, externalTelegramPost } from '../../src/utils/externalFreightModel.js';
const item = (id, date) => ({ id, status: 'active', source_published_at: date });
test('live head updates preserve old tail, deduplicate and expire cards', () => {
 const old = item('a', '2026-10-22T10:00:00Z');
 const tail = item('b', '2026-10-21T10:00:00Z');
 const next = item('new', '2026-10-22T11:00:00Z');
 const result = mergeLiveFeed([old, tail, {...tail, id:'expired', expires_at:'2020-01-01'}], [next,{...old,amount:1500}]);
 assert.deepEqual(result.map(x=>x.id),['new','a','b']);
 assert.equal(result[1].amount,1500);
});
test('empty head clears closed/expired and never changes filters', () => {
 assert.deepEqual(mergeLiveFeed([item('a','2026-10-22')],[]),[]);
});
test('post link opens only our exact Telegram receivers and numeric message', () => {
 assert.equal(externalTelegramPost({origin_source:'@UrTruck_obyavleniya',source_message_id:123}),'https://t.me/UrTruck_obyavleniya/123');
 assert.equal(externalTelegramPost({origin_source:'UrTruck_UT',source_message_id:123}),'https://t.me/UrTruck_UT/123');
 assert.equal(externalTelegramPost({origin_source:'valid_channel',source_message_id:123}),null);
 assert.equal(externalTelegramPost({origin_source:'UrTruck_obyavleniya_evil',source_message_id:123}),null);
 assert.equal(externalTelegramPost({origin_source:'https://evil.test',source_message_id:123}),null);
 assert.equal(externalTelegramPost({origin_source:'valid_channel',source_message_id:'bad'}),null);
});
