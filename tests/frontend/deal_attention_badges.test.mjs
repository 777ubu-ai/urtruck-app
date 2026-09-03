// P0 2026-09-03 — canon CORRECTION (owner-verified). См. docs/product/DEALS_CANON.md.
//
// Владелец физически подтвердил 3-tab архитектуру (Предложения/В работе/
// Архив) как канон — предыдущая версия этого файла (2026-09-02) защищала
// unified-inbox, отклонённый владельцем как регрессия. Тест переписан на
// текущую структуру, инварианты attention-counters/badge/адаптивности
// TabChip сохранены без изменений.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const deals = fs.readFileSync("src/screens/DealsScreen.js", "utf8");

test("deal inbox preserves actionable counters for offers and active deals", () => {
  // Attention counters — питают красный дот на bottom-tab «Сделки» и
  // attentionCount на своих TabChip (Предложения / В работе отдельно).
  assert.match(deals, /const offerAttentionCount = useMemo/);
  assert.match(deals, /offersData\.reduce/);
  assert.match(deals, /const activeAttentionCount = useMemo/);
  assert.match(deals, /activeDeals\.reduce/);

  // Канон: attentionCount живёт на СВОЕЙ вкладке — Предложения получает
  // offerAttentionCount, В работе — activeAttentionCount (не суммируется
  // в одну "Все", т.к. вкладки разные).
  assert.match(deals, /attentionCount=\{offerAttentionCount\}/);
  assert.match(deals, /attentionCount=\{activeAttentionCount\}/);

  // testID attention остался на TabChip
  assert.match(deals, /testID=\{`\$\{testID\}-attention`\}/);

  // client roles-специфика по tracking_action_required / delivered /
  // awaiting_confirmation — invariant unread computation, не задета.
  assert.match(
    deals,
    /item\.tracking_action_required[\s\S]*role === ["']client["'][\s\S]*item\.status === ["']delivered["'][\s\S]*item\.status === ["']awaiting_confirmation["']/,
  );
});

test("attention inside cards uses the distinct red unread badge", () => {
  assert.match(deals, /testID="deals-card-unread"/);
});

test('deal top tabs fit narrow phones and show counts as badges', () => {
  // TabChip адаптивные — инварианты не зависят от числа вкладок.
  assert.match(deals, /styles\.tabCountBadge/);
  assert.match(deals, /count > 99 \? '99\+' : count/);

  // Канонические labels (Предложения/В работе/Архив):
  assert.match(deals, /tabOffersLabel: 'Предложения'/);
  assert.match(deals, /tabActiveLabel: 'В работе'/);
  assert.match(deals, /tabArchiveLabel: 'Архив'/);
  assert.match(deals, /label=\{copy\.tabOffersLabel\}/);
  assert.match(deals, /label=\{copy\.tabActiveLabel\}/);
  assert.match(deals, /label=\{copy\.tabArchiveLabel\}/);

  // Инверсная защита: unified-inbox 2 вкладки — отклонённая владельцем регрессия.
  assert.doesNotMatch(deals, /tabAllLabel: 'Все'/);
  assert.doesNotMatch(deals, /tabUnreadLabel: 'Непрочитанные'/);

  // TabChip layout — адаптивность сохраняется:
  assert.match(deals, /styles\.tabChipLabelRow/);
  assert.match(deals, /adjustsFontSizeToFit/);
  assert.match(deals, /minimumFontScale=\{0\.62\}/);
  assert.match(deals, /tabChip:\s*\{[\s\S]*flex:\s*1/);
  assert.match(deals, /tabChipText:\s*\{[\s\S]*fontSize:\s*11/);
});
