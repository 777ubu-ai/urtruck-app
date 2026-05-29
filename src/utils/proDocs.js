// PR-D1: PRO-документы водителя (TIR / CMR / загранпаспорт).
//
// По решению владельца (build 18): эти файлы кладём напрямую в
// Supabase Storage (bucket `pro-documents`) и записываем public URL
// в профиль через regAPI.updateProfile.
//
// Это сознательный downgrade vs регистрационных документов (license,
// passport-ТС), которые проходят через FastAPI + OCR — у PRO-документов
// OCR пока не требуется, важна только сама фотография как proof.
// Бэкенд может добавить ручную модерацию позже.
//
// Bucket должен быть создан в Supabase UI / SQL заранее:
//   create bucket pro-documents (public read = true)
//   RLS: только authenticated может писать, путь {user_id}/*
//
// Если bucket недоступен — функция возвращает { ok: false, detail }
// и UI показывает ошибку без падения экрана.

import { supabase } from '../config/supabase';
import { compressImage } from './imageCompress';
import { regAPI } from './registration';

const BUCKET = 'pro-documents';

const KIND_TO_FIELD = {
  passport_intl: 'passport_intl_url',
  tir:           'tir_book_url',
  cmr:           'cmr_insurance_url',
};

function makePath(userId, kind, ext = 'jpg') {
  const safeId = (userId || 'guest').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
  // Bucket policy ожидает {user_id}/{filename}. Timestamp в имени —
  // чтобы не перетирать предыдущую загрузку (история сохраняется).
  return `${safeId}/${kind}_${Date.now()}.${ext}`;
}

/**
 * Загружает PRO-документ в Supabase Storage и сохраняет URL в профиль.
 *
 * @param {object} args
 * @param {string} args.userId — id водителя (для path в bucket)
 * @param {'passport_intl'|'tir'|'cmr'} args.kind — тип документа
 * @param {string} args.uri — локальный URI с ImagePicker
 * @param {(stage: 'compressing'|'uploading') => void} [args.onProgress]
 * @returns {{ ok: boolean, url?: string, detail?: string }}
 */
export async function uploadProDoc({ userId, kind, uri, onProgress }) {
  if (!KIND_TO_FIELD[kind]) {
    return { ok: false, detail: 'unknown_kind' };
  }
  try {
    onProgress?.('compressing');
    const compressedUri = await compressImage(uri, { preset: 'document' });
    const blob = await fetch(compressedUri).then((r) => r.blob());

    onProgress?.('uploading');
    const path = makePath(userId, kind);
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, {
        contentType: blob.type || 'image/jpeg',
        upsert: false,
      });
    if (upErr) {
      return { ok: false, detail: upErr.message || 'upload_failed' };
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = pub?.publicUrl;
    if (!url) return { ok: false, detail: 'no_public_url' };

    // Записываем URL в профиль через тот же PATCH /users/me.
    // Если backend ещё не знает поле — он молча игнорирует, URL всё
    // равно есть в локальном store (вызывающий код подхватит).
    //
    // Edge case (трасса, плохая связь): файл УЖЕ улетел в Supabase,
    // но PATCH упал по сети. Не откатываем успех — URL и так публичен,
    // следующий save профиля дотолкает его до сервера. Возвращаем
    // syncWarn чтобы UI мог показать «фото загружено, синхр позже»
    // вместо полного «ошибка».
    const field = KIND_TO_FIELD[kind];
    let syncWarn = null;
    try {
      const patchRes = await regAPI.updateProfile({ [field]: url });
      if (!patchRes?.ok) syncWarn = patchRes?.detail || 'sync_pending';
    } catch (syncErr) {
      syncWarn = syncErr?.message || 'sync_failed';
    }

    return { ok: true, url, field, syncWarn };
  } catch (e) {
    return { ok: false, detail: e?.message || String(e) };
  }
}

export const PRO_DOC_KINDS = Object.keys(KIND_TO_FIELD);
export const PRO_DOC_FIELDS = Object.values(KIND_TO_FIELD);
