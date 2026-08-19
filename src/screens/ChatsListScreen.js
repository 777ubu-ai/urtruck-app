import React from 'react';
import DealsScreen from './DealsScreen';
import ChatsListScreenLegacy from './ChatsListScreenLegacy';

export default function ChatsListScreen(props) {
  if (props?.route?.name === 'Deals') {
    return <DealsScreen {...props} />;
  }
  return <ChatsListScreenLegacy {...props} />;
}
