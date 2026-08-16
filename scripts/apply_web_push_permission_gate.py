from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    p = ROOT / path
    s = p.read_text(encoding='utf-8')
    if old not in s:
        raise RuntimeError(f'pattern not found in {path}: {old[:100]!r}')
    p.write_text(s.replace(old, new, 1), encoding='utf-8')

# Web permission prompts must come from an explicit user action. Auto-register
# now repairs an already-granted subscription but never consumes/loses the
# browser permission prompt during app bootstrap.
replace_once(
    'src/utils/push.js',
    '  async subscribe() {\n    if (!this.isSupported()) return { ok: false, reason: \'unsupported\' };\n\n    // 1. Permission\n    let perm = Notification.permission;\n    if (perm === \'default\') perm = await Notification.requestPermission();\n    await storage.set(PUSH_ASKED, \'1\');\n    if (perm !== \'granted\') return { ok: false, reason: \'denied\' };',
    '  async subscribe(options = {}) {\n    if (!this.isSupported()) return { ok: false, reason: \'unsupported\' };\n\n    // 1. Permission. Browser permission requests are user-gesture sensitive.\n    // App bootstrap must never call requestPermission() automatically: Huawei/\n    // Chromium-class browsers can ignore/block that prompt and the driver then\n    // never gets a bound web subscription. The explicit UI CTA passes\n    // requestPermission:true; background repair only re-binds granted access.\n    const requestPermission = options?.requestPermission === true;\n    let perm = Notification.permission;\n    if (perm === \'default\' && !requestPermission) {\n      return { ok: false, reason: \'permission_required\' };\n    }\n    if (perm === \'default\') perm = await Notification.requestPermission();\n    await storage.set(PUSH_ASKED, \'1\');\n    if (perm !== \'granted\') return { ok: false, reason: \'denied\' };'
)
replace_once(
    'src/utils/push.js',
    "    if (this.isSupported()) return this.subscribe();",
    "    if (this.isSupported()) return this.subscribe({ requestPermission: false });"
)

banner = r'''import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { push } from '../utils/push';
import { useI18n } from '../utils/useI18n';

const COPY = {
  RU: {
    title: 'Не пропускайте предложения',
    body: 'Включите уведомления UrTruck — новые ставки и изменения сделки придут сразу.',
    enable: 'Включить',
    denied: 'Уведомления заблокированы в браузере. Разрешите их для urtruck.kz в настройках сайта.',
    retry: 'Проверить снова',
  },
  EN: {
    title: 'Don’t miss new offers',
    body: 'Enable UrTruck notifications to receive bids and deal updates immediately.',
    enable: 'Enable',
    denied: 'Notifications are blocked by the browser. Allow them for urtruck.kz in site settings.',
    retry: 'Check again',
  },
  ZH: {
    title: '不要错过新报价',
    body: '开启 UrTruck 通知，及时收到新报价和交易状态变化。',
    enable: '开启通知',
    denied: '浏览器已阻止通知。请在网站设置中允许 urtruck.kz 发送通知。',
    retry: '重新检查',
  },
  KK: {
    title: 'Ұсыныстарды өткізіп алмаңыз',
    body: 'UrTruck хабарламаларын қосыңыз — жаңа ұсыныстар мен мәміле өзгерістері бірден келеді.',
    enable: 'Қосу',
    denied: 'Браузер хабарламаларды бұғаттаған. Сайт баптауларында urtruck.kz үшін рұқсат беріңіз.',
    retry: 'Қайта тексеру',
  },
};

export default function PushPermissionBanner({ enabled }) {
  const { lang } = useI18n();
  const c = COPY[lang] || COPY.RU;
  const [permission, setPermission] = useState('loading');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (Platform.OS !== 'web' || !enabled || !push.isSupported()) {
      setPermission('hidden');
      return;
    }
    const p = await push.permission();
    setPermission(p);
    if (p === 'granted') {
      // Re-bind an existing browser subscription to the current authenticated
      // user. This is idempotent and repairs a token after login/account switch.
      push.subscribe({ requestPermission: false }).catch(() => {});
    }
  }, [enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  const enablePush = async () => {
    setBusy(true);
    try {
      const r = await push.subscribe({ requestPermission: true });
      setPermission(r?.ok ? 'granted' : (r?.reason === 'denied' ? 'denied' : (await push.permission())));
    } catch {
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!enabled || permission === 'loading' || permission === 'hidden' || permission === 'granted') return null;
  const denied = permission === 'denied';

  return (
    <View style={s.wrap} testID="push-permission-banner">
      <View style={s.icon}><Feather name="bell" size={18} color="#34936B" /></View>
      <View style={s.copy}>
        <Text style={s.title}>{c.title}</Text>
        <Text style={s.body}>{denied ? c.denied : c.body}</Text>
      </View>
      <TouchableOpacity
        style={s.action}
        onPress={denied ? refresh : enablePush}
        disabled={busy}
        testID="push-permission-enable"
      >
        <Text style={s.actionText}>{denied ? c.retry : c.enable}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDE9E2',
    backgroundColor: '#F6FBF8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EAF5EF', alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  title: { color: '#17221E', fontSize: 13, lineHeight: 17, fontWeight: '700' },
  body: { color: '#606B66', fontSize: 11.5, lineHeight: 15, marginTop: 2 },
  action: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#34936B', alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#34936B', fontSize: 12, fontWeight: '700' },
});
'''
(ROOT / 'src/components/PushPermissionBanner.js').write_text(banner, encoding='utf-8')

replace_once(
    'App.js',
    "import OfflineBanner from './src/components/OfflineBanner';",
    "import OfflineBanner from './src/components/OfflineBanner';\nimport PushPermissionBanner from './src/components/PushPermissionBanner';"
)
replace_once(
    'App.js',
    "        <OfflineBanner />\n        <NavigationContainer",
    "        <OfflineBanner />\n        <PushPermissionBanner enabled={hasToken} />\n        <NavigationContainer"
)

# Regression test for explicit browser permission gesture.
test = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const push = fs.readFileSync('src/utils/push.js', 'utf8');
const banner = fs.readFileSync('src/components/PushPermissionBanner.js', 'utf8');
const app = fs.readFileSync('App.js', 'utf8');

test('web bootstrap never consumes browser notification permission prompt', () => {
  assert.match(push, /permission_required/);
  assert.match(push, /this\.subscribe\(\{ requestPermission: false \}\)/);
  assert.match(push, /options\?\.requestPermission === true/);
});

test('authenticated web UI has explicit push permission CTA', () => {
  assert.match(banner, /push\.subscribe\(\{ requestPermission: true \}\)/);
  assert.match(banner, /testID="push-permission-enable"/);
  assert.match(app, /<PushPermissionBanner enabled=\{hasToken\} \/>/);
});
'''
(ROOT / 'tests/frontend/web_push_permission_gate.test.mjs').write_text(test, encoding='utf-8')

# Web release + SW cache epoch.
vp = ROOT / '.version'
cur = int(vp.read_text(encoding='utf-8').strip())
vp.write_text(str(max(cur + 1, 109)) + '\n', encoding='utf-8')

sp = ROOT / 'sw-template.js'
s = sp.read_text(encoding='utf-8')
m = re.search(r'urtruck-v(\d+)-market', s)
if not m:
    raise RuntimeError('service-worker epoch not found')
epoch = max(int(m.group(1)) + 1, 18)
s = re.sub(r'UrTruck Service Worker · v\d+', f'UrTruck Service Worker · v{epoch}', s)
s = re.sub(r'urtruck-v\d+-market', f'urtruck-v{epoch}-market', s)
s = re.sub(r'urtruck-static-v\d+', f'urtruck-static-v{epoch}', s)
sp.write_text(s, encoding='utf-8')

print('Applied explicit web push permission gate')
