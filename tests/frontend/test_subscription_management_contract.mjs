import fs from 'node:fs';
import assert from 'node:assert/strict';

// Экран «Подписка» (лимит раскрытия контактов) удалён в 70a6b8fe —
// единственная монетизация — лимит принятия сделок на SubscriptionPlansScreen.
const profile = fs.readFileSync('src/screens/ProfileScreen.js', 'utf8');
const navigator = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');
const plans = fs.readFileSync('src/screens/SubscriptionPlansScreen.js', 'utf8');

assert.ok(!fs.existsSync('src/screens/SubscriptionScreen.js'), 'SubscriptionScreen удалён');
assert.doesNotMatch(navigator, /<Stack\.Screen name="Subscription" /);
assert.doesNotMatch(profile, /screen: 'Subscription'[,\s}]/);
assert.match(profile, /\.\.\.\(session \? \[\{ icon: 'award',[\s\S]*screen: 'SubscriptionPlans'/);
assert.match(navigator, /<Stack\.Screen name="SubscriptionPlans" component=\{SubscriptionPlansScreen\}/);

// Управление/отмена подписки — только через Google Play, кнопка обязана
// жить на экране тарифов (пропала вместе с SubscriptionScreen в 70a6b8fe).
assert.match(plans, /testID="subscription-manage-button"/);
assert.match(plans, /deepLinkToSubscriptions/);
assert.match(plans, /play\.google\.com\/store\/account\/subscriptions/);
assert.match(plans, /isActive && !isPilotFree && \(\s*<View style=\{s\.manageBlock\}>/);

console.log('subscription-management-contract OK');
