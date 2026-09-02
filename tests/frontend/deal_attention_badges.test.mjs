// P0 2026-09-02 — переписан под unified inbox (§2/§3).
//
// БЫВШИЙ файл защищал 3-tab архитектуру (tabOffersLabel/Active/Archive),
// которая была регрессией из PR #243 e036e53. Теперь тест защищает НОВЫЙ
// unified-inbox канон, но сохраняет инварианты attention-counters,
// красного unread-badge и адаптивности TabChip.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const deals = fs.readFileSync("src/screens/DealsScreen.js", "utf8");

test("deal inbox preserves actionable counters for offers and active deals", () => {
  // Attention counters должны остаться (offers и active) — они питают
  // красный дот на bottom-tab «Сделки» и в attentionCount TabChip.
  assert.match(deals, /const offerAttentionCount = useMemo/);
  assert.match(deals, /offersData\.reduce/);
  assert.match(deals, /const activeAttentionCount = useMemo/);
  assert.match(deals, /activeDeals\.reduce/);

  // Новый canon: attentionCount живёт на TabChip 'Все' и 'Непрочитанные'
  // как сумма (offer + active), а не по одной вкладке. Иначе pending
  // offer'ы бы «съедались» переключением между старыми вкладками.
  assert.match(deals, /attentionCount=\{offerAttentionCount \+ activeAttentionCount\}/);

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
  // TabChip адаптивные — эти инварианты живут и в unified canon.
  assert.match(deals, /styles\.tabCountBadge/);
  assert.match(deals, /count > 99 \? '99\+' : count/);

  // Новые labels canonical:
  assert.match(deals, /tabAllLabel: 'Все'/);
  assert.match(deals, /tabUnreadLabel: 'Непрочитанные'/);
  assert.match(deals, /label=\{copy\.tabAllLabel\}/);
  assert.match(deals, /label=\{copy\.tabUnreadLabel\}/);

  // Инверсная защита: старые Predloженiya/V rabote/Arkhiv labels — регрессия.
  assert.doesNotMatch(deals, /tabOffersLabel: 'Предложения'/);
  assert.doesNotMatch(deals, /tabActiveLabel: 'В работе'/);
  assert.doesNotMatch(deals, /tabArchiveLabel: 'Архив'/);

  // TabChip layout — сохраняется адаптивность:
  assert.match(deals, /styles\.tabChipLabelRow/);
  assert.match(deals, /adjustsFontSizeToFit/);
  assert.match(deals, /minimumFontScale=\{0\.62\}/);
  assert.match(deals, /tabChip:\s*\{[\s\S]*flex:\s*1/);
  assert.match(deals, /tabChipText:\s*\{[\s\S]*fontSize:\s*11/);
});
