import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Modal, Dimensions, ScrollView, Alert, Platform } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import * as ImagePicker from 'expo-image-picker';
import { useI18n } from '../utils/useI18n';

const MAX_PHOTOS = 5;

// HOT-005: источник фото — камера или галерея.
// На web камера в ImagePicker нестабильна — показываем только галерею.
const choosePhotoSource = (t) => new Promise((resolve) => {
  if (Platform.OS === 'web') return resolve('gallery');
  Alert.alert(
    t('photo_source'),
    null,
    [
      { text: t('photo_camera'), onPress: () => resolve('camera') },
      { text: t('photo_gallery'), onPress: () => resolve('gallery') },
      { text: t('photo_cancel'), style: 'cancel', onPress: () => resolve(null) },
    ],
    { cancelable: true, onDismiss: () => resolve(null) }
  );
});

// Мини-галерея для добавления (форма публикации груза)
export const PhotoPicker = ({ photos = [], onChange }) => {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);

  const runSource = async (source) => {
    if (photos.length >= MAX_PHOTOS) return;
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(t('photo_camera_permission'));
          return;
        }
        const r = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
          allowsEditing: false,
        });
        if (!r.canceled && r.assets?.[0]) {
          onChange([...photos, r.assets[0].uri].slice(0, MAX_PHOTOS));
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(t('photo_gallery_permission'));
          return;
        }
        const r = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
          allowsMultipleSelection: true,
          selectionLimit: MAX_PHOTOS - photos.length,
        });
        if (!r.canceled && r.assets?.length) {
          const newUris = r.assets.map(a => a.uri);
          onChange([...photos, ...newUris].slice(0, MAX_PHOTOS));
        }
      }
    } catch {}
  };

  const pick = async () => {
    if (photos.length >= MAX_PHOTOS) return;
    if (Platform.OS === 'web') {
      return runSource('gallery');
    }
    // Открываем bottom sheet с выбором источника (работает и на iOS, и на Android)
    setSheetOpen(true);
  };

  const remove = (i) => onChange(photos.filter((_, idx) => idx !== i));

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={p.scrollWrap}>
        {photos.map((uri, i) => (
          <View key={i} style={p.item}>
            <Image source={{ uri }} style={p.img} />
            <TouchableOpacity style={p.removeBtn} onPress={() => remove(i)}>
              <Text style={p.removeBtnText}>✕</Text>
            </TouchableOpacity>
            {i === 0 && <View style={p.mainBadge}><Text style={p.mainBadgeText}>★</Text></View>}
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <TouchableOpacity style={[p.addBtn, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={pick}>
            <Text style={{ fontSize: 28 }}>📷</Text>
            <Text style={[p.addBtnText, { color: theme.textSecondary }]}>{t('addCargoPhoto')}</Text>
            <Text style={[p.counter, { color: theme.textMuted }]}>{photos.length}/{MAX_PHOTOS}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* HOT-005: выбор источника — камера или галерея */}
      <Modal transparent visible={sheetOpen} animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <TouchableOpacity style={p.sourceBackdrop} activeOpacity={1} onPress={() => setSheetOpen(false)}>
          <View style={[p.sourceSheet, { backgroundColor: theme.cardElevated || theme.card }]}>
            <Text style={[p.sourceTitle, { color: theme.text }]}>{t('photo_source')}</Text>
            <TouchableOpacity
              style={[p.sourceBtn, { borderColor: theme.border }]}
              onPress={() => { setSheetOpen(false); runSource('camera'); }}
            >
              <Text style={[p.sourceBtnText, { color: theme.text }]}>{t('photo_camera')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[p.sourceBtn, { borderColor: theme.border }]}
              onPress={() => { setSheetOpen(false); runSource('gallery'); }}
            >
              <Text style={[p.sourceBtnText, { color: theme.text }]}>{t('photo_gallery')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[p.sourceBtn, { borderColor: 'transparent' }]}
              onPress={() => setSheetOpen(false)}
            >
              <Text style={[p.sourceBtnText, { color: theme.textMuted }]}>{t('photo_cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// Галерея просмотра (CargoDetail)
export const PhotoGallery = ({ photos = [] }) => {
  const { theme } = useTheme();
  const [activeIdx, setActiveIdx] = useState(null);
  const screenWidth = Dimensions.get('window').width;

  if (!photos.length) return null;

  return (
    <View style={g.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={g.gallery}>
        {photos.map((uri, i) => (
          <TouchableOpacity key={i} onPress={() => setActiveIdx(i)} style={g.thumb}>
            <Image source={{ uri }} style={g.thumbImg} />
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={[g.count, { color: theme.textMuted }]}>📸 {photos.length} фото · нажмите чтобы увеличить</Text>

      <Modal visible={activeIdx !== null} transparent animationType="fade" onRequestClose={() => setActiveIdx(null)}>
        <View style={g.viewer}>
          <TouchableOpacity style={g.closeViewer} onPress={() => setActiveIdx(null)}>
            <Text style={g.closeViewerText}>✕</Text>
          </TouchableOpacity>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: (activeIdx || 0) * screenWidth, y: 0 }}
          >
            {photos.map((uri, i) => (
              <View key={i} style={{ width: screenWidth, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={{ uri }} style={{ width: screenWidth, height: '100%', resizeMode: 'contain' }} />
              </View>
            ))}
          </ScrollView>
          <View style={g.viewerFooter}>
            <Text style={g.viewerCount}>{(activeIdx || 0) + 1} / {photos.length}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const p = StyleSheet.create({
  scrollWrap: { gap: 10, paddingVertical: 4 },
  item: { width: 100, height: 100, position: 'relative' },
  img: { width: 100, height: 100, borderRadius: 12 },
  removeBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  mainBadge: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: '#FBBF24', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  mainBadgeText: { color: '#0C0A09', fontSize: 11, fontWeight: '900' },
  addBtn: {
    width: 100, height: 100,
    borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addBtnText: { fontSize: 11, fontWeight: '600', textAlign: 'center', paddingHorizontal: 4 },
  counter: { fontSize: 11, fontWeight: '700' },
  sourceBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sourceSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  sourceTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 14 },
  sourceBtn: { paddingVertical: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginBottom: 8 },
  sourceBtnText: { fontSize: 15, fontWeight: '700' },
});

const g = StyleSheet.create({
  wrap: { marginBottom: 12 },
  gallery: { gap: 8, paddingBottom: 6 },
  thumb: { width: 140, height: 140, borderRadius: 14, overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
  count: { fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  viewer: { flex: 1, backgroundColor: '#000' },
  closeViewer: { position: 'absolute', top: 50, right: 20, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  closeViewerText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  viewerFooter: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center' },
  viewerCount: { color: '#fff', fontSize: 14, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, overflow: 'hidden' },
});

export default PhotoGallery;
