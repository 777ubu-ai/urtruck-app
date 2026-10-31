// Всё описание под датой скрыто до явного раскрытия. Исходный текст не меняется.
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

export default function ExternalFeedDescription({ text, children, actions, styles, moreLabel, lessLabel, itemId, onExpand }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!(text || children);
  return <View style={styles.details}>
    {expanded && hasDetails ? <View style={styles.descriptionBox}>
      {text ? <Text style={styles.original} testID={`external-feed-description-${itemId}`}>{text}</Text> : null}
      {children}
    </View> : null}
    <View style={styles.cardActions}>
      {hasDetails ? <TouchableOpacity
        accessibilityRole="button" accessibilityLabel={expanded ? lessLabel : moreLabel}
        accessibilityState={{ expanded }} aria-expanded={expanded}
        onPress={() => { if (!expanded) onExpand?.(); setExpanded(value => !value); }}
        style={[styles.textAction, styles.expandAction]} testID={`external-feed-expand-${itemId}`}
      ><Text style={[styles.link, styles.actionLabel]} testID={`external-feed-expand-label-${itemId}`}>{expanded ? lessLabel : moreLabel}</Text>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#168759" />
      </TouchableOpacity> : null}
      {actions}
    </View>
  </View>;
}
