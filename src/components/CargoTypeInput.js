import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { cargoInputText, localizeCargoName } from '../utils/places';
import { searchCargoTypes, addCustomCargoType, subscribeToCargoTypes } from '../utils/cargoTypes';
import { useKeyboardSafeFocus } from './ui/v1/KeyboardSafeLayout';

const DROPDOWN_HEIGHT = 160;

export default function CargoTypeInput({ value, onChange, placeholder, style, testID }) {
  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const [focused, setFocused] = useState(false);
  // Редактируемое значение принадлежит форме: эффекты и смена языка его не заменяют.
  const [selection, setSelection] = useState(null);
  const query = selection && value === selection.name ? selection.label : cargoInputText(value);
  const [, setTick] = useState(0);

  useEffect(() => subscribeToCargoTypes(() => setTick(x => x + 1)), []);

  const suggestions = focused ? searchCargoTypes(query, lang) : [];
  const handleFocus = useKeyboardSafeFocus((event) => {
    // Контекст уже получил focus: повторный bubble запускал бы вторую прокрутку.
    event?.stopPropagation?.();
    setFocused(true);
  }, DROPDOWN_HEIGHT + 4);

  const handleChange = (text) => {
    setSelection(null);
    onChange(cargoInputText(text));
  };

  const pick = (item) => {
    if (item.isCustom) addCustomCargoType(item.name);
    // Переведённая подсказка попадает в поле только по явному нажатию.
    setSelection({ name: item.name, label: localizeCargoName(item.name, lang) || item.name });
    onChange(item.name);
    setFocused(false);
  };

  return (
    <View style={[s.wrap, style]} testID={testID ? `${testID}-wrap` : undefined}>
      <TextInput
        testID={testID}
        style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
        multiline
        textAlignVertical="top"
        value={query}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        onFocus={handleFocus}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
      />
      {suggestions.length > 0 && (
        <ScrollView
          testID={testID ? `${testID}-suggestions` : undefined}
          style={[s.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {suggestions.map((c, i) => (
            <TouchableOpacity
              key={c.name + i}
              testID={testID ? `${testID}-suggestion-${i}` : undefined}
              style={[s.item, i < suggestions.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }, c.isCustom && { backgroundColor: theme.border + '40' }]}
              onPress={() => pick(c)}
            >
              <Text style={s.icon}>{c.icon || '📦'}</Text>
              <Text style={[s.name, { color: theme.text }]}>
                {c.isCustom
                  ? t('cargo_type_custom_label').replace('{name}', c.name)
                  : (localizeCargoName(c.name, lang) || c.name)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'relative', marginBottom: 10, zIndex: 50 },
  input: { borderRadius: 12, padding: 14, fontSize: 14, borderWidth: 1 },
  dropdown: {
    marginTop: 4,
    // Постоянная высота не сдвигает поле при смене числа результатов.
    borderRadius: 12, borderWidth: 1, height: DROPDOWN_HEIGHT,
    zIndex: 1000,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    overflow: 'hidden',
  },
  item: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  icon: { fontSize: 20 },
  name: { fontSize: 14, fontWeight: '600', flex: 1 },
});
