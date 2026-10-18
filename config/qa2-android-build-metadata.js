/**
 * The single release identity for a distributable QA2 Android build.
 *
 * Keep this separate from production Android metadata: QA2 artifacts are
 * installed directly on physical test devices and never submitted to Play.
 */
// PR561+562 candidate 211040114 is installed on Xiaomi and OPPO.
// Advance so the merged review fixes can be installed as a real in-place update.
const QA2_ANDROID_PREVIOUS_VERSION_CODE = 211040114;
const QA2_ANDROID_VERSION_CODE = 211040115;

if (!Number.isSafeInteger(QA2_ANDROID_VERSION_CODE)
  || QA2_ANDROID_VERSION_CODE <= QA2_ANDROID_PREVIOUS_VERSION_CODE) {
  throw new Error('QA2 Android versionCode must be a safe integer greater than the previous QA2 release');
}

module.exports = {
  QA2_ANDROID_PREVIOUS_VERSION_CODE,
  QA2_ANDROID_VERSION_CODE,
};
