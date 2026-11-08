import assert from 'node:assert/strict';
import shellQuote from 'shell-quote';
import test from 'node:test';

test('shell-quote rejects each line terminator after a comment token', () => {
  for (const lineTerminator of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(
      () => shellQuote.quote(['echo', 'ok', {comment: 'x'}, `a${lineTerminator}id;#`]),
      {name: 'TypeError', message: /must not contain line terminators/},
    );
  }
});
