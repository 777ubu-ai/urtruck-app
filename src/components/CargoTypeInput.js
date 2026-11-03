import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { cargoInputText, localizeCargoName } from '../utils/places';
import { searchCargoTypes, addCustomCargoType, subscribeToCargoTypes } from '../utils/cargoTypes';

export default function CargoTypeInput({ value, onChange, placeholder, style, testID }) {
  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState(cargoInputText(value));
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [, setTick] = useState(0);

  // Free-form text always comes back from the form unchanged. A localized
  // label is retained only after the user explicitly picked a suggestion.
  useEffect(() => {
    const nextValue = cargoInputText(value);
    if (selectedSuggestion && nextValue === selectedSuggestion.name) {
      setQuery(localizeCargoName(selectedSuggestion.name, lang) || selectedSuggestion.name);
      return;
    }
    setSelectedSuggestion(null);
    setQuery(nextValue);
  }, [value, lang, selectedSuggestion]);
  useEffect(() => subscribeToCargoTypes(() => setTick(x => x + 1)), []);

  const suggestions = focused ? searchCargoTypes(query, lang) : [];

  const handleChange = (text) => {
    setSelectedSuggestion(null);
    setQuery(cargoInputText(text));
    onChange(text);
  };

  const pick = (item) => {
    if (item.isCustom) addCustomCargoType(item.name);
    setSelectedSuggestion(item);
    setQuery(localizeCargoName(item.name, lang) || item.name);
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
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
      />
      {suggestions.length > 0 && (
        <ScrollView
          style={[s.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {suggestions.map((c, i) => (
            <TouchableOpacity
              key={c.name + i}
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
    position: 'absolute', top: 52, left: 0, right: 0,
    borderRadius: 12, borderWidth: 1, maxHeight: 320,
    zIndex: 1000,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    overflow: 'hidden',
  },
  item: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  icon: { fontSize: 20 },
  name: { fontSize: 14, fontWeight: '600', flex: 1 },
});
