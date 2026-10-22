// Исходный текст не изменяется: пять строк в ленте, полное раскрытие по нажатию.
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

export default function ExternalFeedDescription({ text, styles, moreLabel, lessLabel, itemId, onExpand }) {
  const [expanded, setExpanded] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const [previewHeight, setPreviewHeight] = useState(0);
  const hasOverflow = fullHeight > previewHeight + 1;
  return <View style={styles.details}>
    <View style={styles.descriptionBox}>
      <Text style={[styles.original, styles.descriptionMeasure]} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden onLayout={event => setFullHeight(event.nativeEvent.layout.height)}>{text}</Text>
      <Text style={styles.original} numberOfLines={expanded ? undefined : 5} onLayout={event => { if (!expanded) setPreviewHeight(event.nativeEvent.layout.height); }} testID={`external-feed-description-${itemId}`}>{text}</Text>
    </View>
    {expanded || hasOverflow ? <TouchableOpacity
      accessibilityRole="button" accessibilityState={{ expanded }} aria-expanded={expanded}
      onPress={() => { if (!expanded) onExpand?.(); setExpanded(value => !value); }}
      style={styles.textAction} testID={`external-feed-expand-${itemId}`}
    ><Text style={styles.link}>{expanded ? lessLabel : moreLabel}</Text></TouchableOpacity> : null}
  </View>;
}
