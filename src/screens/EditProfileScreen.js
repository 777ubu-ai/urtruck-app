import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useI18n } from '../utils/useI18n';
import { useAuth } from '../utils/AuthContext';
import { useToast } from '../components/Toast';
import { getProfile, saveProfile } from '../utils/store';
import { storage } from '../utils/storage';
import { API_BASE } from '../config/env';
import Screen from '../components/ui/v1/Screen';
import BrandHeader from '../components/ui/v1/BrandHeader';
import Field from '../components/ui/v1/Field';
import PrimaryButton from '../components/ui/v1/PrimaryButton';
import HelpButton from '../components/HelpButton';
import { useDraft, clearDraft } from '../utils/useDraft';
import {v1Colors, useV1Colors, v1Spacing, v1Typography, v1AccentFor, v1Radius} from '../theme/designV1';

const BORDERS = ['Нур Жолы', 'Калжат', 'Достык', 'Бахты', 'Майкапчагай', 'Хоргос'];

// EditProfileScreen — design v1, screens 05 (driver) & 06 (cargo owner).
//
// Backend logic preserved:
//   - PATCH /api/v1/users/me with {name, city, about}
//   - local saveProfile() mirror so ProfileScreen sees the new values immediately
// Vehicle / plate / capacity edit fields existed in the previous version of
// this screen — they're temporarily out of stage 1 (no macro covers them).
// Existing values are kept untouched in the local profile cache; a future
// stage-2 "Transport" screen will edit them. Nothing is lost.

export default function EditProfileScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({

  title: { ...v1Typography.h1, textAlign: 'center', marginTop: v1Spacing.md },
  subtitle: { ...v1Typography.bodyMd, textAlign: 'center', marginTop: 6, marginBottom: v1Spacing.md },
  avatarWrap: { alignItems: 'center', marginVertical: v1Spacing.md, gap: 6 },
  avatar: {
    width: 86, height: 86, borderRadius: 43, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarPlaceholder: { fontSize: 36 },
  cameraBadge: {
    position: 'absolute', bottom: 4, right: -4,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: v1.bg,
  },
  cameraIcon: { fontSize: 12 },
  avatarHint: { fontSize: 12, fontWeight: '700' },
  infoBox: {
    borderWidth: 1, borderRadius: v1Radius.field,
    padding: 12, marginTop: v1Spacing.sm, marginBottom: v1Spacing.md,
  },
  infoText: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  skipRow: { alignItems: 'center', marginTop: v1Spacing.md, paddingVertical: 8 },
  skipText: { fontSize: 13, fontWeight: '700' },

  // PR-D1: PRO-секция (driver only)
  proSection: { marginTop: v1Spacing.md },
  proSectionTitle: {
    fontSize: 11, fontWeight: '800', color: v1.textMuted,
    letterSpacing: 0.6, textTransform: 'uppercase',
    marginTop: v1Spacing.md, marginBottom: 6, marginLeft: 4,
  },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  radioDot: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  radioInner: { width: 8, height: 8, borderRadius: 4 },
  radioLabel: { fontSize: 14, color: v1.text },
  bordersWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  borderChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1,
  },
  borderChipText: { fontSize: 12, fontWeight: '600' },
  helpRow: { position: 'absolute', top: 8, right: 8, zIndex: 10 },

  }), [v1]);
  const { role } = route.params || {};
  const isDriver = role === 'driver';
  const accent = v1AccentFor(role);
  const accentKey = isDriver ? 'driver' : 'cargo';
  const { t } = useI18n();
  const { session } = useAuth();
  const { toast } = useToast();

  const userId = session?.user?.id;
  const profile = getProfile(userId) || {};

  const [avatar, setAvatar] = useState(profile.avatar_url || null);
  const [firstName, setFirstName] = useState(profile.first_name || (profile.display_name || '').split(' ')[0] || '');
  const [lastName, setLastName] = useState(profile.last_name || (profile.display_name || '').split(' ').slice(1).join(' ') || '');
  const [phone] = useState(session?.user?.phone || '+7 (***) ***-**-**');
  const [city, setCity] = useState(profile.city || '');
  const [email, setEmail] = useState(profile.email || '');
  const [company, setCompany] = useState(profile.company || '');
  const [saving, setSaving] = useState(false);

  // PR-D1: PRO-секция (только водитель). Минимальный набор по спеке
  // driver_onboarding §2/Экран 3. Документы (passport_intl/tir/cmr) пока
  // не выносим в редактор — для них есть отдельный flow в RegScreen step 3
  // (OCR + загрузка фото). Здесь — то, что водитель может заполнить
  // быстро текстом / селектом.
  const [legalForm, setLegalForm] = useState(profile.legal_form || 'individual');
  const [chinaExp, setChinaExp] = useState(profile.china_experience_years != null ? String(profile.china_experience_years) : '');
  const [favBorders, setFavBorders] = useState(Array.isArray(profile.favorite_borders) ? profile.favorite_borders : []);
  const [emergency, setEmergency] = useState(profile.emergency_contact || '');

  // Draft mode: автосохранение полей на каждом onChange. Восстанавливается
  // при mount, очищается после успешного save.
  const draftKey = `edit_profile_${userId || 'guest'}_${role || 'na'}`;
  useDraft(
    draftKey,
    { firstName, lastName, city, email, company, legalForm, chinaExp, favBorders, emergency },
    { setFirstName, setLastName, setCity, setEmail, setCompany, setLegalForm, setChinaExp, setFavBorders, setEmergency },
  );

  const toggleBorder = (b) => {
    setFavBorders((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]);
  };

  const pickAvatar = async () => {
    // Stage 21: previously this swallowed permission denials and
    // any picker errors silently — the user tapped 📷 and nothing
    // happened. Now permission status is surfaced as a toast so
    // the user knows to grant access in system settings.
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        toast(t('photo_permission_required') || 'Разрешите доступ к фото в настройках', 'warn');
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!r.canceled && r.assets?.[0]) {
        setAvatar(r.assets[0].uri);
      }
    } catch (e) {
      toast(t('photo_pick_failed') || 'Не удалось выбрать фото', 'error');
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const fullName = [firstName, lastName].map((s) => (s || '').trim()).filter(Boolean).join(' ');
    const chinaExpNum = parseInt(chinaExp, 10);
    saveProfile(userId, {
      avatar_url: avatar,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      display_name: fullName,
      full_name: fullName,
      city,
      email: email.trim(),
      company: company.trim(),
      // PR-D1: PRO-поля. Сохраняются локально (store) — серверный sync
      // /users/me пока принимает только {name, city, about}, расширенные
      // PRO-поля live на фронте до тех пор, пока backend не получит
      // отдельный endpoint /api/v1/drivers/pro (вне scope этого PR).
      ...(isDriver ? {
        legal_form: legalForm,
        china_experience_years: Number.isFinite(chinaExpNum) ? chinaExpNum : null,
        favorite_borders: favBorders,
        emergency_contact: emergency.trim(),
      } : {}),
    });
    let serverOk = false;
    try {
      const token = await storage.get('ur_reg_token');
      if (token) {
        const r = await fetch(`${API_BASE}/users/me`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ name: fullName, city, about: profile.bio || '' }),
        });
        serverOk = r.ok;
      }
    } catch {}
    setSaving(false);
    await clearDraft(draftKey);
    toast(serverOk ? '✓ ' + t('saveSettings') : '✓ ' + t('saved_locally'), serverOk ? 'success' : 'warn');
    navigation.goBack();
  };

  return (
    <Screen>
      <BrandHeader onBack={() => navigation.goBack()} accent={accent.main} compact />
      <View style={s.helpRow}>
        <HelpButton accent={accent.main} />
      </View>

      <Text style={s.title}>
        {isDriver ? t('profile_setup_driver_title') : t('profile_setup_client_title')}
      </Text>
      <Text style={s.subtitle}>
        {isDriver ? t('profile_setup_driver_subtitle') : t('profile_setup_client_subtitle')}
      </Text>

      <View style={s.avatarWrap}>
        <TouchableOpacity onPress={pickAvatar} activeOpacity={0.85}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={[s.avatar, { borderColor: accent.main }]} />
          ) : (
            <View style={[s.avatar, { borderColor: accent.main, backgroundColor: accent.soft }]}>
              <Text style={s.avatarPlaceholder}>👤</Text>
            </View>
          )}
          <View style={[s.cameraBadge, { backgroundColor: accent.main }]}>
            <Text style={s.cameraIcon}>📷</Text>
          </View>
        </TouchableOpacity>
        <Text style={[s.avatarHint, { color: accent.main }]}>{t('profile_setup_add_photo')}</Text>
      </View>

      <Field icon="👤" label={t('signup_field_first_name')} value={firstName} onChangeText={setFirstName} placeholder={t('signup_field_first_name')} />
      <Field icon="👤" label={t('signup_field_last_name')} value={lastName} onChangeText={setLastName} placeholder={t('signup_field_last_name')} />
      <Field icon="📞" label={t('signup_field_phone')} value={phone} onChangeText={() => {}} editable={false} />
      {/* Stage 21: previously these were `Field variant="dropdown"`
          with `onPress={() => {}}` — taps did nothing, so users
          reported "страна не выбирается" and "город не выбирается".
          For the pilot we only ship in KZ, so country is read-only
          (with the right flag/copy), and city becomes a free-text
          field — same shape as RegScreen for the client flow.
          Picker UI for multi-country onboarding is tracked
          separately. */}
      <Field
        icon="🌐"
        label={t('signup_field_country')}
        value={t('country_kazakhstan')}
        editable={false}
      />
      <Field
        icon="📍"
        label={t('signup_field_city')}
        value={city}
        onChangeText={setCity}
        placeholder={t('signup_city_pick')}
      />
      {!isDriver ? (
        <Field
          icon="🏢"
          label={t('signup_field_company')}
          placeholder={t('signup_field_company_optional')}
          value={company}
          onChangeText={setCompany}
        />
      ) : null}
      <Field
        icon="✉️"
        label={t('signup_field_email_optional')}
        value={email}
        onChangeText={setEmail}
        placeholder="email@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      {/* PR-D1: PRO-секция — расширенный профиль водителя. Скрыта для клиента.
          Категории по спеке driver_onboarding.md §2 Экран 3:
          ① Юр. статус (Radio), ② Опыт с Китаем (число), ③ Любимые
          погранпереходы (chips multi-select), ④ Экстренный контакт.
          Документы PRO (TIR/CMR/загранпаспорт) обрабатываются в RegScreen
          step 3 через OCR — не дублируем здесь. */}
      {isDriver ? (
        <View style={s.proSection}>
          <Text style={s.proSectionTitle}>{t('pro_section_legal')}</Text>
          {[
            { k: 'individual', label: t('pro_legal_individual') },
            { k: 'ip',         label: t('pro_legal_ip') },
            { k: 'too',        label: t('pro_legal_too') },
          ].map((opt) => {
            const checked = legalForm === opt.k;
            return (
              <TouchableOpacity key={opt.k} style={s.radioRow} onPress={() => setLegalForm(opt.k)} activeOpacity={0.7}>
                <View style={[s.radioDot, { borderColor: checked ? accent.main : v1.border }]}>
                  {checked ? <View style={[s.radioInner, { backgroundColor: accent.main }]} /> : null}
                </View>
                <Text style={s.radioLabel}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}

          <Text style={s.proSectionTitle}>{t('pro_section_routes')}</Text>
          <Field
            icon="🛣"
            label={t('pro_field_china_experience')}
            value={chinaExp}
            onChangeText={(v) => setChinaExp(v.replace(/\D/g, '').slice(0, 2))}
            placeholder="5"
            keyboardType="number-pad"
          />
          <View style={{ marginBottom: v1Spacing.sm }}>
            <Text style={[v1Typography.small, { color: v1.textMuted, marginBottom: 6, marginLeft: 4 }]}>
              {t('pro_field_favorite_borders')}
            </Text>
            <View style={s.bordersWrap}>
              {BORDERS.map((b) => {
                const active = favBorders.includes(b);
                return (
                  <TouchableOpacity
                    key={b}
                    style={[s.borderChip, {
                      backgroundColor: active ? accent.soft : v1.bg,
                      borderColor: active ? accent.main : v1.border,
                    }]}
                    onPress={() => toggleBorder(b)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.borderChipText, { color: active ? accent.main : v1.textMuted }]}>{b}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <Text style={s.proSectionTitle}>{t('pro_section_emergency')}</Text>
          <Field
            icon="🆘"
            label={t('pro_field_emergency_contact')}
            value={emergency}
            onChangeText={setEmergency}
            placeholder="+7 777 ___ __ __"
            keyboardType="phone-pad"
            helper={t('pro_field_emergency_hint')}
          />
        </View>
      ) : null}

      <View style={[s.infoBox, { backgroundColor: accent.soft, borderColor: accent.main }]}>
        <Text style={[s.infoText, { color: accent.main }]} numberOfLines={2}>
          {isDriver ? `🛡  ${t('profile_setup_info_driver')}` : `🛡  ${t('profile_setup_info_client')}`}
        </Text>
      </View>

      <PrimaryButton
        label={t('profile_setup_save')}
        onPress={save}
        loading={saving}
        accent={accentKey}
        testID="profile-save"
        style={{ marginTop: v1Spacing.sm }}
      />

      <TouchableOpacity onPress={() => navigation.goBack()} style={s.skipRow} activeOpacity={0.7}>
        <Text style={[s.skipText, { color: accent.main }]}>{t('profile_setup_skip')}</Text>
      </TouchableOpacity>
    </Screen>
  );
}

