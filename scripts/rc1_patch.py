from pathlib import Path

chat = Path('src/screens/ChatScreen.js')
text = chat.read_text(encoding='utf-8')
start_marker = "          {(() => {\n            if (!deal?.status || deal.status === 'cancelled' || deal.status === 'delivered' || deal.status === 'completed') return null;"
end_marker = "          {deal?.status === 'accepted' ? ("
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('RC1 FSM anchors not found in ChatScreen.js')

replacement = """          {(() => {
            // RC1: строгая ролевая FSM. Водитель начинает рейс и отмечает
            // фактическую доставку; грузоотправитель может только подтвердить
            // получение ПОСЛЕ статуса delivered. Никаких переходов
            // in_progress -> delivered со стороны грузоотправителя.
            if (!deal?.status || deal.status === 'cancelled' || deal.status === 'completed') return null;
            let action = null;
            if (role === 'driver') {
              if (deal.status === 'accepted') {
                action = { key: 'in_progress', icon: 'truck', label: t('start_delivery') };
              } else if (deal.status === 'in_progress' || deal.status === 'at_border') {
                action = { key: 'delivered', icon: 'package', label: t('mark_arrived') };
              }
            } else if (isShipperSide && deal.status === 'delivered') {
              action = { key: 'completed', icon: 'check-circle', label: t('confirm_delivery') };
            }
            if (!action) return null;
            return (
              <TouchableOpacity
                testID={
                  action.key === 'in_progress'
                    ? 'deal-action-start-delivery'
                    : action.key === 'delivered'
                      ? 'deal-action-mark-arrived'
                      : 'deal-action-confirm-receipt'
                }
                style={[s.dealNextBtn, { backgroundColor: v1Accent.main, opacity: statusLoading ? 0.6 : 1 }]}
                disabled={statusLoading}
                onPress={async () => {
                  let ok = true;
                  if (action.key === 'delivered' || action.key === 'completed') {
                    const message = action.key === 'delivered'
                      ? (t('confirm_mark_delivered') || 'Подтвердите, что груз действительно доставлен и передан получателю.')
                      : (t('confirm_receipt') || 'Подтвердите, что груз получен. После этого сделка будет завершена.');
                    ok = Platform.OS === 'web'
                      ? (typeof window !== 'undefined' && window.confirm(message))
                      : await new Promise((res) => Alert.alert(
                          action.label,
                          message,
                          [
                            { text: t('cancel'), style: 'cancel', onPress: () => res(false) },
                            { text: action.label, onPress: () => res(true) },
                          ],
                        ));
                  }
                  if (ok) changeDealStatus(action.key);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name={action.icon} size={16} color=\"#0C0A09\" />
                  <Text style={s.dealNextBtnText}>{statusLoading ? '…' : action.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })()}
"""

text = text[:start] + replacement + text[end:]
chat.write_text(text, encoding='utf-8')

test = Path('tests/frontend/rc1_deal_fsm_static.test.mjs')
test.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/screens/ChatScreen.js', 'utf8');

test('shipper cannot mark an in-progress trip delivered', () => {
  assert.doesNotMatch(src, /isShipperSide\s*&&\s*\(deal\.status === 'in_progress'/);
  assert.match(src, /isShipperSide\s*&&\s*deal\.status === 'delivered'/);
  assert.match(src, /action = \{ key: 'completed'/);
});

test('driver delivery and shipper receipt require separate actions', () => {
  assert.match(src, /action = \{ key: 'delivered'/);
  assert.match(src, /deal-action-mark-arrived/);
  assert.match(src, /deal-action-confirm-receipt/);
  assert.match(src, /window\.confirm\(message\)/);
});
""", encoding='utf-8')

print('RC1 deal FSM patch applied')
