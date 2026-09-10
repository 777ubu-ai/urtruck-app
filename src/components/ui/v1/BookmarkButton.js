import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { useV1Colors } from '../../../theme/designV1';

export default function BookmarkButton({ saved, onPress, testID, accessibilityLabel }) {
  const colors = useV1Colors();
  return (
    <TouchableOpacity onPress={(event) => { event?.stopPropagation?.(); onPress?.(); }} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }} style={[s.button, { borderColor: colors.border }]} testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected: Boolean(saved) }}>
      {saved ? <FontAwesome5 name="bookmark" size={16} color={colors.driver} solid /> : <Feather name="bookmark" size={18} color={colors.textMuted} />}
    </TouchableOpacity>
  );
}
const s = StyleSheet.create({ button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 20 } });
