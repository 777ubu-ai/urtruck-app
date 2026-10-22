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
for (const [path, expected] of Object.entries(baseline.sha256)) {
  test('сохранена согласованная реализация: ' + path, () => {
    const source = withoutFeedHooks(path, readFileSync(path, 'utf8'));
    assert.equal(createHash('sha256').update(source).digest('hex'), expected, baseline.base_sha);
  });
}
