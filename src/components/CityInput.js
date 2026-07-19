import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Keyboard } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../utils/ThemeContext';
import { t } from '../utils/i18n';
import { searchCities, formatCity, COUNTRIES, addCustomCity, subscribeToCities } from '../utils/cities';

export default function CityInput({ value, onChange, placeholder, style, testID }) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState(value || '');
  const [, setTick] = useState(0);
  const ref = useRef(null);
  const picking = useRef(false);

  useEffect(() => subscribeToCities(() => setTick(x => x + 1)), []);

  const suggestions = focused && query.length >= 1 ? searchCities(query) : [];

  const handleChange = (text) => {
    setQuery(text);
    onChange(text);
  };

  const pick = (city) => {
    picking.current = true;
    let formatted;
    if (city.isCustom) {
      addCustomCity(city.name, 'XX');
      formatted = city.name + ', 📍';
    } else {
      formatted = formatCity(city);
    }
    setQuery(formatted);
    onChange(formatted);
    setFocused(false);
    Keyboard.dismiss();
    setTimeout(() => { picking.current = false; }, 100);
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!picking.current) setFocused(false);
    }, 300);
  };

  return (
    <View style={[s.wrap, style]}>
      <TextInput
        ref={ref}
        testID={testID}
        style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
        value={query}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
      />
      {suggestions.length > 0 && (
        <View style={[s.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {suggestions.map((c, i) => (
            <Pressable
              key={c.name + c.country + i}
              style={[s.item, i < suggestions.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }, c.isCustom && { backgroundColor: theme.border + '40' }]}
              onPress={() => pick(c)}
            >
              {c.isCustom ? (
                <Feather name="plus" size={18} color={theme.textMuted} style={s.flag} />
              ) : (
                <Text style={s.flag}>{COUNTRIES[c.country]?.flag || '🏳️'}</Text>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[s.cityName, { color: theme.text }]}>
                  {c.isCustom ? t('city_input_custom_label').replace('{name}', c.name) : c.name}
                </Text>
                <Text style={[s.countryName, { color: theme.textMuted }]}>
                  {c.isCustom ? t('city_input_add_custom') : (COUNTRIES[c.country]?.name || t('city_input_other'))}
                  {!c.isCustom && c.country && ` · ${c.country}`}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'relative', marginBottom: 10, zIndex: 100 },
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
  flag: { fontSize: 20 },
  cityName: { fontSize: 14, fontWeight: '600' },
  countryName: { fontSize: 11, marginTop: 1 },
});
