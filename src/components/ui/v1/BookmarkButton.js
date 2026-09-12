import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { useV1Colors } from '../../../theme/designV1';

export default function BookmarkButton({ saved, onPress, testID, accessibilityLabel, compact = false }) {
  const colors = useV1Colors();
  return (
    <TouchableOpacity onPress={(event) => { event?.stopPropagation?.(); onPress?.(); }} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }} style={[compact ? s.compactButton : s.button, { borderColor: colors.border }]} testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected: Boolean(saved) }}>
      {saved ? <FontAwesome5 name="bookmark" size={12} color={colors.driver} solid /> : <Feather name="bookmark" size={14} color={colors.textMuted} />}
    </TouchableOpacity>
  );
}
const s = StyleSheet.create({
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 20 },
  compactButton: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10 },
});
