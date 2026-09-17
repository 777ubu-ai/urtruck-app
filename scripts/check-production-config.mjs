const beta = process.env.EXPO_PUBLIC_IS_BETA;
const profile = process.env.EAS_BUILD_PROFILE || process.env.EAS_PROFILE || '';

if (profile === 'production' && beta !== 'false') {
  console.error('[release-gate] production requires EXPO_PUBLIC_IS_BETA=false');
  process.exit(1);
}

console.log(`[release-gate] profile=${profile || 'unspecified'} EXPO_PUBLIC_IS_BETA=${beta ?? 'unset'}`);
