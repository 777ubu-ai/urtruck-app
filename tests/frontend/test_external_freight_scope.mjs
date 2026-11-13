import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const baseline = JSON.parse(readFileSync('tests/fixtures/external-freight-protected-baseline.json', 'utf8'));

// Исключения — явная кнопка, маршрут, отдельный API и одобренный первый показ Main.
function withoutFeedHooks(path, source) {
  if (path === 'src/navigation/AppNavigator.js') return source
    .replace("import withExternalFeedFirstVisit from '../components/externalFreight/withExternalFeedFirstVisit';\n", '')
    .replace("const FirstVisitMainTabs = withExternalFeedFirstVisit(MainTabs);\n\n", '')
    .replace('component={FirstVisitMainTabs}', 'component={MainTabs}')
    .replace("import ExternalFreightFeedScreen from '../screens/ExternalFreightFeedScreen';\n", '')
    .replace("import { EXTERNAL_FREIGHT_ENABLED } from '../utils/externalFreightFeed';\n", '')
    .replace(/^.*<Stack.Screen name="ExternalFreightFeed".*\n/m, '');
  if (['src/screens/CargoFeedScreen.js', 'src/screens/FeedScreen.js'].includes(path)) return source
    // Отдельная регрессия проверяет обновление при выборе нижней вкладки.
    .replace("  // При возврате на вкладку запрашиваем свежие объявления, не меняя возврат из карточки.\n  useEffect(() => navigation.addListener('tabPress', () => { load(); }), [navigation, load]);\n", '')
    .replace("import ExternalFreightEntry from '../components/externalFreight/ExternalFreightEntry';\n", '')
    .replace(/^      <ExternalFreightEntry[^\n]*\n/m, '')
    .replace(/^      <\/ExternalFreightEntry>\n/m, '')
    .replace(/^        <RootHeader/m, '      <RootHeader');
  if (path === 'backend/main.py') return source
    .replace('from api.external_freight import router as external_freight_router\n', '')
    .replace('app.include_router(external_freight_router, prefix="/api/v1/external-freight")\n', '')
    .replace('    from database.external_freight_dal import init_schema as init_external_freight_schema\n', '')
    .replace('    if os.getenv("EXTERNAL_FREIGHT_FEED_ENABLED", "false").strip().lower() in {"1", "true", "yes"}:\n        init_external_freight_schema()\n', '');
  return source;
}
const gpsPause = JSON.parse(readFileSync('tests/fixtures/gps-paused-approved-scope.json', 'utf8'));
const listing30d = JSON.parse(readFileSync('tests/fixtures/listing30d-approved-scope.json', 'utf8'));
const ownedHistory = JSON.parse(readFileSync('tests/fixtures/owned-history-approved-scope.json', 'utf8'));
const sessionRecovery = JSON.parse(readFileSync('tests/fixtures/session-recovery-approved-scope.json', 'utf8'));
const feedFreshness = JSON.parse(readFileSync('tests/fixtures/feed-freshness-approved-scope.json', 'utf8'));
const routeClarification = JSON.parse(readFileSync('tests/fixtures/route-country-clarification-approved-scope.json', 'utf8'));
for (const [path, expected] of Object.entries(baseline.sha256)) {
  test('сохранена согласованная реализация: ' + path, () => {
    const source = withoutFeedHooks(path, readFileSync(path, 'utf8'));
    assert.equal(createHash('sha256').update(source).digest('hex'), routeClarification.sha256[path] || feedFreshness.sha256[path] || sessionRecovery.sha256[path] || ownedHistory.sha256[path] || listing30d.sha256[path] || gpsPause.sha256[path] || expected, routeClarification.sha256[path] ? routeClarification.reason : feedFreshness.sha256[path] ? feedFreshness.reason : sessionRecovery.sha256[path] ? sessionRecovery.reason : ownedHistory.sha256[path] ? ownedHistory.reason : listing30d.sha256[path] ? listing30d.reason : gpsPause.sha256[path] ? gpsPause.reason : baseline.base_sha);
  });
}
