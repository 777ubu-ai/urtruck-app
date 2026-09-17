// Нативная версия принадлежит установленному APK/IPA, а не соседней платформе.
export function appVersionLabel(application = {}, config = {}, platform, commit) {
  const version = application?.nativeApplicationVersion || config?.version;
  const build = application?.nativeBuildVersion || (platform === 'android'
    ? config?.android?.versionCode : platform === 'ios' ? config?.ios?.buildNumber : null);
  if (!version) return '—';
  return `v${version}${build ? ` (${build})` : ''}${commit ? ` · Build: ${commit}` : ''}`;
}
