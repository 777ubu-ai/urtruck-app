// Восстановленная singleTask Activity получает ссылку раньше готовности JS.
// Android сам не заменяет getIntent при onNewIntent: сохраняем его до делегата.
const handler = `  override fun onNewIntent(intent: Intent) {
    setIntent(intent)
    super.onNewIntent(intent)
  }
`;

function preservePendingIntent(contents) {
  const existing = /override fun onNewIntent\(intent: Intent\)\s*\{\s*setIntent\(intent\)\s*super\.onNewIntent\(intent\)\s*\}/;
  if (/override fun onNewIntent\b/.test(contents)) {
    if (existing.test(contents) && /import android\.content\.Intent\b/.test(contents)) return contents;
    throw new Error('Неизвестный onNewIntent: требуется проверка совместимости, код не изменён');
  }
  if (!contents.includes('  override fun onCreate(')) {
    throw new Error('Не найден Kotlin onCreate в MainActivity: код не изменён');
  }
  const imported = /import android\.content\.Intent\b/.test(contents)
    ? contents
    : contents.replace(/^(package [^\n]+\n)/m, '$1\nimport android.content.Intent\n');
  if (!/import android\.content\.Intent\b/.test(imported)) {
    throw new Error('Не удалось добавить Intent в MainActivity');
  }
  return imported.replace('  override fun onCreate(', `${handler}\n  override fun onCreate(`);
}

module.exports = function withAndroidPendingIntent(config) {
  const { withMainActivity } = require('@expo/config-plugins');
  return withMainActivity(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('MainActivity должен использовать Kotlin');
    mod.modResults.contents = preservePendingIntent(mod.modResults.contents);
    return mod;
  });
};
module.exports.preservePendingIntent = preservePendingIntent;
