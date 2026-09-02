import React from 'react';
import DealsScreen from './DealsScreen';
import LegacyChatsListScreen from './ChatsListLegacyScreen';

// Keep the existing chat-list implementation intact for deep links and the
// standalone ChatsList route. The bottom-tab "Deals" route gets the
// owner-approved compact WhatsApp-style deal inbox.
export default function ChatsListScreen(props) {
  return props?.route?.name === 'Deals'
    ? <DealsScreen {...props} />
    : <LegacyChatsListScreen {...props} />;
}
