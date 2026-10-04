/**
 * The single release identity for a distributable QA2 Android build.
 *
 * Keep this separate from production Android metadata: QA2 artifacts are
 * installed directly on physical test devices and never submitted to Play.
 */
// 211040100 установлен на обоих QA2 Xiaomi. Базовый номер должен совпадать
// с физической целью обновления, чтобы новый APK устанавливался через
// `adb install -r`.
const QA2_ANDROID_PREVIOUS_VERSION_CODE = 211040100;
const QA2_ANDROID_VERSION_CODE = 211040101;

if (!Number.isSafeInteger(QA2_ANDROID_VERSION_CODE)
  || QA2_ANDROID_VERSION_CODE <= QA2_ANDROID_PREVIOUS_VERSION_CODE) {
  throw new Error('QA2 Android versionCode must be a safe integer greater than the previous QA2 release');
}

module.exports = {
  QA2_ANDROID_PREVIOUS_VERSION_CODE,
  QA2_ANDROID_VERSION_CODE,
};
