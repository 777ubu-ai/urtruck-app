import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const wrapper = fs.readFileSync("src/screens/ChatsListScreen.js", "utf8");
const deals = fs.readFileSync("src/screens/DealsScreen.js", "utf8");
const legacy = fs.readFileSync("src/screens/ChatsListLegacyScreen.js", "utf8");

test("Deals route is isolated from the legacy standalone chat list", () => {
  assert.match(wrapper, /props\?\.route\?\.name === ["']Deals["']/);
  assert.match(wrapper, /<DealsScreen \{\.\.\.props\} ?\/>/);
  assert.match(wrapper, /<LegacyChatsListScreen \{\.\.\.props\} ?\/>/);
  assert.match(legacy, /export default function ChatsListScreen/);
});

test("deal inbox keeps only menu + primary chips fixed while search scrolls away", () => {
  assert.match(deals, /testID="deals-minimal-header"/);
  assert.match(deals, /testID="deals-primary-tabs"/);
  assert.match(deals, /testID="deals-tab-offers"/);
  assert.match(deals, /testID="deals-tab-active"/);
  assert.match(deals, /testID="deals-tab-archive"/);
  assert.match(deals, /ListHeaderComponent=\{searchHeader\}/);
  assert.match(deals, /testID="deals-scroll-header"/);
  assert.doesNotMatch(deals, /stickyHeaderIndices/);
  assert.doesNotMatch(deals, /t\('tab_deals'\)/);
});

test("archive is separate and includes completed deals plus closed negotiations", () => {
  assert.match(deals, /ARCHIVE_DEAL_STATUSES/);
  assert.match(deals, /CLOSED_BID_STATUSES/);
  assert.match(deals, /\.\.\.archivedDeals\.map/);
  assert.match(deals, /\.\.\.closedBidsData\.map/);
  assert.match(deals, /dealTab === ["']archive["']/);
});

test("cards are compact and do not use the old decorative avatar/dollar block", () => {
  assert.match(deals, /function CompactDealCard/);
  assert.match(deals, /minHeight: 92/);
  assert.match(deals, /routeLabel=\{routeFor/);
  assert.match(deals, /price=\{/);
  assert.doesNotMatch(deals, /name="dollar-sign"/);
  assert.doesNotMatch(deals, /styles?\.avatar/);
});

test("four-language copy exists for new archive/search/error UI", () => {
  assert.match(deals, /RU: \{/);
  assert.match(deals, /EN: \{/);
  assert.match(deals, /ZH: \{/);
  assert.match(deals, /KK: \{/);
  assert.match(deals, /archive: ["']Архив["']/);
  assert.match(deals, /archive: ["']Archive["']/);
  assert.match(deals, /archive: ["']归档["']/);
  assert.match(deals, /archive: ["']Мұрағат["']/);
});

test("actionable counts remain computed for offer and active deal attention", () => {
  assert.match(deals, /const offerAttentionCount = useMemo/);
  assert.match(deals, /isBidActionable/);
  assert.match(deals, /const activeAttentionCount = useMemo/);
  assert.match(
    deals,
    /item\.tracking_action_required[\s\S]*role === ["']client["'][\s\S]*item\.status === ["']delivered["'][\s\S]*item\.status === ["']awaiting_confirmation["']/,
  );
  assert.match(
    deals,
    /const attentionRequired[\s\S]*needsReceiptConfirmation[\s\S]*trackingActionRequired/,
  );
});
