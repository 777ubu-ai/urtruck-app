// PRO documents are uploaded through the authenticated UrTruck backend.
// The backend stores an opaque private-storage reference and returns only a
// short-lived signed URL to the authenticated owner. No public bucket URL is
// persisted by the mobile/web client.
import { regAPI } from './registration';

const KIND_TO_FIELD = {
  passport_intl: 'passport_intl_url',
  tir: 'tir_book_url',
  cmr: 'cmr_insurance_url',
};

export async function uploadProDoc({ userId: _userId, kind, uri, onProgress }) {
  if (!KIND_TO_FIELD[kind]) return { ok: false, detail: 'unknown_kind' };
  if (!uri) return { ok: false, detail: 'no_uri' };
  const result = await regAPI.uploadProDoc(kind, uri, onProgress);
  return { ...result, field: result?.field || KIND_TO_FIELD[kind] };
}

export const PRO_DOC_KINDS = Object.keys(KIND_TO_FIELD);
export const PRO_DOC_FIELDS = Object.values(KIND_TO_FIELD);
