// Всё описание под датой скрыто до явного раскрытия. Исходный текст не меняется.
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

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
        accessibilityRole="button" accessibilityState={{ expanded }} aria-expanded={expanded}
        onPress={() => { if (!expanded) onExpand?.(); setExpanded(value => !value); }}
        style={styles.textAction} testID={`external-feed-expand-${itemId}`}
      ><Text style={[styles.link, styles.actionLabel]}>{expanded ? lessLabel : moreLabel}</Text></TouchableOpacity> : null}
      {actions}
    </View>
  </View>;
}
