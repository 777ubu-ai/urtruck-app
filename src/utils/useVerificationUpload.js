// useVerificationUpload — shared hook для PHOTO upload-шагов верификации.
//
// Делает 3 вещи:
//   1) Запрашивает разрешения камеры/галереи (через expo-image-picker).
//   2) Открывает камеру или галерею по запросу.
//   3) Передаёт URI в `uploader(uri, ...args)` — это любая из regAPI-функций
//      (uploadSelfie / uploadLicense / uploadVehiclePhoto / etc.).
//
// Используется НОВЫМИ verification-screens (см. src/screens/verification/*).
// Существующие IdentityStepScreen / SelfieStepScreen / VehicleDocsScreen /
// VehiclePhotosScreen НЕ тронуты — у них есть собственная работающая
// upload-логика, которая остаётся источником истины для production-flow.
// Эти new screens — обёртка с новой версткой (PR #105 design references).
//
// Behavior contract:
//   const { busy, localUri, openCamera, openGallery, error } =
//     useVerificationUpload(uploader, { mode: 'camera-only' | 'camera+gallery' });
//
//   - busy        — true пока picker открыт или upload в полёте
//   - localUri    — последний выбранный/снятый URI (превью)
//   - openCamera  — async () => void
//   - openGallery — async () => void (no-op для camera-only mode)
//   - error       — последняя ошибка (i18n-ключ или null)
//
// Permissions UX:
//   - 1-st run: показываем системный диалог
//   - 2-nd run если denied: тостим понятный RU-текст
//   - НЕ просим разрешения для галереи при camera-only mode (это не нужно)

import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useI18n } from './useI18n';
import { useToast } from '../components/Toast';

const PICKER_OPTS = {
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  quality: 0.7,
  allowsEditing: false,
};

export function useVerificationUpload(uploader, { mode = 'camera+gallery', extraArgs = [] } = {}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [localUri, setLocalUri] = useState(null);
  const [error, setError] = useState(null);

  const runUpload = useCallback(async (uri) => {
    setLocalUri(uri);
    setError(null);
    setBusy(true);
    try {
      const res = await uploader(...extraArgs, uri);
      // По умолчанию uploader возвращает { ok, ... } или throw.
      // Несовместимые ответы не считаем успешными.
      if (res && res.ok === false) {
        const msg = res.detail || t('verification_upload_failed');
        setError(msg);
        toast(msg, 'error');
        return false;
      }
      toast('✓ ' + t('verification_upload_ok'), 'success');
      return true;
    } catch (e) {
      const msg = (e && e.message) || t('no_connection');
      setError(msg);
      toast(msg, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }, [uploader, extraArgs, t, toast]);

  const openCamera = useCallback(async () => {
    if (busy) return;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        const msg = t('verification_camera_denied');
        setError(msg);
        toast(msg, 'error');
        return;
      }
      const r = await ImagePicker.launchCameraAsync(PICKER_OPTS);
      if (r.canceled || !r.assets || !r.assets.length) return;
      await runUpload(r.assets[0].uri);
    } catch (e) {
      const msg = t('verification_camera_failed');
      setError(msg);
      toast(msg, 'error');
    }
  }, [busy, runUpload, t, toast]);

  const openGallery = useCallback(async () => {
    if (busy) return;
    if (mode === 'camera-only') return; // мы не должны были сюда попасть
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const msg = t('verification_gallery_denied');
        setError(msg);
        toast(msg, 'error');
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync(PICKER_OPTS);
      if (r.canceled || !r.assets || !r.assets.length) return;
      await runUpload(r.assets[0].uri);
    } catch (e) {
      const msg = t('verification_gallery_failed');
      setError(msg);
      toast(msg, 'error');
    }
  }, [busy, mode, runUpload, t, toast]);

  return { busy, localUri, openCamera, openGallery, error };
}
