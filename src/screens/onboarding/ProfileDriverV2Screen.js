// ProfileDriverV2Screen — расширенный профиль водителя.
//
// Поля (по PLAN_RC2_AUTH_FLOW_V2.md):
//   • Имя              (обязательное, >= 2 символа)
//   • Город базирования (обязательное)
//   • Тип кузова       (выбор из 5 типов: тент / реф / площадка / авто / изотерм)
//   • Грузоподъёмность (кг, обязательное)
//   • Маршруты         (опциональное free-text)
//
// Сохранение: regAPI.updateProfile принимает {name, city}. Vehicle-поля
// (vehicle_type, capacity_kg) сейчас не уходят на backend через этот
// endpoint — это закрывается в PR #A (расширение PATCH /users/me).
// На данном этапе валидируем во фронте + сохраняем что можем; vehicle
// поля сохраняются локально через storage до момента появления
// backend-ручки.
//
// soft-gate: если юзер закроет, не заполнив — попадает в Main, но
// при попытке опубликовать груз увидит modal "Заполните профиль"
// (это поведение — следующих батчей).

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { regAPI } from '../../utils/registration';
import { storage } from '../../utils/storage';
import { brand, radius, typography } from '../../theme/brandV2';

const TRUCK_TYPES = [
  { id: 'tent',     icon: 'truck',    labelKey: 'truck_type_tent' },
  { id: 'ref',      icon: 'thermometer', labelKey: 'truck_type_ref' },
  { id: 'platform', icon: 'square',   labelKey: 'truck_type_platform' },
  { id: 'auto',     icon: 'truck',    labelKey: 'truck_type_auto' },
  { id: 'izoterm',  icon: 'package',  labelKey: 'truck_type_izoterm' },
];

export default function ProfileDriverV2Screen({ navigation }) {
  const { t } = useI18n();
  const { setRole } = useAuth();

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [truckType, setTruckType] = useState(null);
  const [capacityKg, setCapacityKg] = useState('');
  const [routes, setRoutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (name.trim().length < 2) e.name = t('profile_v2_err_name');
    if (city.trim().length < 2) e.city = t('profile_v2_err_city');
    if (!truckType) e.truckType = t('profile_v2_err_truck_type');
    const cap = parseInt((capacityKg || '').replace(/\D/g, ''), 10);
    if (!cap || cap < 100) e.capacityKg = t('profile_v2_err_capacity');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onFinish = async () => {
    if (busy) return;
    if (!validate()) return;
    setBusy(true);
    try {
      const trimmedName = name.trim();
      const trimmedCity = city.trim();
      try {
        await regAPI.updateProfile({ name: trimmedName, city: trimmedCity });
      } catch {}
      // Локально сохраняем поля, которых пока нет в backend-ручке.
      try {
        await storage.set('ur_driver_vehicle', JSON.stringify({
          truck_type: truckType,
          capacity_kg: parseInt(capacityKg.replace(/\D/g, ''), 10) || null,
          routes: routes.trim() || null,
        }));
      } catch {}
      setRole('driver');
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main', params: { role: 'driver' } }],
      });
    } finally {
      setBusy(false);
    }
  };

  const onSkip = () => {
    if (busy) return;
    setRole('driver');
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { role: 'driver' } }],
    });
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="profile-driver-v2-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Feather name="arrow-left" size={22} color={brand.textPrimary} />
          </TouchableOpacity>
          <View style={s.rolePill}>
            <Feather name="truck" size={14} color={brand.primary} />
            <Text style={s.rolePillText}>{t('role_v2_driver_card_title')}</Text>
          </View>
          <View style={s.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.title}>{t('profile_v2_driver_title')}</Text>
          <Text style={s.subtitle}>{t('profile_v2_driver_subtitle')}</Text>

          {/* Name */}
          <View style={s.field}>
            <Text style={s.label}>{t('profile_v2_name_label')}</Text>
            <TextInput
              value={name}
              onChangeText={(v) => { setName(v); if (errors.name) setErrors({ ...errors, name: null }); }}
              placeholder={t('profile_v2_name_placeholder')}
              placeholderTextColor={brand.textTertiary}
              style={[s.input, errors.name && s.inputError]}
              autoCapitalize="words"
              testID="profile-v2-name"
            />
            {errors.name ? <Text style={s.errText}>{errors.name}</Text> : null}
          </View>

          {/* City */}
          <View style={s.field}>
            <Text style={s.label}>{t('profile_v2_driver_city_label')}</Text>
            <TextInput
              value={city}
              onChangeText={(v) => { setCity(v); if (errors.city) setErrors({ ...errors, city: null }); }}
              placeholder={t('profile_v2_city_placeholder')}
              placeholderTextColor={brand.textTertiary}
              style={[s.input, errors.city && s.inputError]}
              testID="profile-v2-city"
            />
            {errors.city ? <Text style={s.errText}>{errors.city}</Text> : null}
          </View>

          {/* Truck type */}
          <View style={s.field}>
            <Text style={s.label}>{t('profile_v2_truck_type_label')}</Text>
            <View style={s.chipsRow}>
              {TRUCK_TYPES.map((tt) => {
                const active = truckType === tt.id;
                return (
                  <TouchableOpacity
                    key={tt.id}
                    onPress={() => { setTruckType(tt.id); if (errors.truckType) setErrors({ ...errors, truckType: null }); }}
                    activeOpacity={0.85}
                    testID={`profile-v2-truck-${tt.id}`}
                    style={[
                      s.chip,
                      active && { backgroundColor: brand.primarySoft, borderColor: brand.primary },
                    ]}
                  >
                    <Feather name={tt.icon} size={14} color={active ? brand.primary : brand.textSecondary} />
                    <Text style={[s.chipText, active && { color: brand.primary, fontWeight: '800' }]}>
                      {t(tt.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {errors.truckType ? <Text style={s.errText}>{errors.truckType}</Text> : null}
          </View>

          {/* Capacity */}
          <View style={s.field}>
            <Text style={s.label}>{t('profile_v2_capacity_label')}</Text>
            <TextInput
              value={capacityKg}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, '').slice(0, 6);
                setCapacityKg(digits);
                if (errors.capacityKg) setErrors({ ...errors, capacityKg: null });
              }}
              placeholder="20000"
              placeholderTextColor={brand.textTertiary}
              style={[s.input, errors.capacityKg && s.inputError]}
              keyboardType="number-pad"
              testID="profile-v2-capacity"
            />
            {errors.capacityKg ? <Text style={s.errText}>{errors.capacityKg}</Text> : null}
          </View>

          {/* Routes (optional) */}
          <View style={s.field}>
            <Text style={s.label}>{t('profile_v2_routes_label')}</Text>
            <TextInput
              value={routes}
              onChangeText={setRoutes}
              placeholder={t('profile_v2_routes_placeholder')}
              placeholderTextColor={brand.textTertiary}
              style={[s.input, { minHeight: 56 }]}
              multiline
              testID="profile-v2-routes"
            />
            <Text style={s.fieldHint}>{t('profile_v2_optional_hint')}</Text>
          </View>
        </ScrollView>

        <View style={s.ctaWrap}>
          <TouchableOpacity
            onPress={onFinish}
            disabled={busy}
            activeOpacity={0.9}
            accessibilityRole="button"
            testID="profile-v2-finish"
            style={[s.ctaPrimary, { backgroundColor: brand.primary }]}
          >
            {busy ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text style={s.ctaPrimaryText}>{t('profile_v2_finish')}</Text>
                <Feather name="arrow-right" size={20} color="#FFF" />
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onSkip} disabled={busy} style={s.skipBtn} testID="profile-v2-skip">
            <Text style={s.skipText}>{t('profile_v2_skip')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: brand.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  rolePillText: {
    ...typography.caption,
    color: brand.primary,
    fontWeight: '800',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  title: {
    ...typography.h1,
    color: brand.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    ...typography.body,
    color: brand.textSecondary,
    marginBottom: 20,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    ...typography.bodySmall,
    color: brand.textPrimary,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.surface,
    paddingHorizontal: 14,
    ...typography.bodyLarge,
    color: brand.textPrimary,
  },
  inputError: {
    borderColor: brand.error,
  },
  errText: {
    ...typography.caption,
    color: brand.error,
    marginTop: 4,
  },
  fieldHint: {
    ...typography.caption,
    color: brand.textTertiary,
    marginTop: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.surface,
  },
  chipText: {
    ...typography.bodySmall,
    color: brand.textSecondary,
    fontWeight: '600',
  },
  ctaWrap: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: brand.divider,
    backgroundColor: brand.bg,
  },
  ctaPrimary: {
    height: 56,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  ctaPrimaryText: {
    ...typography.button,
    color: brand.textOnPrimary,
    flex: 1,
    textAlign: 'center',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  skipText: {
    ...typography.bodySmall,
    color: brand.textSecondary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
