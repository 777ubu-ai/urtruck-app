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
import {v1Colors, useV1Colors, v1Spacing, v1Typography, v1AccentFor, v1Radius} from '../theme/designV1';

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
    saveProfile(userId, {
      avatar_url: avatar,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      display_name: fullName,
      full_name: fullName,
      city,
      email: email.trim(),
      company: company.trim(),
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
    toast(serverOk ? '✓ ' + t('saveSettings') : '✓ ' + t('saved_locally'), serverOk ? 'success' : 'warn');
    navigation.goBack();
  };

  return (
    <Screen>
      <BrandHeader onBack={() => navigation.goBack()} accent={accent.main} compact />

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

