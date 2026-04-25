import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { useToast } from '../components/Toast';
import { getProfile, saveProfile } from '../utils/store';
import ShimmerButton from '../components/ShimmerButton';
import GradientText from '../components/GradientText';
import CityInput from '../components/CityInput';
import { API_BASE } from '../config/env';

export default function EditProfileScreen({ navigation, route }) {
  const { role } = route.params || {};
  const isDriver = role === 'driver';
  const accent = isDriver ? '#2563EB' : '#F59E0B';
  const { t } = useI18n();
  const { theme } = useTheme();
  const { session } = useAuth();
  const { toast } = useToast();

  const userId = session?.user?.id;
  const profile = getProfile(userId) || {};

  const [avatar, setAvatar] = useState(profile.avatar_url || null);
  const [displayName, setDisplayName] = useState(profile.display_name || '');
  const [city, setCity] = useState(profile.city || '');
  const [volume, setVolume] = useState(String(profile.volume_m3 || ''));
  const [tonnage, setTonnage] = useState(String(profile.capacity_tons || ''));
  const [plateTruck, setPlateTruck] = useState(profile.plate_truck || '');
  const [plateTrailer, setPlateTrailer] = useState(profile.plate_trailer || '');
  const [bio, setBio] = useState(profile.bio || '');

  const pickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6, allowsEditing: true, aspect: [1, 1] });
      if (!r.canceled && r.assets?.[0]) setAvatar(r.assets[0].uri);
    } catch {}
  };

  const save = async () => {
    // Локально (сразу видно в ProfileScreen)
    saveProfile(userId, {
      avatar_url: avatar,
      display_name: displayName,
      full_name: displayName,
      city,
      volume_m3: parseInt(volume) || profile.volume_m3 || 0,
      capacity_tons: parseInt(tonnage) || profile.capacity_tons || 0,
      plate_truck: plateTruck,
      plate_trailer: plateTrailer,
      bio,
    });
    // Серверно — с проверкой что реально сохранилось
    let serverOk = false;
    try {
      const { storage } = require('../utils/storage');
      const token = await storage.get('ur_reg_token');
      if (token) {
        const r = await fetch(`${API_BASE}/users/me`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ name: displayName, city, about: bio }),
        });
        serverOk = r.ok;
      }
    } catch (e) {
      console.warn('Server profile save failed:', e);
    }
    toast(serverOk ? '✓ ' + t('saveSettings') : '✓ Сохранено локально', serverOk ? 'success' : 'warn');
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.backText, { color: theme.text }]}>‹</Text>
          </TouchableOpacity>
          <GradientText style={s.title} colors={[accent, '#22C55E']}>✏️ {t('editProfileTitle')}</GradientText>
        </View>

        {/* Аватар */}
        <View style={s.avatarWrap}>
          <TouchableOpacity onPress={pickAvatar}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={[s.avatar, { borderColor: accent }]} />
            ) : (
              <View style={[s.avatarEmpty, { backgroundColor: theme.card, borderColor: accent }]}>
                <Text style={{ fontSize: 48 }}>{isDriver ? '🚛' : '📦'}</Text>
              </View>
            )}
            <View style={[s.cameraBtn, { backgroundColor: accent }]}>
              <Text style={{ fontSize: 14 }}>📷</Text>
            </View>
          </TouchableOpacity>
          <Text style={[s.avatarHint, { color: theme.textMuted }]}>{t('avatar_change_hint')}</Text>
        </View>

        {/* Основные поля */}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionLabel, { color: theme.textMuted }]}>{t('section_main')}</Text>

          <Text style={[s.label, { color: theme.textMuted }]}>{isDriver ? t('field_name') : t('companyName')}</Text>
          <TextInput
            style={[s.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={isDriver ? 'Ержан К.' : 'ТОО Карго-Трейд'}
            placeholderTextColor={theme.textMuted}
          />

          <Text style={[s.label, { color: theme.textMuted }]}>{t('city')}</Text>
          <View style={{ zIndex: 80 }}>
            <CityInput value={city} onChange={setCity} placeholder="📍 Алматы" />
          </View>

          <Text style={[s.label, { color: theme.textMuted }]}>{t('field_about')}</Text>
          <TextInput
            style={[s.input, s.textarea, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }]}
            value={bio}
            onChangeText={setBio}
            placeholder="Опытный водитель, 10 лет международных рейсов..."
            placeholderTextColor={theme.textMuted}
            multiline
          />
        </View>

        {/* Для водителя — техника */}
        {isDriver && (
          <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.sectionLabel, { color: theme.textMuted }]}>{t('section_transport')}</Text>

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: theme.textMuted }]}>{t('volume')}</Text>
                <TextInput
                  style={[s.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }]}
                  value={volume}
                  onChangeText={setVolume}
                  placeholder="120"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: theme.textMuted }]}>{t('tonnage')}</Text>
                <TextInput
                  style={[s.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }]}
                  value={tonnage}
                  onChangeText={setTonnage}
                  placeholder="22"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={[s.label, { color: theme.textMuted }]}>{t('truckPlate')}</Text>
            <TextInput
              style={[s.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }]}
              value={plateTruck}
              onChangeText={setPlateTruck}
              placeholder="A 123 BC"
              placeholderTextColor={theme.textMuted}
            />

            <Text style={[s.label, { color: theme.textMuted }]}>{t('trailerPlate')}</Text>
            <TextInput
              style={[s.input, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }]}
              value={plateTrailer}
              onChangeText={setPlateTrailer}
              placeholder="01 AB 456"
              placeholderTextColor={theme.textMuted}
            />
          </View>
        )}

        {/* Биометрия / верификация */}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionLabel, { color: theme.textMuted }]}>{t('section_verification')}</Text>
          <TouchableOpacity style={[s.verifyRow, { borderBottomColor: theme.border }]}>
            <Text style={{ fontSize: 20 }}>👤</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.verifyName, { color: theme.text }]}>Биометрия (FaceID)</Text>
              <Text style={[s.verifyDesc, { color: theme.textMuted }]}>Быстрая авторизация по лицу</Text>
            </View>
            <Text style={s.soonBadge}>Скоро</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.verifyRow, { borderBottomColor: theme.border }]}>
            <Text style={{ fontSize: 20 }}>📄</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.verifyName, { color: theme.text }]}>ИИН / ИНН</Text>
              <Text style={[s.verifyDesc, { color: theme.textMuted }]}>Проверка через госбазу</Text>
            </View>
            <Text style={s.soonBadge}>Скоро</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.verifyRow}>
            <Text style={{ fontSize: 20 }}>🏦</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.verifyName, { color: theme.text }]}>Банковский счёт</Text>
              <Text style={[s.verifyDesc, { color: theme.textMuted }]}>Приём платежей</Text>
            </View>
            <Text style={s.soonBadge}>Скоро</Text>
          </TouchableOpacity>
        </View>

        <ShimmerButton onPress={save} colors={[accent, '#22C55E']} style={{ marginTop: 10 }}>
          💾 {t('saveBtn')}
        </ShimmerButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  title: { fontSize: 22, fontWeight: '900' },
  avatarWrap: { alignItems: 'center', marginBottom: 20, gap: 8 },
  avatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 3 },
  avatarEmpty: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  cameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#0C0A09' },
  avatarHint: { fontSize: 11 },
  section: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 10 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' },
  label: { fontSize: 10, fontWeight: '700', marginBottom: 6, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { padding: 14, borderRadius: 10, fontSize: 14, borderWidth: 1, marginBottom: 4 },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  verifyName: { fontSize: 13, fontWeight: '700' },
  verifyDesc: { fontSize: 11, marginTop: 2 },
  soonBadge: { color: '#F59E0B', fontSize: 10, fontWeight: '700', backgroundColor: '#F59E0B20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
});
