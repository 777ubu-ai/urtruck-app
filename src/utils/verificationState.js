// verificationState — adapter между backend'ом `/api/v1/register/status`
// и frontend моделью карточек верификации.
//
// Backend (drivers_registration table) хранит данные по-flat-у:
//   has_selfie / has_license / has_passport / has_vehicle_photo
//   selfie_url / license_url / passport_url / vehicle_photo_url
//   full_name / iin / birth_date / phone
//   vehicle_brand / vehicle_model / vehicle_year / vehicle_plate
//   status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'manual_review'
//   rejection_reasons: { item_key: 'reason' }   ← опциональный JSON
//
// Frontend ждёт 10 карточек с независимыми статусами. Backend пока не
// разделяет license-front/back и не имеет отдельного флага для
// truck_interior. Так что:
//   - если backend есть `license_url` → license-front считаем uploaded
//   - license_back — frontend-only до тех пор, пока backend не добавит
//     поле; держим локально через draft (todo: surface to /register/
//     documents/license с side='back')
//   - truck exterior = vehicle_photo_url
//   - truck interior — backend имеет `/register/cabin-photo`; маппим
//     через has_cabin_photo если backend начнёт его выдавать; иначе
//     остаётся missing (доступ к камере не блокируется)
//
// Все edge cases обрабатываются здесь — экраны просто читают плоскую
// модель.

export const VERIFICATION_ITEMS = [
  'personalData',
  'personalPhoto',
  'licenseFront',
  'licenseBack',
  'selfieWithLicense',
  'vehicleRegistration',
  'truckExterior',
  'truckInterior',
  'vehicleInfo',
  'referralCode',  // не required
];

export const REQUIRED_ITEMS = VERIFICATION_ITEMS.filter((k) => k !== 'referralCode');

// Returns the icon used by the dashboard for each item.
export const ITEM_ICON = {
  personalData:        '👤',
  personalPhoto:       '🤳',
  licenseFront:        '📄',
  licenseBack:         '📄',
  selfieWithLicense:   '🪪',
  vehicleRegistration: '📋',
  truckExterior:       '🚛',
  truckInterior:       '🪑',
  vehicleInfo:         '🚚',
  referralCode:        '🎟',
};

const isFilled = (v) => v != null && v !== '';

const personalDataFilled = (raw) =>
  isFilled(raw?.full_name) && isFilled(raw?.iin) && isFilled(raw?.birth_date);

const vehicleInfoFilled = (raw) =>
  isFilled(raw?.vehicle_brand) && isFilled(raw?.vehicle_model) && isFilled(raw?.vehicle_plate);

const itemReason = (raw, key) => {
  // backend может хранить причины в `rejection_reasons` (JSON map) или
  // плоских полях `<item>_rejection_reason`. Берём первое что попадётся.
  const map = raw?.rejection_reasons || {};
  if (map && typeof map === 'object' && map[key]) return String(map[key]);
  const flat = raw?.[`${key}_rejection_reason`];
  if (flat) return String(flat);
  return null;
};

const itemStatus = (raw, key) => {
  // Глобальный статус доминирует — если бэк сказал approved/rejected,
  // отдельные поля наследуют статус. rejected — только если у item'а
  // есть собственная причина (т.е. модератор отметил его как «нужно
  // переснять»); иначе — pending_review.
  const globalStatus = raw?.status || 'pending';
  const reason = itemReason(raw, key);

  // 1) если есть локальная rejection_reason → rejected всегда
  if (reason) return 'rejected';

  // 2) approved global → approved (если данные заполнены)
  if (globalStatus === 'approved') return 'approved';

  // 3) под review → pending_review
  if (globalStatus === 'under_review' || globalStatus === 'manual_review') {
    return 'pending_review';
  }

  // 4) В прочих случаях смотрим конкретное содержимое
  switch (key) {
    case 'personalData':
      return personalDataFilled(raw) ? 'uploaded' : 'missing';
    case 'personalPhoto':
      return raw?.has_selfie || raw?.has_photo ? 'uploaded' : 'missing';
    case 'licenseFront':
      return raw?.has_license || raw?.has_license_front ? 'uploaded' : 'missing';
    case 'licenseBack':
      return raw?.has_license_back ? 'uploaded' : 'missing';
    case 'selfieWithLicense':
      return raw?.has_license_selfie ? 'uploaded' : 'missing';
    case 'vehicleRegistration':
      return raw?.has_passport || raw?.has_srts ? 'uploaded' : 'missing';
    case 'truckExterior':
      return raw?.has_vehicle_photo ? 'uploaded' : 'missing';
    case 'truckInterior':
      return raw?.has_cabin_photo ? 'uploaded' : 'missing';
    case 'vehicleInfo':
      return vehicleInfoFilled(raw) ? 'uploaded' : 'missing';
    case 'referralCode':
      return isFilled(raw?.referral_code) ? 'uploaded' : 'missing';
    default:
      return 'missing';
  }
};

export const buildVerificationModel = (raw = {}) => {
  const model = {};
  for (const key of VERIFICATION_ITEMS) {
    model[key] = {
      status: itemStatus(raw, key),
      rejectionReason: itemReason(raw, key),
    };
  }
  return model;
};

export const verificationProgress = (model) => {
  const required = REQUIRED_ITEMS;
  let done = 0;
  for (const key of required) {
    const st = model?.[key]?.status;
    if (st === 'uploaded' || st === 'pending_review' || st === 'approved') done++;
  }
  return { done, total: required.length };
};

export const canSubmitForReview = (model) => {
  const { done, total } = verificationProgress(model);
  if (done < total) return false;
  // Нельзя дважды отправлять, если уже на проверке/одобрен.
  for (const key of REQUIRED_ITEMS) {
    const st = model?.[key]?.status;
    if (st === 'pending_review' || st === 'approved') {
      // Уже в процессе — кнопка submit прячется (см. dashboard).
      return false;
    }
  }
  return true;
};

// «Глобальный» статус, который dashboard использует чтобы определить
// какой экран показывать (dashboard / pending / approved / rejected).
export const overallStatus = (rawStatus, model) => {
  if (rawStatus === 'approved') return 'approved';
  if (rawStatus === 'under_review' || rawStatus === 'manual_review') return 'pending_review';
  if (rawStatus === 'rejected') {
    // backend сказал «отклонено» — но если все карточки одобрены, это
    // означает «один шаг переотправить»; экран корректировок сам
    // отрисует rejected-карты.
    return 'rejected';
  }
  // По умолчанию — собирает документы.
  return 'collecting';
};
