import fs from 'node:fs';
import assert from 'node:assert/strict';

const profile = fs.readFileSync('src/screens/ProfileScreen.js', 'utf8');
const subscription = fs.readFileSync('src/screens/SubscriptionScreen.js', 'utf8');
const navigator = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');

assert.match(profile, /\.\.\.\(session \? \[\{ icon: 'zap',[\s\S]*screen: 'Subscription'/);
assert.match(navigator, /<Stack\.Screen name="Subscription" component=\{SubscriptionScreen\} \/>/);
assert.match(subscription, /testID="subscription-manage-button"/);
assert.match(subscription, /deepLinkToSubscriptions/);
assert.match(subscription, /play\.google\.com\/store\/account\/subscriptions/);

console.log('subscription-management-contract OK');