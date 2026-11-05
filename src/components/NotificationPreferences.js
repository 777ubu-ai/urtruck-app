import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '../utils/AuthContext';
import { useI18n } from '../utils/useI18n';
import { useV1Colors, v1Radius } from '../theme/designV1';
import { push } from '../utils/push';

const COPY = {
  RU: ['Необязательные напоминания', 'Нет предложений', 'Давно не заходили', 'Срок публикации', 'Сообщения и события сделки продолжат приходить.', 'Не удалось сохранить настройки'],
  KK: ['Қосымша еске салғыштар', 'Ұсыныстар жоқ', 'Көптен кірмедіңіз', 'Жарияланым мерзімі', 'Хабарлар мен мәміле оқиғалары келе береді.', 'Баптаулар сақталмады'],
  EN: ['Optional reminders', 'No offers yet', 'Inactivity', 'Listing expiry', 'Messages and deal events will still arrive.', 'Could not save settings'],
  ZH: ['可选提醒', '暂无报价', '久未登录', '发布到期', '消息和交易通知仍会正常发送。', '无法保存设置'],
  TR: ['İsteğe bağlı hatırlatmalar', 'Henüz teklif yok', 'Uzun süredir giriş yok', 'İlan süresi', 'Mesajlar ve anlaşma bildirimleri gelmeye devam eder.', 'Ayarlar kaydedilemedi'],
  UZ: ['Ixtiyoriy eslatmalar', 'Taklif yo‘q', 'Anchadan beri kirmadingiz', 'E’lon muddati', 'Xabarlar va bitim bildirishnomalari kelishda davom etadi.', 'Sozlamalar saqlanmadi'],
  KY: ['Кошумча эскертүүлөр', 'Сунуш жок', 'Көптөн бери кире элексиз', 'Жарыянын мөөнөтү', 'Билдирүүлөр жана келишим окуялары келе берет.', 'Жөндөөлөр сакталган жок'],
  TG: ['Ёдраскуниҳои ихтиёрӣ', 'Пешниҳод нест', 'Муддате ворид нашудед', 'Муҳлати эълон', 'Паёмҳо ва рӯйдодҳои аҳд идома меёбанд.', 'Танзимот сабт нашуд'],
  BE: ['Неабавязковыя напаміны', 'Няма прапаноў', 'Даўно не заходзілі', 'Тэрмін публікацыі', 'Паведамленні і падзеі здзелкі будуць прыходзіць.', 'Не ўдалося захаваць налады'],
};
const KEYS = ['no_bids', 'inactivity', 'listing_lifecycle'];

export default function NotificationPreferences() {
  const { session } = useAuth();
  const { lang } = useI18n();
  const c = useV1Colors();
  const copy = COPY[lang] || COPY.RU;
  const [values, setValues] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const account = session?.user?.id;
  useEffect(() => {
    generation.current += 1;
    let active = true;
    setValues(null); setError(false); setBusy(false);
    push.notificationPreferences().then((result) => {
      if (!active) return;
      if (result.ok) setValues({ account, preferences: result.preferences });
      else setError(true);
    });
    return () => { active = false; };
  }, [account]);
  const current = values && values.account === account ? values.preferences : null;
  const change = async (key, value) => {
    const currentGeneration = generation.current;
    setBusy(true); setError(false);
    const result = await push.notificationPreferences({ [key]: value });
    if (currentGeneration !== generation.current) return;
    // Ответ предыдущего аккаунта не используется новым: данные помечены account.
    if (result.ok) setValues({ account, preferences: result.preferences });
    else setError(true);
    setBusy(false);
  };
  return <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }]} testID="notification-preferences">
    <Text style={[s.title, { color: c.text }]}>{copy[0]}</Text>
    {KEYS.map((key, index) => <View key={key} style={s.row}>
      <Text style={[s.label, { color: c.text }]}>{copy[index + 1]}</Text>
      <Switch value={Boolean(current?.[key])} disabled={!current || busy} onValueChange={(value) => change(key, value)} accessibilityLabel={copy[index + 1]} testID={`notification-pref-${key}`} />
    </View>)}
    <Text style={[s.hint, { color: c.textMuted }]}>{copy[4]}</Text>
    {error ? <Text accessibilityRole="alert" style={[s.hint, { color: c.error }]}>{copy[5]}</Text> : null}
  </View>;
}
const s = StyleSheet.create({ card: { borderWidth: 1, borderRadius: v1Radius.card, padding: 14 }, title: { fontSize: 15, fontWeight: '800' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 }, label: { flex: 1, fontSize: 14 }, hint: { fontSize: 13, lineHeight: 18, marginTop: 6 } });
