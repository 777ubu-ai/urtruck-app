import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const deals = fs.readFileSync("src/screens/DealsScreen.js", "utf8");

test("deal inbox preserves actionable counters for offers and active deals", () => {
  assert.match(deals, /const offerAttentionCount = useMemo/);
  assert.match(deals, /offersData\.reduce/);
  assert.match(deals, /const activeAttentionCount = useMemo/);
  assert.match(deals, /activeDeals\.reduce/);
  assert.match(deals, /attentionCount=\{offerAttentionCount\}/);
  assert.match(deals, /attentionCount=\{activeAttentionCount\}/);
  assert.match(deals, /testID=\{`\$\{testID\}-attention`\}/);
  assert.match(
    deals,
    /item\.tracking_action_required[\s\S]*role === ["']client["'][\s\S]*item\.status === ["']delivered["'][\s\S]*item\.status === ["']awaiting_confirmation["']/,
  );
});

test("attention inside cards uses the distinct red unread badge", () => {
  assert.match(deals, /testID="deals-card-unread"/);
  assert.match(deals, /backgroundColor: ["']#D64545["']/);
  assert.match(
    deals,
    /const needsReceiptConfirmation[\s\S]*role === ["']client["'][\s\S]*data\.status === ["']delivered["'][\s\S]*data\.status === ["']awaiting_confirmation["']/,
  );
  assert.match(
    deals,
    /const attentionRequired[\s\S]*needsReceiptConfirmation[\s\S]*trackingActionRequired/,
  );
});

test("waiting offer cards use calm neutral colours", () => {
  assert.match(deals, /const WAITING = ["']#617067["']/);
  assert.match(deals, /isCountered \? INFO : WAITING/);
  assert.doesNotMatch(deals, /name="dollar-sign"/);
});
