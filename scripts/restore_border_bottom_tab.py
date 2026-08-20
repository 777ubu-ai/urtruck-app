from pathlib import Path

ROOT = Path.cwd()


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    p = ROOT / path
    p.write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one anchor, found {count}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


# 1) Main bottom tabs: Profile stays a stack/header destination, Queue returns
# as the fourth primary work tab for both roles.
nav = 'src/navigation/AppNavigator.js'
replace_once(
    nav,
    '''          <Tab.Screen name="Feed" component={CargoFeedScreen} initialParams={{ role }} />\n          <Tab.Screen name="MyWork" component={MyTripsScreen} initialParams={{ role }} />\n          <Tab.Screen name="Deals" component={ChatsListScreen} initialParams={{ role }} />\n          <Tab.Screen name="Profile" component={ProfileScreen} initialParams={{ role }} />''',
    '''          <Tab.Screen name="Feed" component={CargoFeedScreen} initialParams={{ role }} />\n          <Tab.Screen name="MyWork" component={MyTripsScreen} initialParams={{ role }} />\n          <Tab.Screen name="Deals" component={ChatsListScreen} initialParams={{ role }} />\n          <Tab.Screen name="Queue" component={QueueScreen} initialParams={{ role }} />''',
)
replace_once(
    nav,
    '''          <Tab.Screen name="MyWork" component={MyTripsScreen} initialParams={{ role }} />\n          <Tab.Screen name="Feed" component={FeedScreen} initialParams={{ role }} />\n          <Tab.Screen name="Deals" component={ChatsListScreen} initialParams={{ role }} />\n          <Tab.Screen name="Profile" component={ProfileScreen} initialParams={{ role }} />''',
    '''          <Tab.Screen name="MyWork" component={MyTripsScreen} initialParams={{ role }} />\n          <Tab.Screen name="Feed" component={FeedScreen} initialParams={{ role }} />\n          <Tab.Screen name="Deals" component={ChatsListScreen} initialParams={{ role }} />\n          <Tab.Screen name="Queue" component={QueueScreen} initialParams={{ role }} />''',
)
replace_once(
    nav,
    '''  //   Водитель (4): Грузы (Feed) · Рейсы (MyWork) · Очередь (Queue —\n  //     инструмент границы, не дубль) · Сделки (Deals).\n  //   Клиент (3): Грузы (MyWork) · Машины (Feed) · Сделки (Deals).''',
    '''  //   Обе роли (4): рабочий каталог · своя работа · Сделки · Граница.\n  //   Queue — электронная очередь/граница; Profile остаётся только в верхнем\n  //   меню и stack-навигации, чтобы не дублировать его в bottom bar.''',
)

# 2) BottomNav: Queue gets the map-pin icon + localized Border label.
bottom = 'src/components/ui/v1/BottomNav.js'
replace_once(
    bottom,
    "  Deals:   { driver: 'handshake', client: 'handshake' },\n  Profile: { driver: 'user', client: 'user' },",
    "  Deals:   { driver: 'handshake', client: 'handshake' },\n  Queue:   { driver: 'map-pin', client: 'map-pin' },",
)
replace_once(
    bottom,
    "    if (name === 'Deals')   return t('tab_deals');\n    if (name === 'Profile') return t('tab_profile');",
    "    if (name === 'Deals')   return t('tab_deals');\n    if (name === 'Queue')   return t('tab_border');",
)
replace_once(
    bottom,
    "// handshake — «Сделки» (весь путь договорённости: ставки → торг →\n//         сделка → статусы). Заменил вкладку профиля — профиль ушёл\n//         наверх под ☰. Рендерится через MaterialCommunityIcons (см. ниже),\n//         остальные — через Feather.",
    "// handshake — «Сделки» (весь путь договорённости: ставки → торг →\n//         сделка → статусы).\n// map-pin — «Граница»: электронная очередь и данные КПП.\n// Профиль остаётся наверху под ☰ и не дублируется в bottom bar.",
)

# 3) Regression contracts follow the restored information architecture.
write('tests/frontend/test_navigation_tabs.mjs', '''import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst navigator = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');\nconst bottomNav = fs.readFileSync('src/components/ui/v1/BottomNav.js', 'utf8');\nconst start = navigator.indexOf('function MainTabs');\nconst end = navigator.indexOf('// Реактивная навигация', start);\nassert.ok(start >= 0 && end > start, 'MainTabs source must be discoverable');\nconst tabs = navigator.slice(start, end);\nconst countTab = (name) => tabs.split(`<Tab.Screen name="${name}"`).length - 1;\n\ntest('approved four-tab role navigation restores Border and removes Profile', () => {\n  assert.equal(countTab('Queue'), 2);\n  assert.equal(countTab('Publish'), 0);\n  assert.equal(countTab('Chats'), 0);\n  assert.equal(countTab('Feed'), 2);\n  assert.equal(countTab('MyWork'), 2);\n  assert.equal(countTab('Deals'), 2);\n  assert.equal(countTab('Profile'), 0);\n});\n\ntest('BottomNav exposes Border and has no Profile tab branch', () => {\n  assert.ok(bottomNav.includes("Queue:   { driver: 'map-pin', client: 'map-pin' }"));\n  assert.ok(bottomNav.includes("if (name === 'Queue')   return t('tab_border')"));\n  assert.ok(!bottomNav.includes("Profile: { driver: 'user', client: 'user' }"));\n  assert.ok(!bottomNav.includes("if (name === 'Profile') return t('tab_profile')"));\n  assert.ok(!bottomNav.includes("route.name === 'Publish'"));\n});\n\ntest('Profile remains stack-accessible from the top menu', () => {\n  assert.ok(navigator.includes('<Stack.Screen name="Profile" component={ProfileScreen}'));\n});\n''')

# Update the task2 regression without weakening the deal FSM assertions.
task2 = 'tests/frontend/task2_driver_unified.test.mjs'
text = read(task2)
start = text.index("test('main tabs are four canonical tabs")
end = text.index("\ntest('shared resolver", start)
new_block = '''test('main tabs are four canonical tabs with Border and no Profile duplication', () => {\n  const start = nav.indexOf('function MainTabs');\n  const end = nav.indexOf('// Реактивная навигация', start);\n  const tabs = nav.slice(start, end);\n  assert.equal((tabs.match(/Tab\\.Screen name="Queue"/g) || []).length, 2);\n  assert.equal((tabs.match(/Tab\\.Screen name="Deals"/g) || []).length, 2);\n  assert.equal((tabs.match(/Tab\\.Screen name="Profile"/g) || []).length, 0);\n  assert.match(bottom, /Queue:\\s*\\{ driver: 'map-pin', client: 'map-pin' \\}/);\n  assert.doesNotMatch(bottom, /Profile:\\s*\\{/);\n  assert.match(bottom, /name === 'Queue'\\)\\s+return t\\('tab_border'\\)/);\n  assert.doesNotMatch(bottom, /route\\.name === 'Publish'/);\n});\n'''
write(task2, text[:start] + new_block + text[end:])

print('restore-border-bottom-tab patch applied')
